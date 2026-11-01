-- P2-R2 (P2B-09, P2B-11): the gateway server's tables. People read their own
-- rows; only the server (the service role) writes credits, usage, exports and
-- counters; the credit ledger is append-only for everyone. The live Platform
-- Config row is readable by everyone; only an admin writes config versions.

-- Profiles: made by a trigger when a person signs up (P2B-11). The server
-- grants the plan's monthly credits on the first call (the amount comes from
-- the live config, which SQL does not read).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan text not null default 'free',
  locale text not null default 'en' check (locale in ('en', 'hi')),
  brand_kit jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles: owner reads" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "profiles: owner updates" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
grant select on public.profiles to authenticated;
-- A person may change their language and brand kit, never their plan.
grant update (locale, brand_kit) on public.profiles to authenticated;
grant all on public.profiles to service_role;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- The credit ledger: append-only rows, one idempotency key per person.
create table public.credit_ledger (
  seq bigint generated always as identity primary key,
  id text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('grant', 'reserve', 'settle', 'refund', 'adjust')),
  delta integer not null,
  used integer,
  reservation_id text,
  key text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, key)
);
create index credit_ledger_user on public.credit_ledger (user_id, seq);
alter table public.credit_ledger enable row level security;
create policy "ledger: owner reads" on public.credit_ledger
  for select to authenticated using (auth.uid() = user_id);
grant select on public.credit_ledger to authenticated;
grant select, insert on public.credit_ledger to service_role;
create function public.ledger_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'The credit ledger is append-only';
end
$$;
create trigger credit_ledger_append_only before update or delete on public.credit_ledger
  for each row execute function public.ledger_is_append_only();

-- Usage log: one row per gateway call.
create table public.usage_log (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  model_id text not null,
  role text not null,
  credits integer not null default 0,
  ms integer not null default 0,
  outcome text not null check (outcome in ('ok', 'failed', 'refused')),
  code text,
  created_at timestamptz not null default now()
);
create index usage_log_user on public.usage_log (user_id, created_at);
alter table public.usage_log enable row level security;
create policy "usage: owner reads" on public.usage_log
  for select to authenticated using (auth.uid() = user_id);
grant select on public.usage_log to authenticated;
grant select, insert, update on public.usage_log to service_role;

-- Exports, counted per person per month (P2B-25).
create table public.exports_count (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  kind text not null,
  created_at timestamptz not null default now()
);
create index exports_count_user on public.exports_count (user_id, month);
alter table public.exports_count enable row level security;
create policy "exports: owner reads" on public.exports_count
  for select to authenticated using (auth.uid() = user_id);
grant select on public.exports_count to authenticated;
grant select, insert on public.exports_count to service_role;

-- Counters the limits use: storage, cloned voices, projects.
create table public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name in ('storageMb', 'voiceClones', 'projects')),
  value numeric not null default 0 check (value >= 0),
  primary key (user_id, name)
);
alter table public.usage_counters enable row level security;
create policy "counters: owner reads" on public.usage_counters
  for select to authenticated using (auth.uid() = user_id);
grant select on public.usage_counters to authenticated;
grant all on public.usage_counters to service_role;

-- Platform Config versions (P2B-14): the live one is public, an admin writes.
create table public.config_versions (
  version integer primary key check (version > 0),
  config jsonb not null,
  note text not null default '',
  saved_at timestamptz not null default now(),
  live boolean not null default false
);
create unique index config_versions_one_live on public.config_versions (live) where live;
alter table public.config_versions enable row level security;
create policy "config: everyone reads the live version" on public.config_versions
  for select to anon, authenticated using (live);
create policy "config: admins read every version" on public.config_versions
  for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "config: admins add versions" on public.config_versions
  for insert to authenticated with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' and not live);
grant select on public.config_versions to anon, authenticated;
grant insert on public.config_versions to authenticated;
grant all on public.config_versions to service_role;

-- Publishing: one live version at a time (0 = the built-in default).
create function public.set_live_config(target integer) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Only an admin can publish settings' using errcode = '42501';
  end if;
  if target <> 0 and not exists (select 1 from public.config_versions where version = target) then
    raise exception 'No config version %', target;
  end if;
  update public.config_versions set live = false where live and version <> target;
  update public.config_versions set live = true where version = target;
end
$$;
revoke execute on function public.set_live_config(integer) from public, anon;
grant execute on function public.set_live_config(integer) to authenticated, service_role;
