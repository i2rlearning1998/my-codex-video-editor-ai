-- P4 Part 2: AI compositions and My Templates of every project, kept in the
-- person's own cloud. Row-level security: a person sees and changes only their
-- own rows. JSON text only, never media bytes (D-004). `bytes` counts against
-- the plan's storage (the server-side limit is added in the security round).
create table public.library_items (
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  project_id text check (project_id is null or char_length(project_id) <= 200),
  kind text not null check (kind in ('ai', 'templates')),
  name text not null check (char_length(name) between 1 and 200),
  document text not null check (char_length(document) <= 5000000),
  thumbnail text check (thumbnail is null or char_length(thumbnail) <= 400000),
  bytes integer not null default 0 check (bytes >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);
create index library_items_owner_kind on public.library_items (owner_id, kind);

create function public.library_items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.bytes := char_length(new.document) + coalesce(char_length(new.thumbnail), 0);
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.owner_id := old.owner_id;
  end if;
  return new;
end;
$$;
create trigger library_items_before_write
  before insert or update on public.library_items
  for each row execute function public.library_items_before_write();

alter table public.library_items enable row level security;
create policy "library: owner reads" on public.library_items
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "library: owner creates" on public.library_items
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "library: owner updates" on public.library_items
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "library: owner deletes" on public.library_items
  for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.library_items from anon;
grant select, insert, update, delete on public.library_items to authenticated;

-- What the signed-in person's cloud holds, counted on the server (RLS applies:
-- security invoker), so the browser never downloads documents to measure them.
create function public.my_usage()
returns table (bytes bigint, projects bigint, media bigint, library bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce((select sum(char_length(document) + coalesce(char_length(thumbnail), 0)) from public.projects), 0)
    + coalesce((select sum(size) from public.media), 0)
    + coalesce((select sum(bytes) from public.library_items), 0),
    (select count(*) from public.projects),
    (select count(*) from public.media),
    (select count(*) from public.library_items);
$$;
revoke all on function public.my_usage() from public, anon;
grant execute on function public.my_usage() to authenticated;
