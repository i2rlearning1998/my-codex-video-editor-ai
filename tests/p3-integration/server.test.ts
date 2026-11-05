// P3 integration (integrator): Part 1 and Part 2 working together in one
// server. Provider calls go to the FAKE provider servers only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyAuditChain } from '../../server/admin/audit';
import { defaultConfig } from '../../src/platform-config';
import {
  fakeBase,
  startFakeProviders,
  type FakeProviders,
} from '../fakes/providers';
import { startServer, type Started } from '../server/helpers';

const SECRET = 'vault-secret-for-tests-0123456789';
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
let fake: FakeProviders;
let s: Started;
beforeAll(async () => {
  fake = await startFakeProviders();
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
  await s.api('/v1/admin/keys', {
    token: admin,
    method: 'PUT',
    body: { name: 'ANTHROPIC_API_KEY', value: fake.key, reason: 'go live' },
  });
});
afterAll(async () => {
  await s.close();
  await fake.close();
});

const run = (token: string | undefined, request: Record<string, unknown>) =>
  s.api('/v1/run', {
    ...(token ? { token } : {}),
    body: {
      role: 'write',
      modelId: 'claude-balanced',
      request: {
        messages: [{ role: 'user', content: 'describe' }],
        ...request,
      },
      key: `run-${Math.random().toString(36).slice(2)}`,
      maxCredits: 5,
    },
  });

describe('P3 integration: server', () => {
  it("[P3I-001] a key set in the vault is written to Part 1's chained audit log, with no value in it", async () => {
    const rows = await s.store.audit();
    expect(rows.length).toBeGreaterThan(0);
    expect(verifyAuditChain(rows)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(fake.key);
    expect(rows.some((r) => /key/i.test(r.action))).toBe(true);
  });

  it('[P3I-002] /v1/run passes valid pictures on, refuses bad ones, and a big body needs a sign-in first', async () => {
    const person = s.token('11111111-0000-0000-0000-000000000000');
    const ok = await run(person, {
      images: [{ mime: 'image/png', base64: PNG }],
    });
    expect(ok.status).toBe(200);
    const badMime = await run(person, {
      images: [{ mime: 'image/svg+xml', base64: PNG }],
    });
    expect(badMime.status).toBe(400);
    const badData = await run(person, {
      images: [{ mime: 'image/png', base64: '<script>' }],
    });
    expect(badData.status).toBe(400);
    const many = await run(person, {
      images: Array.from({ length: 9 }, () => ({
        mime: 'image/png',
        base64: PNG,
      })),
    });
    expect(many.status).toBe(400);
    const badParams = await run(person, { params: { 'a b': 1 } });
    expect(badParams.status).toBe(400);
    // 2 MB of body: refused as unsigned before it is read; a signed-in person's picture passes.
    const huge = await run(undefined, { prompt: 'x'.repeat(2 * 1024 * 1024) });
    expect(huge.status).toBe(401);
    const big = await run(person, {
      images: [{ mime: 'image/png', base64: 'A'.repeat(1024 * 1024) }],
    });
    expect(big.status).toBe(200);
  });
});
