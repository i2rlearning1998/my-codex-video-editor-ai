-- P3 engine: service-role writes; append-only payment receipts and audit chain.
create extension if not exists pgcrypto;
alter table public.profiles add column suspended boolean not null default false;
create table public.payments (provider text not null, event_id text not null, user_id uuid not null references auth.users(id), record jsonb not null, primary key(provider,event_id));
create table public.audit_log (seq bigint primary key, record jsonb not null);
create table public.user_flags (user_id uuid primary key references auth.users(id), flags jsonb not null default '[]');
create table public.emergency_switches (id integer primary key check(id=1), value jsonb not null);
create table public.secrets (name text primary key, record jsonb not null);
create table public.daily_counters (user_id uuid not null, name text not null, day text not null, value integer not null, primary key(user_id,name,day));
create table public.p3_operations (key text primary key, fingerprint text not null, result jsonb);
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;
alter table public.user_flags enable row level security;
alter table public.emergency_switches enable row level security;
alter table public.secrets enable row level security;
alter table public.daily_counters enable row level security;
alter table public.p3_operations enable row level security;
create policy "payments: own or admin reads" on public.payments for select to authenticated using (auth.uid()=user_id or auth.jwt()->'app_metadata'->>'role'='admin');
create policy "audit: admins read" on public.audit_log for select to authenticated using (auth.jwt()->'app_metadata'->>'role'='admin');
create policy "flags: admins read" on public.user_flags for select to authenticated using (auth.jwt()->'app_metadata'->>'role'='admin');
grant select on public.payments,public.audit_log,public.user_flags to authenticated;
grant select,insert on public.payments,public.audit_log to service_role;
grant all on public.user_flags,public.emergency_switches,public.secrets,public.daily_counters,public.p3_operations to service_role;
create trigger audit_append_only before update or delete on public.audit_log for each row execute function public.ledger_is_append_only();
create trigger payments_append_only before update or delete on public.payments for each row execute function public.ledger_is_append_only();

create function public.p3_canonical(v jsonb) returns text language plpgsql immutable as $$
declare out text;
begin
 if jsonb_typeof(v)='object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.p3_canonical(value),',' order by key collate "C"),'')||'}' into out from jsonb_each(v);
 elsif jsonb_typeof(v)='array' then select '['||coalesce(string_agg(public.p3_canonical(value),',' order by ord),'')||']' into out from jsonb_array_elements(v) with ordinality a(value,ord);
 else out:=v::text; end if; return out;
end $$;
create function public.p3_append_audit(input jsonb) returns jsonb language plpgsql as $$
declare previous jsonb; row jsonb; n bigint;
begin
 perform pg_advisory_xact_lock(370001);
 select record into previous from public.audit_log order by seq desc limit 1;
 n:=coalesce((previous->>'seq')::bigint,0)+1;
 row:=input||jsonb_build_object('seq',n);
 row:=row||jsonb_build_object('hash',encode(digest(coalesce(previous->>'hash','')||public.p3_canonical(row),'sha256'),'hex'));
 insert into public.audit_log values(n,row); return row;
end $$;
create function public.p3_bump_daily(u uuid,n text,d text,cap integer) returns integer language plpgsql as $$
declare result integer;
begin
 insert into public.daily_counters values(u,n,d,0) on conflict do nothing;
 select value into result from public.daily_counters where user_id=u and name=n and day=d for update;
 if result>=cap then return -1; end if;
 update public.daily_counters set value=value+1 where user_id=u and name=n and day=d returning value into result;
 return result;
end $$;
create function public.p3_claim(k text,f text) returns jsonb language plpgsql as $$
declare op public.p3_operations; inserted boolean;
begin
 insert into public.p3_operations values(k,f,null) on conflict do nothing;
 inserted:=found;
 select * into op from public.p3_operations where key=k;
 if op.fingerprint<>f then raise exception 'Request key conflict'; end if;
 return jsonb_build_object('claimed',inserted,'operation',to_jsonb(op));
end $$;
create function public.p3_commit_payment(input jsonb) returns jsonb language plpgsql as $$
declare e jsonb:=input->'event'; u uuid:=(e->>'userId')::uuid; p text:=e->>'provider'; eid text:=e->>'eventId'; lk text:=input->>'ledgerKey'; v_delta integer:=0; wanted integer:=0; available integer; given integer; taken integer; receipt jsonb;
begin
 -- Same user lock for payment/adjust writes. Existing gateway inserts are additionally checked below.
 perform 1 from public.profiles where id=u for update;
 if not found then raise exception 'Unknown payment user'; end if;
 if exists(select 1 from public.payments where provider=p and event_id=eid) then return jsonb_build_object('applied',false,'duplicate',true,'creditsDelta',0); end if;
 select coalesce(sum(greatest((record->>'creditsDelta')::integer,0)),0),coalesce(sum(greatest(-(record->>'creditsDelta')::integer,0)),0) into given,taken from public.payments where provider=p and record->'event'->>'paymentId'=e->>'paymentId';
 select greatest(coalesce(sum(delta),0),0) into available from public.credit_ledger where user_id=u;
 if e->>'type'='refund.succeeded' and (input->>'revoke')::boolean then wanted:=greatest(given-taken,0);v_delta:=-least(wanted,available);
 elsif e->>'type' in ('payment.succeeded','subscription.renewed') and given=0 then v_delta:=(input->>'credits')::integer; end if;
 if exists(select 1 from public.credit_ledger where user_id=u and key=lk) then v_delta:=0; end if;
 if v_delta<>0 then
 insert into public.credit_ledger(id,user_id,type,delta,key,note,created_at) values('p3:'||p||':'||eid,u,case when v_delta>0 then 'grant' else 'adjust' end,v_delta,lk,'Verified payment accounting',(input->>'at')::timestamptz) on conflict(user_id,key) do nothing;
 if not found then v_delta:=0; end if;
 end if;
 receipt:=jsonb_build_object('event',e,'creditsDelta',v_delta,'shortfall',wanted+least(v_delta,0),'ledgerKey',lk,'at',input->>'at');
 insert into public.payments values(p,eid,u,receipt);
 if e->>'type'='subscription.renewed' then update public.profiles set plan=e->>'itemId' where id=u; end if;
 return jsonb_build_object('applied',true,'duplicate',false,'creditsDelta',v_delta);
end $$;
create function public.p3_admin_change(input jsonb) returns boolean language plpgsql as $$
declare claim jsonb; u uuid:=(input->>'userId')::uuid; f jsonb; available integer;
begin
 claim:=public.p3_claim(input->>'key',public.p3_canonical(input #- '{audit,at}'));
 if not (claim->>'claimed')::boolean then return false; end if;
 if u is not null then
 perform 1 from public.profiles where id=u for update; if not found then raise exception 'Unknown user'; end if;
 if input ? 'plan' then update public.profiles set plan=input->>'plan' where id=u; end if;
 if input ? 'suspended' then update public.profiles set suspended=(input->>'suspended')::boolean where id=u; end if;
 if input ? 'flag' then
 select coalesce(flags,'[]') into f from public.user_flags where user_id=u; f:=coalesce(f,'[]');
 select coalesce(jsonb_agg(value),'[]') into f from jsonb_array_elements(f) where value<>input->'flag'->'name';
 if (input->'flag'->>'on')::boolean then f:=f||jsonb_build_array(input->'flag'->>'name'); end if;
 insert into public.user_flags values(u,f) on conflict(user_id) do update set flags=excluded.flags;
 end if;
 if input ? 'delta' then
 select coalesce(sum(delta),0) into available from public.credit_ledger where user_id=u;
 if available+(input->>'delta')::integer<0 then raise exception 'Unavailable credits'; end if;
 insert into public.credit_ledger(id,user_id,type,delta,key,note,created_at) values(input->>'key',u,'adjust',(input->>'delta')::integer,input->>'key',input->'audit'->'detail'->>'reason',(input->'audit'->>'at')::timestamptz);
 end if;
 end if;
 if input ? 'emergency' then insert into public.emergency_switches values(1,input->'emergency') on conflict(id) do update set value=excluded.value; end if;
 perform public.p3_append_audit(input->'audit');
 update public.p3_operations set result='{"ok":true}' where key=input->>'key';
 return true;
end $$;
revoke all on function public.p3_append_audit(jsonb), public.p3_bump_daily(uuid,text,text,integer), public.p3_claim(text,text), public.p3_commit_payment(jsonb), public.p3_admin_change(jsonb) from public,anon,authenticated;
grant execute on function public.p3_append_audit(jsonb), public.p3_bump_daily(uuid,text,text,integer), public.p3_claim(text,text), public.p3_commit_payment(jsonb), public.p3_admin_change(jsonb) to service_role;

-- Keep gateway reservations and P3 revocations serialized on the same user.
create function public.p3_guard_balance() returns trigger language plpgsql as $$
declare available integer;
begin
 perform 1 from public.profiles where id=new.user_id for update;
 if new.delta<0 then
  select coalesce(sum(delta),0) into available from public.credit_ledger where user_id=new.user_id;
  if available+new.delta<0 then raise exception 'Unavailable credits'; end if;
 end if;
 return new;
end $$;
create trigger p3_balance_guard before insert on public.credit_ledger for each row execute function public.p3_guard_balance();
create function public.p3_finish(k text,r jsonb,a jsonb) returns void language plpgsql as $$
declare previous jsonb;
begin
 select result into previous from public.p3_operations where key=k for update;
 if not found then raise exception 'Unknown operation'; end if;
 if previous is not null then return; end if;
 update public.p3_operations set result=r where key=k;
 if a is not null then perform public.p3_append_audit(a); end if;
end $$;
revoke all on function public.p3_finish(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.p3_finish(text,jsonb,jsonb) to service_role;
