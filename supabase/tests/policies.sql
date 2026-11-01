-- Phase 1 policy tests (docs/PHASE1-PLAN.md): a signed-in person reads and
-- changes only their own projects, media rows and storage files; a visitor
-- who is not signed in sees nothing. Runs as plain SQL; every failure raises
-- an exception (scripts/cloud-sql-test.mjs, or `psql -f` on a Supabase db).
begin;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'asha@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'ravi@example.com');

-- As Asha.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.projects (id, name, schema_version, document)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Asha lesson', 9, '{"schemaVersion":9}');
insert into public.media (fingerprint, name, mime_type, size)
values ('0123456789abcdef0123456789abcdef', 'clip.mp4', 'video/mp4', 1000);
insert into storage.objects (bucket_id, name)
values ('media', '11111111-1111-1111-1111-111111111111/0123456789abcdef0123456789abcdef');

do $$
declare
  owner uuid;
  rev integer;
begin
  select owner_id, revision into owner, rev from public.projects
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if owner <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'owner_id was not filled from auth.uid()';
  end if;
  if rev <> 1 then raise exception 'a new project starts at revision 1'; end if;
  -- A save bumps the revision; a save naming an old revision changes nothing.
  update public.projects set document = '{"schemaVersion":9,"v":2}'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001' and revision = 1;
  select revision into rev from public.projects
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if rev <> 2 then raise exception 'save did not bump the revision (got %)', rev; end if;
  update public.projects set document = '{"stale":true}'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001' and revision = 1;
  if exists (select 1 from public.projects where document = '{"stale":true}') then
    raise exception 'a stale save overwrote the project';
  end if;
  -- Asha cannot write a project or a file for someone else.
  begin
    insert into public.projects (owner_id, name, schema_version, document)
    values ('22222222-2222-2222-2222-222222222222', 'Forged', 9, '{}');
    raise exception 'inserted a project owned by someone else';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name)
    values ('media', '22222222-2222-2222-2222-222222222222/ffffffffffffffffffffffffffffffff');
    raise exception 'uploaded into someone else''s folder';
  exception when insufficient_privilege then null;
  end;
  -- Changing the owner of one's own project is ignored (the trigger keeps it).
  update public.projects set owner_id = '22222222-2222-2222-2222-222222222222'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if not exists (select 1 from public.projects
    where id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and owner_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'the owner of a project changed';
  end if;
end $$;

-- As Ravi: Asha's rows and files are invisible and untouchable.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$
declare
  n integer;
begin
  select count(*) into n from public.projects;
  if n <> 0 then raise exception 'Ravi sees % projects of Asha', n; end if;
  select count(*) into n from public.media;
  if n <> 0 then raise exception 'Ravi sees Asha''s media rows'; end if;
  select count(*) into n from storage.objects where bucket_id = 'media';
  if n <> 0 then raise exception 'Ravi sees Asha''s files'; end if;
  update public.projects set name = 'Hacked'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  delete from public.projects where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  delete from storage.objects where bucket_id = 'media';
end $$;

-- A visitor who is not signed in has no access at all.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform 1 from public.projects;
    raise exception 'anon can read projects';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.media;
    raise exception 'anon can read media';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Back as Asha: her project and file are untouched by Ravi's attempts.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
begin
  if not exists (select 1 from public.projects
    where id = 'aaaaaaaa-0000-0000-0000-000000000001' and name = 'Asha lesson') then
    raise exception 'Ravi changed or deleted Asha''s project';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'media') <> 1 then
    raise exception 'Ravi deleted Asha''s file';
  end if;
  -- Asha can delete her own project.
  delete from public.projects where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if exists (select 1 from public.projects) then
    raise exception 'Asha could not delete her own project';
  end if;
end $$;
-- P1-31: training-data records follow the same owner rule.
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.training_records (project_id, brief, plan, edits)
values ('local-1', 'A short lesson', '{"format":"video-plan"}',
  '[{"at":"2026-10-26T10:00:00Z","label":"Move","commands":["SET_PROPERTY"]}]');
do $$
begin
  if (select owner_id from public.training_records where project_id = 'local-1')
    <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'training record owner was not filled from auth.uid()';
  end if;
  begin
    insert into public.training_records (owner_id, project_id, plan)
    values ('22222222-2222-2222-2222-222222222222', 'forged', '{}');
    raise exception 'inserted a training record owned by someone else';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$
declare
  n integer;
begin
  select count(*) into n from public.training_records;
  if n <> 0 then raise exception 'Ravi sees Asha''s training records'; end if;
  update public.training_records set brief = 'Hacked';
  delete from public.training_records;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform 1 from public.training_records;
    raise exception 'anon can read training records';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
begin
  if not exists (select 1 from public.training_records
    where project_id = 'local-1' and brief = 'A short lesson') then
    raise exception 'Ravi changed or deleted Asha''s training record';
  end if;
end $$;
rollback;
select 'policy tests passed' as result;
