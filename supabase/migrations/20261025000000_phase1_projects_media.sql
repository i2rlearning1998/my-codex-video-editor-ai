-- Phase 1 (docs/PHASE1-PLAN.md): cloud projects and media for signed-in
-- people. Row-level security: a person sees and changes only their own rows
-- and only the files inside their own storage folder.

-- Projects: the editor's project JSON exactly as it serialises it (never
-- media bytes, D-004). `revision` makes every save name the revision it
-- started from, so no save silently overwrites another.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  schema_version integer not null check (schema_version > 0),
  document text not null check (char_length(document) <= 20000000),
  thumbnail text check (thumbnail is null or char_length(thumbnail) <= 400000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_updated on public.projects (owner_id, updated_at desc);

-- A save bumps the revision and the time; the owner never changes.
create function public.projects_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.document is distinct from old.document
    or new.name is distinct from old.name
    or new.thumbnail is distinct from old.thumbnail then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  return new;
end;
$$;
create trigger projects_before_update
  before update on public.projects
  for each row execute function public.projects_before_update();

alter table public.projects enable row level security;
create policy "projects: owner reads" on public.projects
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "projects: owner creates" on public.projects
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "projects: owner updates" on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "projects: owner deletes" on public.projects
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Media: one row per file a person uploaded, keyed by the editor's content
-- fingerprint (D-052). The bytes are in the `media` bucket at
-- `<owner id>/<fingerprint>`.
create table public.media (
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  name text not null check (char_length(name) between 1 and 300),
  mime_type text not null check (char_length(mime_type) <= 120),
  size bigint not null check (size >= 0),
  created_at timestamptz not null default now(),
  primary key (owner_id, fingerprint)
);
alter table public.media enable row level security;
create policy "media: owner reads" on public.media
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "media: owner creates" on public.media
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "media: owner updates" on public.media
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "media: owner deletes" on public.media
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Anonymous visitors have no access at all.
revoke all on public.projects, public.media from anon;
grant select, insert, update, delete on public.projects, public.media
  to authenticated;

-- The private bucket and its folder rules.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 1073741824)
on conflict (id) do nothing;

create policy "media bucket: owner reads" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "media bucket: owner uploads" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "media bucket: owner replaces" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "media bucket: owner deletes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
