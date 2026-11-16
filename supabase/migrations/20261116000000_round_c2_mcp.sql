-- ROUND-C2: the Claude connector (MCP). Only the server (service role)
-- reads and writes these tables; RLS is on and nothing is granted to
-- people, the same pattern as workspace_registry. Tokens are never stored,
-- only their sha256.

-- Clients Claude registered (OAuth dynamic client registration).
create table public.mcp_clients (
  id text primary key check (char_length(id) between 8 and 80),
  name text not null check (char_length(name) <= 200),
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);
alter table public.mcp_clients enable row level security;
revoke all on public.mcp_clients from public, anon, authenticated;
grant all on public.mcp_clients to service_role;

-- ROUND-C3 (0.3): OAuth consents waiting for Allow (30 minutes) and
-- authorization codes (5 minutes, single use, kept by their sha256), so a
-- server restart ends neither. This migration has not been applied anywhere
-- yet, so the table is added here. Server only.
create table public.mcp_grants (
  key text primary key check (char_length(key) between 8 and 128),
  kind text not null check (kind in ('consent', 'code')),
  data jsonb not null,
  expires_at timestamptz not null
);
create index mcp_grants_expiry on public.mcp_grants (expires_at);
alter table public.mcp_grants enable row level security;
revoke all on public.mcp_grants from public, anon, authenticated;
grant all on public.mcp_grants to service_role;

-- One row per person and Claude connection.
create table public.mcp_connections (
  id text primary key check (char_length(id) between 8 and 80),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null references public.mcp_clients (id) on delete cascade,
  client_name text not null check (char_length(client_name) <= 200),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  access_hash text not null check (access_hash ~ '^[0-9a-f]{64}$'),
  access_exp bigint not null,
  refresh_hash text not null check (refresh_hash ~ '^[0-9a-f]{64}$')
);
create index mcp_connections_user on public.mcp_connections (user_id);
alter table public.mcp_connections enable row level security;
revoke all on public.mcp_connections from public, anon, authenticated;
grant all on public.mcp_connections to service_role;

-- Projects and Videos made or continued through the connector (names,
-- brief answers, plan, Video sheet, Project memory). The editor files stay
-- in public.projects.
create table public.mcp_workspace (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc jsonb not null default '{"projects": {}}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.mcp_workspace enable row level security;
revoke all on public.mcp_workspace from public, anon, authenticated;
grant all on public.mcp_workspace to service_role;

-- Media the server imports for a person keep where they came from.
alter table public.media
  add column provider text check (provider is null or char_length(provider) <= 80),
  add column licence text check (licence is null or char_length(licence) <= 200),
  add column attribution text check (attribution is null or char_length(attribution) <= 500);

-- Usage rows of connector calls are marked (Admin › MCP › Last 50 calls).
alter table public.usage_log
  add column source text check (source is null or source in ('mcp'));
