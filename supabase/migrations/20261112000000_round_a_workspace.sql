-- ROUND-A: the server's record of each person's Projects and Videos (ids and
-- Trash state only), so the plan's limits on projects and on videos per
-- project are decided by the gateway, never by the browser. Only the server
-- (service role) reads and writes it; a person cannot change their own row.
create table public.workspace_registry (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc jsonb not null default '{"projects": {}}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.workspace_registry enable row level security;
revoke all on public.workspace_registry from public, anon, authenticated;
grant all on public.workspace_registry to service_role;
