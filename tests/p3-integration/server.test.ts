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

const p3Settings = {
  chat: { enabled: true, maxMessagesPerDay: 2, maxHistoryTokens: 100 },
  vision: { enabled: true, creditsPerImage: 2, maxImagesPerMessage: 2 },
  memory: {
    keepRecent: 2,
    summariseAboveTokens: 100,
    maxFacts: 5,
    maxStyleRules: 5,
  },
  entitlementTtlSeconds: 60,
  webhookReplayWindowSeconds: 60,
};
const SECRET = 'vault-secret-for-tests-0123456789';
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
let fake: FakeProviders;
let s: Started;
beforeAll(async () => {
  fake = await startFakeProviders();
  s = await startServer(
    {
      KEY_VAULT_SECRET: SECRET,
      ENTITLEMENT_SECRET: 'entitlement-secret-0123456789abcdef',
    },
    undefined,
    {
      p3Settings: () => p3Settings,
    },
  );
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

  it('[P3I-005] a provider call records its USD cost, and the admin dashboard reports real cost and margin inputs', async () => {
    const person = s.token('22222222-0000-0000-0000-000000000000');
    expect((await run(person, {})).status).toBe(200);
    const admin = s.token('admin-0000', { app_metadata: { role: 'admin' } });
    const m = await s.api(
      '/v1/admin/metrics?from=2020-01-01T00:00:00.000Z&to=2099-01-01T00:00:00.000Z',
      { token: admin },
    );
    expect(m.status).toBe(200);
    expect(m.body.providerCostUsd).toBeGreaterThan(0);
    const model = m.body.byModel.find(
      (r: { modelId: string }) => r.modelId === 'claude-balanced',
    );
    expect(model.costUsd).toBeGreaterThan(0);
    expect(model.calls).toBeGreaterThan(0);
    expect(
      m.body.series.every((r: { costUsd: number }) => r.costUsd >= 0),
    ).toBe(true);
    // A person cannot read it.
    expect(
      (
        await s.api(
          '/v1/admin/metrics?from=2020-01-01T00:00:00.000Z&to=2099-01-01T00:00:00.000Z',
          { token: person },
        )
      ).status,
    ).toBe(403);
  });

  it('[P3I-006] POST /v1/entitlements/check decides a limit on the server: signed in only, a valid action only, the daily chat cap holds', async () => {
    const person = s.token('33333333-0000-0000-0000-000000000000');
    const check = (token: string | undefined, body: unknown) =>
      s.api('/v1/entitlements/check', {
        ...(token ? { token } : {}),
        body,
      });
    expect((await check(undefined, { action: 'chat-message' })).status).toBe(
      401,
    );
    expect((await check(person, { action: 'launch-rocket' })).status).toBe(400);
    expect(
      (await check(person, { action: 'chat-message', extra: 1 })).status,
    ).toBe(400);
    const first = await check(person, { action: 'chat-message' });
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect((await check(person, { action: 'chat-message' })).body.ok).toBe(
      true,
    );
    const third = await check(person, { action: 'chat-message' });
    expect(third.status).toBe(200);
    expect(third.body.ok).toBe(false);
    expect(third.body.failure.code).toBe('chat-limit');
    // Another person has their own count.
    const other = s.token('44444444-0000-0000-0000-000000000000');
    expect((await check(other, { action: 'chat-message' })).body.ok).toBe(true);
  });
});
