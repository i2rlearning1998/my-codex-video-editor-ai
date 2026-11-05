import { expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  createEntitlementService,
  canonicalJson,
} from '../../server/entitlements';
import { memoryStore } from '../../server/store';
import { defaultConfig } from '../../src/platform-config';
import type { LimitAction, P3AdminSettings } from '../../src/contracts/p3';

export const settings = (): P3AdminSettings => ({
  chat: { enabled: true, maxMessagesPerDay: 2, maxHistoryTokens: 100 },
  vision: { enabled: true, creditsPerImage: 2, maxImagesPerMessage: 2 },
  memory: {
    keepRecent: 2,
    summariseAboveTokens: 100,
    maxFacts: 10,
    maxStyleRules: 5,
  },
  entitlementTtlSeconds: 60,
  webhookReplayWindowSeconds: 60,
});
const actions: LimitAction[] = [
  'export',
  'store',
  'voice-clone',
  'project',
  'ai-call',
  'chat-message',
  'attach',
  'vision',
];
async function setup() {
  const store = memoryStore(),
    config = defaultConfig(),
    opts = settings();
  const plan = config.plans[0]!;
  Object.assign(plan.limits, {
    exportsPerMonth: 2,
    storageMb: 2,
    voiceClones: 2,
    projects: 2,
    callsPerMinute: 2,
    creditsPerDay: 2,
  });
  await store.saveProfile({
    id: 'u',
    email: 'u@example.test',
    plan: plan.id,
    locale: 'en',
    brandKit: {},
    createdAt: '2026-11-05T00:00:00.000Z',
  });
  await store.appendLedger('u', [
    {
      id: 'grant',
      key: 'grant',
      at: '2026-11-05T00:00:00.000Z',
      type: 'grant',
      delta: 20,
      note: '',
    },
  ]);
  const state = { flags: [] as string[], suspended: false },
    emergency = {
      aiOff: false,
      signupsOff: false,
      paymentsOff: false,
      message: { en: 'Temporarily paused.' },
    };
  const secret = randomBytes(32).toString('hex');
  const service = createEntitlementService({
    store,
    config: async () => config,
    settings: () => opts,
    secret: () => secret,
    userState: async () => state,
    emergency: async () => emergency,
    now: () => Date.parse('2026-11-05T12:00:00.000Z'),
  });
  return {
    service,
    store,
    config,
    plan,
    opts,
    state,
    emergency,
    secret,
    setMessages: async (n: number) => {
      const have = await store.dailyCount('u', 'chat-message', '2026-11-05');
      for (let i = have; i < n; i++)
        await store.bumpDaily('u', 'chat-message', '2026-11-05');
    },
  };
}
it('[P3E-010] signs canonical entitlements, rejects tampering, expiry and wrong keys without leaking secrets', async () => {
  const { service, secret } = await setup();
  const signed = await service.resolve('u');
  expect(service.verify(signed)).toEqual(signed.entitlements);
  expect(JSON.stringify(signed)).not.toContain(secret);
  expect(
    service.verify({
      ...signed,
      entitlements: { ...signed.entitlements, planId: 'other' },
    }),
  ).toBeNull();
  expect(
    service.verify({
      ...signed,
      entitlements: {
        ...signed.entitlements,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    }),
  ).toBeNull();
  expect(service.verify({ ...signed, signature: 'a'.repeat(64) })).toBeNull();
  expect(
    service.verify(signed, new Date(signed.entitlements.expiresAt)),
  ).toBeNull();
  expect(canonicalJson({ b: 2, a: { y: 1, x: 0 } })).toBe(
    canonicalJson({ a: { x: 0, y: 1 }, b: 2 }),
  );
});
it('[P3E-011] suspension refuses every action and emergency refuses AI', async () => {
  const { service, state, emergency } = await setup();
  state.suspended = true;
  for (const action of actions)
    expect(await service.check('u', action)).toMatchObject({
      ok: false,
      failure: { code: 'suspended' },
    });
  state.suspended = false;
  emergency.aiOff = true;
  expect(await service.check('u', 'ai-call')).toMatchObject({
    ok: false,
    failure: { code: 'ai-off', message: emergency.message },
  });
});
it.each(actions)(
  '[P3E-012] %s permits within limits and refuses an exceeded limit',
  async (action) => {
    const { service, store, setMessages, opts } = await setup();
    expect(await service.check('u', action, 1)).toEqual({ ok: true });
    if (action === 'export') {
      await store.addExport('u', '2026-11', 'png');
      await store.addExport('u', '2026-11', 'png');
    }
    if (action === 'store') await store.setCounter('u', 'storageMb', 2);
    if (action === 'voice-clone') await store.setCounter('u', 'voiceClones', 2);
    if (action === 'project') await store.setCounter('u', 'projects', 2);
    if (action === 'chat-message') await setMessages(2);
    if (action === 'attach' || action === 'vision')
      Object.assign(opts.vision, { maxImagesPerMessage: 0 });
    expect(
      await service.check('u', action, action === 'ai-call' ? 3 : 1),
    ).toMatchObject({ ok: false });
  },
);
it('[P3E-013] settings are read per call and vision charges/checks the configured price', async () => {
  const { service, opts, setMessages } = await setup();
  await setMessages(2);
  expect(await service.check('u', 'chat-message')).toMatchObject({ ok: false });
  Object.assign(opts.chat, { maxMessagesPerDay: 3 });
  expect(await service.check('u', 'chat-message')).toEqual({ ok: true });
  Object.assign(opts.vision, { creditsPerImage: 21 });
  expect(await service.check('u', 'vision')).toMatchObject({
    ok: false,
    failure: { code: 'shortage' },
  });
  expect(await service.check('u', 'project', NaN)).toMatchObject({ ok: false });
});
it('[P3E-015] AI limits reuse persisted daily spending and per-minute usage', async () => {
  const { service, store } = await setup();
  expect(await service.check('u', 'ai-call', 2)).toEqual({ ok: true });
  await store.appendLedger('u', [
    {
      id: 'used',
      key: 'used',
      at: '2026-11-05T11:00:00.000Z',
      type: 'settle',
      delta: 0,
      used: 2,
      note: '',
    },
  ]);
  expect(await service.check('u', 'ai-call', 1)).toMatchObject({
    ok: false,
    failure: { code: 'budget-day' },
  });
  const fresh = await setup();
  for (const id of ['one', 'two'])
    await fresh.store.appendUsage({
      id,
      at: '2026-11-05T11:59:50.000Z',
      userId: 'u',
      modelId: 'm',
      role: 'text',
      credits: 0,
      ms: 1,
      outcome: 'ok',
    });
  expect(await fresh.service.check('u', 'ai-call', 1)).toMatchObject({
    ok: false,
    failure: { code: 'rate-limit' },
  });
});

it('[P3E-016] concurrent chat checks consume exactly the configured daily allowance', async () => {
  const { service, store } = await setup();
  const results = await Promise.all(
    Array.from({ length: 10 }, () => service.check('u', 'chat-message')),
  );
  expect(results.filter((r) => r.ok)).toHaveLength(2);
  expect(await store.dailyCount('u', 'chat-message', '2026-11-05')).toBe(2);
});
