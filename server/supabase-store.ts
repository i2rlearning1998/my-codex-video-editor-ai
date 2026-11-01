// P2-R2 (P2B-03): the Store on Supabase, through supabase-js with the
// service-role key. That key lives only in the server's environment
// (SUPABASE_SERVICE_ROLE_KEY); it is never sent to a browser. Tables and
// policies: supabase/migrations/20261101000000_phase2_gateway.sql.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ConfigVersion } from '../src/platform-config';
import type { LedgerEntry, UsageRow } from '../src/gateway';
import {
  DuplicateKeyError,
  type CounterName,
  type Profile,
  type Store,
} from './store';

const fail = (what: string, e: { message?: string } | null) => {
  if (e) throw new Error(`The database could not ${what}.`);
};

export function supabaseStore(
  url: string,
  serviceRoleKey: string,
  client?: SupabaseClient,
): Store {
  const db =
    client ??
    createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  return {
    kind: 'supabase',
    async profile(u) {
      const { data, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', u)
        .maybeSingle();
      fail('read a profile', error);
      return data
        ? {
            id: data.id,
            email: data.email ?? '',
            plan: data.plan,
            locale: data.locale,
            brandKit: data.brand_kit ?? {},
            createdAt: data.created_at,
          }
        : null;
    },
    async saveProfile(p: Profile) {
      const { error } = await db.from('profiles').upsert({
        id: p.id,
        email: p.email,
        plan: p.plan,
        locale: p.locale,
        brand_kit: p.brandKit,
        created_at: p.createdAt,
      });
      fail('save a profile', error);
    },
    async ledger(u) {
      const { data, error } = await db
        .from('credit_ledger')
        .select('*')
        .eq('user_id', u)
        .order('seq');
      fail('read the credits', error);
      return (data ?? []).map((r): LedgerEntry => ({
        id: r.id,
        at: r.created_at,
        type: r.type,
        delta: r.delta,
        key: r.key,
        note: r.note ?? '',
        ...(r.used !== null ? { used: r.used } : {}),
        ...(r.reservation_id ? { reservationId: r.reservation_id } : {}),
      }));
    },
    async appendLedger(u, rows) {
      if (!rows.length) return;
      const { error } = await db.from('credit_ledger').insert(
        rows.map((r) => ({
          id: r.id,
          user_id: u,
          type: r.type,
          delta: r.delta,
          used: r.used ?? null,
          reservation_id: r.reservationId ?? null,
          key: r.key,
          note: r.note,
          created_at: r.at,
        })),
      );
      if ((error as { code?: string } | null)?.code === '23505')
        throw new DuplicateKeyError(rows[0]!.key);
      fail('write the credits', error);
    },
    async usage(u, since) {
      const { data, error } = await db
        .from('usage_log')
        .select('*')
        .eq('user_id', u)
        .gte('created_at', since);
      fail('read the usage', error);
      return (data ?? []).map((r): UsageRow => ({
        id: r.id,
        at: r.created_at,
        userId: r.user_id,
        modelId: r.model_id,
        role: r.role,
        credits: r.credits,
        ms: r.ms,
        outcome: r.outcome,
        ...(r.code ? { code: r.code } : {}),
      }));
    },
    async appendUsage(row) {
      const { error } = await db.from('usage_log').upsert({
        id: row.id,
        user_id: row.userId,
        model_id: row.modelId,
        role: row.role,
        credits: row.credits,
        ms: row.ms,
        outcome: row.outcome,
        code: row.code ?? null,
        created_at: row.at,
      });
      fail('write the usage', error);
    },
    async exportsCount(u, month) {
      const { count, error } = await db
        .from('exports_count')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', u)
        .eq('month', month);
      fail('count the exports', error);
      return count ?? 0;
    },
    async addExport(u, month, kind) {
      const { error } = await db
        .from('exports_count')
        .insert({ user_id: u, month, kind });
      fail('count the export', error);
      return this.exportsCount(u, month);
    },
    async counter(u, name: CounterName) {
      const { data, error } = await db
        .from('usage_counters')
        .select('value')
        .eq('user_id', u)
        .eq('name', name)
        .maybeSingle();
      fail('read a counter', error);
      return Number(data?.value ?? 0);
    },
    async setCounter(u, name: CounterName, value) {
      const { error } = await db
        .from('usage_counters')
        .upsert({ user_id: u, name, value: Math.max(0, value) });
      fail('write a counter', error);
    },
    async configVersions() {
      const { data, error } = await db
        .from('config_versions')
        .select('*')
        .order('version');
      fail('read the settings', error);
      return (data ?? []).map((r): ConfigVersion => ({
        version: r.version,
        savedAt: r.saved_at,
        note: r.note ?? '',
        config: r.config,
      }));
    },
    async liveConfigVersion() {
      const { data, error } = await db
        .from('config_versions')
        .select('version')
        .eq('live', true)
        .maybeSingle();
      fail('read the settings', error);
      return Number(data?.version ?? 0);
    },
    async saveConfigVersion(v) {
      const { error } = await db.from('config_versions').insert({
        version: v.version,
        config: v.config,
        note: v.note,
        saved_at: v.savedAt,
        live: false,
      });
      if ((error as { code?: string } | null)?.code === '23505')
        throw new DuplicateKeyError(`config ${v.version}`);
      fail('save the settings', error);
    },
    async setLiveConfig(version) {
      const { error } = await db.rpc('set_live_config', { target: version });
      fail('publish the settings', error);
    },
  };
}
