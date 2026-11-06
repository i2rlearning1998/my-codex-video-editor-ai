import type {
  PaymentRecord,
  SecretRecord,
  Operation,
} from './payments/records';
import { defaultEmergency } from './payments/records';
import type {
  AuditRow,
  EmergencySwitches,
  PaymentWebhookResult,
} from '../src/contracts/p3';
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
    async profiles() {
      const { data, error } = await db.from('profiles').select('*');
      fail('list profiles', error);
      return (data ?? []).map((r) => ({
        id: r.id,
        email: r.email ?? '',
        plan: r.plan,
        locale: r.locale,
        brandKit: r.brand_kit ?? {},
        createdAt: r.created_at,
        suspended: r.suspended ?? false,
      }));
    },
    async payments(u) {
      let q = db.from('payments').select('record');
      if (u !== undefined) q = q.eq('user_id', u);
      const { data, error } = await q;
      fail('read payments', error);
      return (data ?? []).map((r) => r.record as PaymentRecord);
    },
    async commitPayment(input) {
      const { data, error } = await db.rpc('p3_commit_payment', { input });
      fail('record payment', error);
      return data as PaymentWebhookResult;
    },
    async appendAudit(input) {
      const { data, error } = await db.rpc('p3_append_audit', { input });
      fail('append audit', error);
      return data as AuditRow;
    },
    async audit() {
      const { data, error } = await db
        .from('audit_log')
        .select('record')
        .order('seq');
      fail('read audit', error);
      return (data ?? []).map((r) => r.record as AuditRow);
    },
    async commitAdmin(input) {
      const { data, error } = await db.rpc('p3_admin_change', { input });
      fail('apply admin change', error);
      return data === true;
    },
    async flags(u) {
      const { data, error } = await db
        .from('user_flags')
        .select('flags')
        .eq('user_id', u)
        .maybeSingle();
      fail('read flags', error);
      return (data?.flags ?? []) as string[];
    },
    async emergency() {
      const { data, error } = await db
        .from('emergency_switches')
        .select('value')
        .eq('id', 1)
        .maybeSingle();
      fail('read emergency switches', error);
      return (data?.value ?? defaultEmergency()) as EmergencySwitches;
    },
    async putSecret(name, record) {
      const { error } = await db.from('secrets').upsert({ name, record });
      fail('save encrypted secret', error);
    },
    async getSecret(name) {
      const { data, error } = await db
        .from('secrets')
        .select('record')
        .eq('name', name)
        .maybeSingle();
      fail('read encrypted secret', error);
      return (data?.record ?? null) as SecretRecord | null;
    },
    async listSecrets() {
      const { data, error } = await db.from('secrets').select('name,record');
      fail('list encrypted secrets', error);
      return Object.fromEntries(
        (data ?? []).map((r) => [r.name, r.record as SecretRecord]),
      );
    },
    async deleteSecret(name) {
      const { error } = await db.from('secrets').delete().eq('name', name);
      fail('delete encrypted secret', error);
    },
    async dailyCount(u, name, day) {
      const { data, error } = await db
        .from('daily_counters')
        .select('value')
        .eq('user_id', u)
        .eq('name', name)
        .eq('day', day)
        .maybeSingle();
      fail('read daily count', error);
      return Number(data?.value ?? 0);
    },
    async bumpDaily(u, name, day, limit = 2147483647) {
      const { data, error } = await db.rpc('p3_bump_daily', {
        u,
        n: name,
        d: day,
        cap: Math.min(limit, 2147483647),
      });
      fail('count daily use', error);
      return Number(data);
    },
    async claimOperation(key, fingerprint) {
      const { data, error } = await db.rpc('p3_claim', {
        k: key,
        f: fingerprint,
      });
      fail('claim operation', error);
      return data as { claimed: boolean; operation: Operation };
    },
    async getOperation(key) {
      const { data, error } = await db
        .from('p3_operations')
        .select('*')
        .eq('key', key)
        .maybeSingle();
      fail('read operation', error);
      return data as Operation | null;
    },
    async finishOperation(key, result, audit) {
      const { error } = await db.rpc('p3_finish', {
        k: key,
        r: result,
        a: audit ?? null,
      });
      fail('finish operation', error);
    },
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
            suspended: data.suspended ?? false,
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
        suspended: p.suspended ?? false,
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
        ...(r.cost_usd !== null && r.cost_usd !== undefined
          ? { costUsd: Number(r.cost_usd) }
          : {}),
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
        cost_usd: row.costUsd ?? null,
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
    async measureUsage(u) {
      const { data, error } = await db.rpc('usage_of', { uid: u });
      fail('measure the storage', error);
      const row = (Array.isArray(data) ? data[0] : data) as
        | { bytes?: number | string; projects?: number | string }
        | null
        | undefined;
      return {
        storageMb: Math.ceil(Number(row?.bytes ?? 0) / 1_048_576),
        projects: Number(row?.projects ?? 0),
      };
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
