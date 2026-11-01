// P2-R2 Part B: Supabase wiring tested without a live project.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONFIG_CACHE_KEY,
  defaultConfig,
  serverConfigSource,
  supabaseConfigSource,
} from '../../src/platform-config';
import { storeConfig } from '../../server/config';
import { memoryStore } from '../../server/store';

const kv = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
};
const migration = readFileSync(
  'supabase/migrations/20261101000000_phase2_gateway.sql',
  'utf8',
);
const pg = [
  '/usr/lib/postgresql/17/bin',
  '/usr/lib/postgresql/16/bin',
  '/usr/lib/postgresql/15/bin',
].some((d) => existsSync(`${d}/initdb`));

describe('P2-R2 Supabase wiring', () => {
  it.skipIf(!pg)(
    '[P2R2-009] [P2R2-010] [P2R2-011] the gateway tables, row-level security and the sign-up trigger pass the SQL policy tests',
    () => {
      const out = execFileSync('node', ['scripts/cloud-sql-test.mjs'], {
        encoding: 'utf8',
      });
      expect(out).toContain('policy tests passed');
    },
    120_000,
  );

  it('[P2R2-009] [P2R2-010] [P2R2-011] the migration: tables, owner-only reads, server-only writes, append-only ledger, profile trigger, admin-only config writes', () => {
    for (const table of [
      'profiles',
      'credit_ledger',
      'usage_log',
      'config_versions',
      'exports_count',
      'usage_counters',
    ])
      expect(migration).toContain(
        `alter table public.${table} enable row level security;`,
      );
    expect(migration).toMatch(/unique \(user_id, key\)/);
    expect(migration).toMatch(
      /create trigger credit_ledger_append_only before update or delete/,
    );
    expect(migration).toMatch(
      /create trigger on_auth_user_created after insert on auth.users/,
    );
    expect(migration).not.toMatch(
      /grant (insert|update|delete)[^;]*credit_ledger to authenticated/,
    );
    expect(migration).toMatch(
      /grant update \(locale, brand_kit\) on public.profiles to authenticated/,
    );
  });

  it('[P2R2-014] the cloud config: live from Supabase or the server, cached by version, last good copy, then the default; writes refused when invalid', async () => {
    const storage = kv();
    const good = defaultConfig();
    good.brand.name = 'Cloud brand';
    let answer: { status: number; body: unknown } = {
      status: 200,
      body: [{ version: 4, config: good, live: true }],
    };
    const calls: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push(
        `${init?.method ?? 'GET'} ${url.replace(/^https:\/\/x\.supabase\.co/, '')}`,
      );
      return new Response(JSON.stringify(answer.body), {
        status: answer.status,
      });
    }) as typeof fetch;
    const src = supabaseConfigSource({
      url: 'https://x.supabase.co',
      anonKey: 'anon',
      storage,
      fetch: fakeFetch,
    });
    expect((await src.getLive()).config.brand.name).toBe('Cloud brand');
    expect(calls[0]).toBe('GET /rest/v1/config_versions?select=*&live=eq.true');
    expect(JSON.parse(storage.m.get(CONFIG_CACHE_KEY)!).version).toBe(4);
    // The cloud fails: the last good copy.
    answer = { status: 500, body: {} };
    expect((await src.getLive()).version).toBe(4);
    // A broken live version: still the last good copy.
    answer = {
      status: 200,
      body: [{ version: 5, config: { nope: 1 }, live: true }],
    };
    expect((await src.getLive()).version).toBe(4);
    // Nothing cached and nothing live: the built-in default.
    const empty = supabaseConfigSource({
      url: 'https://x.supabase.co',
      anonKey: 'anon',
      storage: kv(),
      fetch: (async () => new Response('[]')) as typeof fetch,
    });
    expect((await empty.getLive()).version).toBe(0);
    await expect(src.save({ nope: 1 }, 'bad')).rejects.toThrow(
      /Config refused/,
    );
    answer = { status: 200, body: [] };
    await src.publish(4);
    expect(calls.at(-2)).toBe('POST /rest/v1/rpc/set_live_config');
    // The server's /v1/config, same fallbacks.
    const server = serverConfigSource({
      base: 'http://gw',
      storage: kv(),
      fetch: (async () =>
        new Response(
          JSON.stringify({ version: 2, config: good }),
        )) as typeof fetch,
    });
    expect((await server.getLive()).config.brand.name).toBe('Cloud brand');
    // The server's own copy (Store): cached by version, a broken one keeps the last good.
    const store = memoryStore();
    const cfg = storeConfig(store);
    await cfg.save(good, 'v1', true);
    expect((await cfg.refresh()).config.brand.name).toBe('Cloud brand');
    await store.saveConfigVersion({
      version: 2,
      savedAt: 'x',
      note: 'broken',
      config: { nope: 1 } as never,
    });
    await store.setLiveConfig(2);
    expect((await cfg.refresh()).version).toBe(1);
  });

  it('[P2R2-015] keys:check lists every variable by name and never prints a value; .env.example and docs/KEYS.md name them all', () => {
    const r = spawnSync('node', ['scripts/keys-check.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, ANTHROPIC_API_KEY: 'sk-secret-value-123' },
    });
    expect(r.stdout).toMatch(/present\s+ANTHROPIC_API_KEY/);
    expect(r.stdout).toMatch(/missing\s+OPENAI_API_KEY/);
    expect(r.stdout).not.toContain('sk-secret-value-123');
    const names = (
      JSON.parse(readFileSync('scripts/keys.json', 'utf8')) as {
        name: string;
      }[]
    ).map((k) => k.name);
    for (const n of [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_JWT_SECRET',
      'VITE_GATEWAY_URL',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GEMINI_API_KEY',
      'XAI_API_KEY',
      'ELEVENLABS_API_KEY',
    ]) {
      expect(names).toContain(n);
      expect(readFileSync('.env.example', 'utf8')).toContain(`${n}=`);
      expect(readFileSync('docs/KEYS.md', 'utf8')).toContain(`\`${n}\``);
    }
    // Every keyRef in the config is documented.
    for (const p of defaultConfig().providers.filter((x) => x.kind !== 'mock'))
      expect(names).toContain(p.keyRef);
  });
});
