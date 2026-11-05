// P3-WIRING W6: the key vault (unit and through the server's /v1 routes).
// Provider checks run against the FAKE provider servers only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createKeyVault,
  memorySecretStore,
  type VaultAudit,
} from '../../server/keys';
import { serverAdapters } from '../../server/adapters';
import { defaultConfig } from '../../src/platform-config';
import {
  fakeBase,
  startFakeProviders,
  type FakeProviders,
} from '../fakes/providers';
import { startServer, type Started } from '../server/helpers';

let fake: FakeProviders;
beforeAll(async () => (fake = await startFakeProviders()));
afterAll(() => fake.close());
const SECRET = 'vault-secret-for-tests-0123456789';

function setup(env: Record<string, string> = {}, secret = SECRET) {
  const config = defaultConfig();
  for (const p of config.providers) {
    const b = fakeBase(fake.url)[p.kind as keyof ReturnType<typeof fakeBase>];
    if (b) p.baseUrl = b;
  }
  const store = memorySecretStore();
  const rows: VaultAudit[] = [];
  const make = (s = secret) =>
    createKeyVault(store, s, (r) => void rows.push(r), {
      config: () => config,
      env,
      adapters: (e) =>
        serverAdapters({
          env: e,
          timeoutMs: 1000,
          retries: 0,
          sleep: async () => {},
        }),
    });
  return { store, rows, make, config };
}

describe('P3-WIRING key vault', () => {
  it('[P3W-023] values are AES-256-GCM encrypted at rest; list shows only the last four characters', async () => {
    const v = setup();
    const vault = v.make();
    await vault.set('ANTHROPIC_API_KEY', fake.key, 'first key');
    const raw = v.store.raw();
    expect(raw).not.toContain(fake.key);
    expect(raw).not.toContain(fake.key.slice(0, 12));
    const sealed = JSON.parse(raw).ANTHROPIC_API_KEY;
    expect(Object.keys(sealed).sort()).toEqual(
      ['ciphertext', 'iv', 'last4', 'tag', 'updatedAt'].sort(),
    );
    expect(sealed.last4).toBe(fake.key.slice(-4));
    expect(Buffer.from(sealed.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(sealed.tag, 'base64')).toHaveLength(16);
    // A random IV per value: the same key sealed twice differs.
    await vault.set('ANTHROPIC_API_KEY', fake.key, 'again');
    expect(JSON.parse(v.store.raw()).ANTHROPIC_API_KEY.iv).not.toBe(sealed.iv);
    const list = await vault.list();
    const a = list.find((k) => k.name === 'ANTHROPIC_API_KEY')!;
    expect(a).toMatchObject({
      set: true,
      hint: fake.key.slice(-4),
      provider: 'Anthropic',
    });
    expect(JSON.stringify(list)).not.toContain(fake.key);
    expect(list.find((k) => k.name === 'OPENAI_API_KEY')).toMatchObject({
      set: false,
      hint: null,
    });
    expect(v.rows.map((r) => [r.action, r.target, r.detail.reason])).toEqual([
      ['key.set', 'ANTHROPIC_API_KEY', 'first key'],
      ['key.set', 'ANTHROPIC_API_KEY', 'again'],
    ]);
    expect(JSON.stringify(v.rows)).not.toContain(fake.key);
  });

  it('[P3W-024] a wrong KEY_VAULT_SECRET cannot decrypt; resolution falls back to the environment', async () => {
    const v = setup({ ANTHROPIC_API_KEY: 'env-key-value-9999' });
    await v.make().set('ANTHROPIC_API_KEY', fake.key, 'set');
    const right = v.make();
    await right.load();
    expect(right.resolve('ANTHROPIC_API_KEY')).toBe(fake.key);
    expect(right.env().ANTHROPIC_API_KEY).toBe(fake.key);
    const wrong = v.make('a-different-secret-entirely-000000');
    await wrong.load();
    expect(wrong.state()).toBe('wrong-secret');
    expect(wrong.resolve('ANTHROPIC_API_KEY')).toBe('env-key-value-9999');
    await expect(
      wrong.set('ANTHROPIC_API_KEY', 'x'.repeat(20), 'r'),
    ).rejects.toThrow('cannot read its stored keys');
    const none = v.make('');
    await none.load();
    expect(none.state()).toBe('no-secret');
    // Only provider key names: the vault can never replace another secret.
    await expect(
      right.set('LOCAL_AUTH_SECRET', 'x'.repeat(20), 'r'),
    ).rejects.toThrow('is not a provider key');
    expect(right.env().LOCAL_AUTH_SECRET).toBeUndefined();
    await expect(
      right.set('OPENAI_API_KEY', 'x'.repeat(20), '  '),
    ).rejects.toThrow('Give a reason');
  });

  it("[P3W-025] test makes the provider's cheapest call against the fake server; a bad key fails without leaking it", async () => {
    const v = setup();
    const vault = v.make();
    await vault.set('ANTHROPIC_API_KEY', fake.key, 'good');
    const ok = await vault.test('ANTHROPIC_API_KEY');
    expect(ok).toMatchObject({ ok: true, message: 'Anthropic answered.' });
    const bad = 'sk-wrong-key-abcdef0123456789';
    await vault.set('OPENAI_API_KEY', bad, 'bad');
    const no = await vault.test('OPENAI_API_KEY');
    expect(no?.ok).toBe(false);
    expect(JSON.stringify(no)).not.toContain(bad);
    expect(await vault.test('GEMINI_API_KEY')).toMatchObject({
      ok: false,
      message: 'Google Gemini has no key yet.',
    });
    const list = await vault.list();
    expect(
      list.find((k) => k.name === 'ANTHROPIC_API_KEY')!.lastTest,
    ).toMatchObject({ ok: true });
  });

  describe('through the server', () => {
    let s: Started;
    beforeAll(async () => {
      s = await startServer({ KEY_VAULT_SECRET: SECRET });
      const c = defaultConfig();
      c.providers.find((p) => p.id === 'anthropic')!.baseUrl = fakeBase(
        fake.url,
      ).anthropic;
      const admin = s.token('admin-0000', { app_metadata: { role: 'admin' } });
      await s.api('/v1/config', {
        token: admin,
        body: { config: c, publish: true },
      });
    });
    afterAll(() => s.close());

    it('[P3W-026] /v1/admin/keys is admin only; a key set there connects the provider; no answer or log holds it', async () => {
      const admin = s.token('admin-0000', { app_metadata: { role: 'admin' } });
      const person = s.token('11111111-0000-0000-0000-000000000000');
      expect((await s.api('/v1/admin/keys', { token: person })).status).toBe(
        403,
      );
      expect(
        (
          await s.api('/v1/admin/keys', {
            token: person,
            method: 'PUT',
            body: { name: 'ANTHROPIC_API_KEY', value: fake.key, reason: 'x' },
          })
        ).status,
      ).toBe(403);
      const before = (await s.api('/v1/models', { token: person })).body.models;
      expect(
        before.find((m: { id: string }) => m.id === 'claude-balanced')
          .connected,
      ).toBe(false);
      const put = await s.api('/v1/admin/keys', {
        token: admin,
        method: 'PUT',
        body: { name: 'ANTHROPIC_API_KEY', value: fake.key, reason: 'go live' },
      });
      expect(put.status).toBe(200);
      const after = (await s.api('/v1/models', { token: person })).body.models;
      expect(
        after.find((m: { id: string }) => m.id === 'claude-balanced').connected,
      ).toBe(true);
      // A real call through the gateway uses the vault's key.
      const call = await s.api('/v1/run', {
        token: person,
        body: {
          role: 'write',
          modelId: 'claude-balanced',
          request: { messages: [{ role: 'user', content: 'hi' }] },
          key: 'vault-run-1',
          maxCredits: 5,
        },
      });
      expect(call.status).toBe(200);
      const list = await s.api('/v1/admin/keys', { token: admin });
      expect(
        list.body.keys.find(
          (k: { name: string }) => k.name === 'ANTHROPIC_API_KEY',
        ),
      ).toMatchObject({
        set: true,
        hint: fake.key.slice(-4),
      });
      const test = await s.api('/v1/admin/keys', {
        token: admin,
        body: { name: 'ANTHROPIC_API_KEY' },
      });
      expect(test.body.lastTest).toMatchObject({ ok: true });
      const del = await s.api('/v1/admin/keys', {
        token: admin,
        method: 'DELETE',
        body: { name: 'ANTHROPIC_API_KEY', reason: 'rotate' },
      });
      expect(del.status).toBe(200);
      const gone = (await s.api('/v1/models', { token: person })).body.models;
      expect(
        gone.find((m: { id: string }) => m.id === 'claude-balanced').connected,
      ).toBe(false);
      for (const r of [put, list, test, del, call])
        expect(r.text).not.toContain(fake.key);
      expect(s.logs.join('\n')).not.toContain(fake.key);
      expect(
        s.logs.some((l) => l.startsWith('audit key.set ANTHROPIC_API_KEY')),
      ).toBe(true);
      const badName = await s.api('/v1/admin/keys', {
        token: admin,
        method: 'PUT',
        body: { name: 'LOCAL_AUTH_SECRET', value: 'x'.repeat(20), reason: 'r' },
      });
      expect(badName.status).toBe(400);
    });
  });
});
