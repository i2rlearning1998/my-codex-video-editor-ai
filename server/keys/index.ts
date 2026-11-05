// P3-WIRING (W6): the key vault. Provider keys the owner pastes in Admin are
// encrypted at rest (AES-256-GCM, key from KEY_VAULT_SECRET, a random IV per
// value). Nothing ever returns a value: `list` gives the last four characters
// only. Only names that are a provider's `keyRef` in the config can be set or
// read, so the vault can never replace another server secret. The server's
// secret resolution reads the vault first, then the environment.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import type { AuditRow, KeyInfo, KeyVault } from '../../src/contracts/p3';
import { hasSecret } from '../../src/gateway/adapters/transport';
import type { GatewayRequest, ProviderAdapter } from '../../src/gateway/types';
import type { PlatformConfig, Provider } from '../../src/platform-config';

/**
 * One audit row as the vault gives it (CONTRACTS-P3 rev 1.3 note 9); Part 1's
 * audit log fills seq, hash and prevHash.
 */
export type VaultAudit = Omit<AuditRow, 'seq' | 'hash' | 'prevHash'>;
export type Env = Readonly<Record<string, string | undefined>>;

/**
 * A sealed value as the Store keeps it (CONTRACTS-P3 rev 1.2): opaque
 * strings; the Store never sees a plain value.
 */
export interface SecretRecord {
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
  readonly last4: string;
  readonly updatedAt: string;
}
/**
 * The Store's secret methods (Part 1 adds them to every Store, rev 1.2).
 * `listSecrets` is taken to return the stored names; the integrator
 * reconciles it with Part 1's final signature.
 */
export interface SecretStore {
  putSecret(name: string, record: SecretRecord): Promise<void>;
  getSecret(name: string): Promise<SecretRecord | null>;
  listSecrets(): Promise<readonly string[]>;
  deleteSecret(name: string): Promise<void>;
}
/** An in-memory stand-in with the same methods (tests, and a Store without them). */
export function memorySecretStore(): SecretStore & {
  /** Everything stored, as JSON (for tests that look for a plain value). */
  raw(): string;
} {
  const m = new Map<string, SecretRecord>();
  return {
    raw: () => JSON.stringify(Object.fromEntries(m)),
    putSecret: async (n, r) => void m.set(n, { ...r }),
    getSecret: async (n) => m.get(n) ?? null,
    listSecrets: async () => [...m.keys()].sort(),
    deleteSecret: async (n) => void m.delete(n),
  };
}
/** Whether a Store already has the secret methods (Part 1). */
export function hasSecretMethods(store: object): store is SecretStore {
  const s = store as Record<string, unknown>;
  return ['putSecret', 'getSecret', 'listSecrets', 'deleteSecret'].every(
    (k) => typeof s[k] === 'function',
  );
}

export class VaultError extends Error {
  constructor(
    readonly code:
      | 'no-secret'
      | 'wrong-secret'
      | 'unknown-name'
      | 'no-reason'
      | 'empty-value',
    message: string,
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

export interface VaultOptions {
  readonly config: () => PlatformConfig;
  /** The server's environment (the fallback for every name). */
  readonly env: Env;
  /** The server's adapters, for `test` (the provider's cheapest call). */
  readonly adapters?: (
    env: Env,
  ) => Partial<Record<Provider['kind'], ProviderAdapter>>;
  readonly now?: () => Date;
}

const keyFrom = (secret: string) =>
  createHash('sha256').update(`aive-key-vault:${secret}`).digest();
const NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
const hintOf = (v: string) => (v.length >= 8 ? v.slice(-4) : null);

export interface Vault extends KeyVault {
  /** Loads and decrypts once; call before the first resolve. */
  load(): Promise<void>;
  /** The value for a provider keyRef: vault first, then env. Server only. */
  resolve(name: string): string | undefined;
  /** An env view where provider keyRefs read the vault first. */
  env(): Env;
  /** The same vault, with `actor` on its audit rows. */
  as(actor: string): KeyVault;
  /** Whether the stored values could be read with this secret. */
  readonly state: () => 'empty' | 'ready' | 'no-secret' | 'wrong-secret';
}

/**
 * `createKeyVault(store, secret, audit)` (docs/CONTRACTS-P3.md 5b). The
 * fourth argument carries the config, env and adapters it also needs.
 */
export function createKeyVault(
  store: SecretStore,
  secret: string,
  audit: (row: VaultAudit) => void | Promise<void>,
  o: VaultOptions,
): Vault {
  const now = () => (o.now ?? (() => new Date()))();
  const key = secret ? keyFrom(secret) : null;
  const sealed = new Map<string, SecretRecord>();
  // Test results are kept while the server runs (the Store record has no field for them).
  const tests = new Map<string, NonNullable<KeyInfo['lastTest']>>();
  const plain = new Map<string, string>();
  let state: ReturnType<Vault['state']> = 'empty';
  let loaded: Promise<void> | null = null;

  const names = () => {
    const out = new Map<string, Provider>();
    for (const p of o.config().providers)
      if (p.kind !== 'mock' && !out.has(p.keyRef)) out.set(p.keyRef, p);
    return out;
  };
  const seal = (value: string): SecretRecord => {
    if (!key)
      throw new VaultError(
        'no-secret',
        'The key vault is off: the server needs KEY_VAULT_SECRET.',
      );
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([c.update(value, 'utf8'), c.final()]);
    return {
      ciphertext: enc.toString('base64'),
      iv: iv.toString('base64'),
      tag: c.getAuthTag().toString('base64'),
      last4: hintOf(value) ?? '',
      updatedAt: now().toISOString(),
    };
  };
  const open = (s: SecretRecord): string => {
    if (!key) throw new VaultError('no-secret', 'no secret');
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(s.iv, 'base64'));
    d.setAuthTag(Buffer.from(s.tag, 'base64'));
    return Buffer.concat([
      d.update(Buffer.from(s.ciphertext, 'base64')),
      d.final(),
    ]).toString('utf8');
  };
  async function load() {
    sealed.clear();
    plain.clear();
    for (const n of await store.listSecrets()) {
      const r = await store.getSecret(n);
      if (r) sealed.set(n, r);
    }
    if (!sealed.size) {
      state = 'empty';
      return;
    }
    if (!key) {
      state = 'no-secret';
      return;
    }
    try {
      for (const [n, r] of sealed) plain.set(n, open(r));
      state = 'ready';
    } catch {
      plain.clear();
      state = 'wrong-secret';
    }
  }
  const ready = () => (loaded ??= load());
  const check = (name: string, reason?: string) => {
    if (!NAME.test(name) || !names().has(name))
      throw new VaultError(
        'unknown-name',
        `${NAME.test(name) ? name : 'That name'} is not a provider key in the settings.`,
      );
    if (reason !== undefined && !reason.trim())
      throw new VaultError('no-reason', 'Give a reason for this change.');
  };
  const resolve = (name: string): string | undefined =>
    names().has(name) && plain.has(name) ? plain.get(name) : o.env[name];
  const envView = (): Env =>
    new Proxy({} as Record<string, string | undefined>, {
      get: (_t, p) => (typeof p === 'string' ? resolve(p) : undefined),
      has: (_t, p) => typeof p === 'string' && resolve(p) !== undefined,
    });

  const forActor = (actor: string): KeyVault => ({
    async list() {
      await ready();
      return [...names()].map(([name, p]): KeyInfo => {
        const inVault = plain.has(name);
        const env = o.env[name];
        return {
          name,
          provider: p.name,
          set: inVault || hasSecret(o.env, name),
          hint: inVault
            ? sealed.get(name)?.last4 || null
            : env && hasSecret(o.env, name)
              ? hintOf(env.trim())
              : null,
          lastTest: tests.get(name) ?? null,
        };
      });
    },
    async set(name, value, reason) {
      await ready();
      check(name, reason);
      const v = value.trim();
      if (!v) throw new VaultError('empty-value', 'Paste the key first.');
      if (state === 'wrong-secret')
        throw new VaultError(
          'wrong-secret',
          'The vault cannot read its stored keys with this KEY_VAULT_SECRET.',
        );
      const s = seal(v);
      await store.putSecret(name, s);
      sealed.set(name, s);
      tests.delete(name);
      plain.set(name, v);
      state = 'ready';
      await audit({
        at: now().toISOString(),
        actor,
        action: 'key.set',
        target: name,
        detail: { reason: reason.trim().slice(0, 300), hint: s.last4 },
      });
    },
    async remove(name, reason) {
      await ready();
      check(name, reason);
      await store.deleteSecret(name);
      sealed.delete(name);
      plain.delete(name);
      tests.delete(name);
      await audit({
        at: now().toISOString(),
        actor,
        action: 'key.remove',
        target: name,
        detail: { reason: reason.trim().slice(0, 300) },
      });
    },
    async test(name) {
      await ready();
      check(name);
      const p = names().get(name)!;
      const value = resolve(name);
      const at = now().toISOString();
      let result: NonNullable<KeyInfo['lastTest']>;
      if (!value?.trim())
        result = { ok: false, at, message: `${p.name} has no key yet.` };
      else result = await cheapest(p, value, at);
      tests.set(name, result);
      await audit({
        at,
        actor,
        action: 'key.test',
        target: name,
        detail: { ok: result.ok },
      });
      return result;
    },
  });

  /** The provider's cheapest check: its cheapest model, one tiny request. */
  async function cheapest(
    p: Provider,
    value: string,
    at: string,
  ): Promise<NonNullable<KeyInfo['lastTest']>> {
    const c = o.config();
    const providers = c.providers.filter((x) => x.keyRef === p.keyRef);
    const models = c.models
      .filter((m) => providers.some((x) => x.id === m.providerId))
      .sort(
        (a, b) =>
          a.price.inputPerMTok +
          a.price.outputPerMTok +
          a.price.perImage +
          a.price.perMinute -
          (b.price.inputPerMTok +
            b.price.outputPerMTok +
            b.price.perImage +
            b.price.perMinute),
      );
    const model =
      models.find((m) => m.kind === 'text') ??
      models.find((m) => m.kind === 'voice');
    const provider = model && providers.find((x) => x.id === model.providerId);
    const adapter =
      provider && o.adapters?.({ [p.keyRef]: value })[provider.kind];
    if (!model || !provider || !adapter)
      return { ok: false, at, message: `${p.name} has no quick check.` };
    const req: GatewayRequest =
      model.kind === 'text'
        ? { messages: [{ role: 'user', content: 'ping' }], maxOutputTokens: 8 }
        : { messages: [], prompt: 'Hi.', units: 1 };
    try {
      await adapter.call(req, { model: { ...model, enabled: true }, provider });
      return { ok: true, at, message: `${p.name} answered.` };
    } catch (e) {
      // A cut-off or odd answer still means the key was accepted.
      if ((e as { code?: string }).code === 'bad-output')
        return { ok: true, at, message: `${p.name} answered.` };
      // GatewayError sentences never carry the key.
      const msg = (e as Error).message || 'The check failed.';
      return { ok: false, at, message: msg.replaceAll(value, '…') };
    }
  }

  const base = forActor('system');
  return {
    ...base,
    load: () => (loaded = load()),
    resolve,
    env: envView,
    as: forActor,
    state: () => state,
  };
}
