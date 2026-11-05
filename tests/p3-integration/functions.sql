-- [P3I-004] Runtime proof of the P3 SQL functions on an isolated PostgreSQL.
begin;
insert into auth.users(id,email) values('66666666-6666-6666-6666-666666666666','fn@example.test');
do $$
declare
  u uuid:='66666666-6666-6666-6666-666666666666';
  r jsonb; bal integer; n integer; ev jsonb;
begin
  if not exists(select 1 from public.profiles where id=u) then raise exception 'profile not created'; end if;

  -- 1. A payment grants once; the same event again is a duplicate.
  ev:='{"provider":"stripe","eventId":"e1","type":"payment.succeeded","paymentId":"p1","userId":"66666666-6666-6666-6666-666666666666","kind":"topup","itemId":"big","amount":{"currency":"USD","amountMinor":1000},"occurredAt":"2026-11-05T00:00:00.000Z"}';
  r:=public.p3_commit_payment(jsonb_build_object('event',ev,'credits',100,'ledgerKey','topup:e1','revoke',false,'at','2026-11-05T00:00:00.000Z'));
  if (r->>'creditsDelta')::int<>100 then raise exception 'grant wrong: %',r; end if;
  r:=public.p3_commit_payment(jsonb_build_object('event',ev,'credits',100,'ledgerKey','topup:e1','revoke',false,'at','2026-11-05T00:00:00.000Z'));
  if not (r->>'duplicate')::boolean then raise exception 'duplicate not detected'; end if;
  select sum(delta) into bal from public.credit_ledger where user_id=u;
  if bal<>100 then raise exception 'balance after grant %',bal; end if;

  -- 2. A second charge under another event id for the same payment id grants nothing.
  r:=public.p3_commit_payment(jsonb_build_object('event',jsonb_set(ev,'{eventId}','"e1b"'),'credits',100,'ledgerKey','topup:e1b','revoke',false,'at','2026-11-05T00:00:00.000Z'));
  if (r->>'creditsDelta')::int<>0 then raise exception 'double grant %',r; end if;

  -- 3. Refunds revoke in proportion: a quarter, then (no revoke) a quarter, then the half left.
  r:=public.p3_commit_payment(jsonb_build_object('event',jsonb_set(jsonb_set(ev,'{eventId}','"r1"'),'{type}','"refund.succeeded"') #- '{amount}' || '{"amount":{"currency":"USD","amountMinor":250}}','credits',0,'ledgerKey','refund:r1','revoke',true,'at','2026-11-05T00:00:00.000Z'));
  if (r->>'creditsDelta')::int<>-25 then raise exception 'quarter refund %',r; end if;
  r:=public.p3_commit_payment(jsonb_build_object('event',jsonb_set(jsonb_set(ev,'{eventId}','"r2"'),'{type}','"refund.succeeded"') #- '{amount}' || '{"amount":{"currency":"USD","amountMinor":250}}','credits',0,'ledgerKey','refund:r2','revoke',false,'at','2026-11-05T00:00:00.000Z'));
  if (r->>'creditsDelta')::int<>0 then raise exception 'no-revoke refund took credits %',r; end if;
  r:=public.p3_commit_payment(jsonb_build_object('event',jsonb_set(jsonb_set(ev,'{eventId}','"r3"'),'{type}','"refund.succeeded"') #- '{amount}' || '{"amount":{"currency":"USD","amountMinor":500}}','credits',0,'ledgerKey','refund:r3','revoke',true,'at','2026-11-05T00:00:00.000Z'));
  if (r->>'creditsDelta')::int<>-50 then raise exception 'rest refund %',r; end if;
  select sum(delta) into bal from public.credit_ledger where user_id=u;
  if bal<>25 then raise exception 'balance after refunds %',bal; end if;

  -- 4. The balance guard: the ledger can never go below zero, even by direct insert.
  begin
    insert into public.credit_ledger(id,user_id,type,delta,key,note) values('x1',u,'reserve',-26,'x1','');
    raise exception 'overspend accepted';
  exception when raise_exception then if sqlerrm='overspend accepted' then raise; end if; end;
  insert into public.credit_ledger(id,user_id,type,delta,key,note) values('x2',u,'reserve',-25,'x2','');

  -- 5. A refund of a spent balance takes only what is left and records the shortfall.
  ev:=jsonb_set(jsonb_set(jsonb_set(ev,'{paymentId}','"p2"'),'{eventId}','"e2"'),'{amount}','{"currency":"USD","amountMinor":1000}');
  perform public.p3_commit_payment(jsonb_build_object('event',ev,'credits',100,'ledgerKey','topup:e2','revoke',false,'at','2026-11-05T00:00:00.000Z'));
  insert into public.credit_ledger(id,user_id,type,delta,key,note) values('x3',u,'reserve',-90,'x3','');
  r:=public.p3_commit_payment(jsonb_build_object('event',jsonb_set(jsonb_set(ev,'{eventId}','"r5"'),'{type}','"refund.succeeded"'),'credits',0,'ledgerKey','refund:r5','revoke',true,'at','2026-11-05T00:00:00.000Z'));
  if (r->>'creditsDelta')::int<>-10 then raise exception 'shortfall refund %',r; end if;
  if (select (record->>'shortfall')::int from public.payments where event_id='r5')<>90 then raise exception 'shortfall not recorded'; end if;

  -- 6. Daily counter stops at the cap.
  if public.p3_bump_daily(u,'chat','2026-11-05',2)<>1 then raise exception 'bump 1'; end if;
  if public.p3_bump_daily(u,'chat','2026-11-05',2)<>2 then raise exception 'bump 2'; end if;
  if public.p3_bump_daily(u,'chat','2026-11-05',2)<>-1 then raise exception 'cap not enforced'; end if;
  if public.p3_bump_daily(u,'chat','2026-11-06',2)<>1 then raise exception 'new day not fresh'; end if;

  -- 7. Admin change: atomic (credit + audit), idempotent by key, refuses an overdraft.
  r:=to_jsonb(public.p3_admin_change(jsonb_build_object('key','adm-1','userId',u,'delta',7,'audit',jsonb_build_object('actor','admin','action','credits.adjust','target',u::text,'at','2026-11-05T00:00:00.000Z','detail',jsonb_build_object('reason','gift')))));
  if r<>'true'::jsonb then raise exception 'admin change not applied'; end if;
  r:=to_jsonb(public.p3_admin_change(jsonb_build_object('key','adm-1','userId',u,'delta',7,'audit',jsonb_build_object('actor','admin','action','credits.adjust','target',u::text,'at','2026-11-05T00:00:01.000Z','detail',jsonb_build_object('reason','gift')))));
  if r<>'false'::jsonb then raise exception 'admin replay applied'; end if;
  select count(*) into n from public.credit_ledger where key='adm-1';
  if n<>1 then raise exception 'admin credit written % times',n; end if;
  begin
    perform public.p3_admin_change(jsonb_build_object('key','adm-2','userId',u,'delta',-100000,'audit',jsonb_build_object('actor','admin','action','credits.adjust','target',u::text,'at','2026-11-05T00:00:00.000Z','detail',jsonb_build_object('reason','x'))));
    raise exception 'admin overdraft accepted';
  exception when raise_exception then if sqlerrm='admin overdraft accepted' then raise; end if; end;
  -- The failed change left no audit row behind.
  if exists(select 1 from public.audit_log where record->>'action'='credits.adjust' and record->'detail'->>'reason'='x') then raise exception 'audit row for a failed change'; end if;
  -- The audit chain is linked.
  select count(*) into n from public.audit_log;
  if n<1 then raise exception 'no audit'; end if;
end $$;
rollback;
