import { expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createServerApp, listen } from '../../server/app';
import { AuthError } from '../../server/auth';
import { memoryStore } from '../../server/store';
import { defaultConfig } from '../../src/platform-config';
import type { P3AdminSettings } from '../../src/contracts/p3';

it('[P3E-014] entitlement HTTP route authenticates and never returns or logs the signing secret', async () => {
  const secret = randomBytes(32).toString('hex'),
    token = randomBytes(24).toString('hex');
  const logs: string[] = [],
    bodies: string[] = [];
  const store = memoryStore();
  await store.saveProfile({
    id: 'u',
    email: 'u@example.test',
    plan: defaultConfig().plans[0]!.id,
    locale: 'en',
    brandKit: {},
    createdAt: '2026-11-05T00:00:00.000Z',
  });
  const settings: P3AdminSettings = {
    chat: { enabled: true, maxMessagesPerDay: 5, maxHistoryTokens: 100 },
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
  const app = createServerApp({
    store,
    env: { ENTITLEMENT_SECRET: secret },
    log: (line) => logs.push(line),
    authenticate: async (header) => {
      if (header !== `Bearer ${token}`)
        throw new AuthError('Please log in first.');
      return { userId: 'u', email: 'u@example.test', admin: false };
    },
    p3Entitlements: {
      settings: () => settings,
      userState: async () => ({ flags: [], suspended: false }),
      emergency: async () => ({
        aiOff: false,
        signupsOff: false,
        paymentsOff: false,
        message: { en: 'Paused.' },
      }),
      chatMessagesToday: async () => 0,
    },
  });
  const server = await listen(app.handler, 0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test port.');
    const url = `http://127.0.0.1:${address.port}/v1/entitlements`;
    const refused = await fetch(url);
    bodies.push(await refused.text());
    expect(refused.status).toBe(401);
    const accepted = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await accepted.text();
    bodies.push(body);
    expect(accepted.status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ entitlements: { userId: 'u' } });
    for (const line of [...logs, ...bodies]) {
      expect(line.includes(secret)).toBe(false);
      expect(line.includes(token)).toBe(false);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
