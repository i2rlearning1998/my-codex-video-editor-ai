-- ROUND-C5 (3.3, 3.4): the owner's personal and cohort overrides and the
-- cohorts (emails), in one row read and written only by the server (service
-- role). Nobody else may read it: it holds emails and the owner's notes.
create table if not exists public.access_rules (
  id text primary key check (id = 'main'),
  data jsonb not null default '{"overrides": [], "cohorts": []}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.access_rules enable row level security;
-- No policy for anon or authenticated: only the service role (which skips
-- row-level security) reads and writes it.
revoke all on public.access_rules from anon, authenticated;
