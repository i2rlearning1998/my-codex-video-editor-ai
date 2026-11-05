-- [P3E-055] Run after stub-supabase.sql and migrations in an isolated test DB.
begin;
insert into auth.users(id,email) values('44444444-4444-4444-4444-444444444444','p3a@example.test'),('55555555-5555-5555-5555-555555555555','p3b@example.test');
insert into public.payments values('stripe','fixture','55555555-5555-5555-5555-555555555555','{}');
insert into public.user_flags values('55555555-5555-5555-5555-555555555555','["beta"]');
select public.p3_append_audit('{"actor":"admin","action":"test","target":"","at":"2026-11-05T00:00:00.000Z","detail":{}}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.payments) then raise exception 'Another user payment was readable';end if;
 if exists(select 1 from public.audit_log) then raise exception 'Audit was readable by non-admin';end if;
 if exists(select 1 from public.user_flags) then raise exception 'Flags were readable by non-admin';end if;
 begin perform 1 from public.secrets;raise exception 'Secrets were readable';exception when insufficient_privilege then null;end;
 begin perform public.p3_append_audit('{}');raise exception 'Non-admin appended audit';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Even table owner cannot modify audit history.
do $$ begin
 begin update public.audit_log set record='{}';raise exception 'audit update accepted';exception when raise_exception then if sqlerrm='audit update accepted' then raise;end if;end;
 begin delete from public.audit_log;raise exception 'audit delete accepted';exception when raise_exception then if sqlerrm='audit delete accepted' then raise;end if;end;
end $$;
rollback;
