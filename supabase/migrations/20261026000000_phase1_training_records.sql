-- Phase 1 library brief, P1-31 (docs/PHASE1-PLAN.md): one training-data
-- record per AI-built video: the brief, the final plan JSON and the user's
-- later edits (command names with times). Collected now, used later; no UI.
-- Row-level security: a person sees and changes only their own records.
create table public.training_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  -- The editor's local project id (a cloud project may not exist).
  project_id text not null check (char_length(project_id) between 1 and 120),
  brief text check (brief is null or char_length(brief) <= 200000),
  plan jsonb not null,
  edits jsonb not null default '[]'::jsonb
    check (jsonb_typeof(edits) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, project_id)
);
create function public.training_records_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
create trigger training_records_before_update
  before update on public.training_records
  for each row execute function public.training_records_before_update();

alter table public.training_records enable row level security;
create policy "training: owner reads" on public.training_records
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "training: owner creates" on public.training_records
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "training: owner updates" on public.training_records
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "training: owner deletes" on public.training_records
  for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.training_records from anon;
grant select, insert, update, delete on public.training_records to authenticated;
