// P3-WIRING (CONTRACTS-P3 rev 1.3 note 2): the additive adapter changes,
// against the FAKE provider servers: images in the request builders, and
// the transport's injected secret resolver (vault first, then env).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anthropicAdapter,
  fetchTransport,
  GatewayError,
} from '../../src/gateway';
import { visionRequest } from '../../src/gateway/adapters/extras';
import { modelById, providerById } from '../../src/platform-config';
import { startFakeProviders, type FakeProviders } from '../fakes/providers';
import { fakeConfig } from './harness';

let fake: FakeProviders;
beforeAll(async () => (fake = await startFakeProviders()));
afterAll(() => fake.close());

const PNG = { mime: 'image/png', base64: 'iVBORw0KGgo=' };
function ctx(modelId: string) {
  const c = fakeConfig(fake);
  const model = modelById(c, modelId)!;
  return { model, provider: providerById(c, model.providerId)! };
}

describe('P3-WIRING adapter additions', () => {
  it('[P3W-018] the request builder adds images only for a vision model; a model without vision refuses them', () => {
    const a = anthropicAdapter();
    const req = visionRequest(
      { messages: [{ role: 'user', content: 'What is this?' }] },
      [PNG],
    );
    const vision = ctx('claude-balanced');
    const body = a.buildRequest(req, vision).body as {
      messages: { content: { type: string }[] }[];
    };
    expect(body.messages[0]!.content.map((p) => p.type)).toEqual([
      'image',
      'text',
    ]);
    const blind = ctx('claude-fast');
    blind.model.capabilities.vision = false;
    expect(() => a.buildRequest(req, blind)).toThrow(
      'This model cannot read pictures.',
    );
    // Without images the body is exactly as before.
    const plain = a.buildRequest(
      { messages: [{ role: 'user', content: 'hi' }] },
      vision,
    ).body as { messages: { content: unknown }[] };
    expect(plain.messages[0]!.content).toBe('hi');
  });

  it('[P3W-026] the transport asks the injected resolver first, then the environment; neither means not connected', async () => {
    const x = ctx('claude-balanced');
    const call = (o: {
      env: Record<string, string>;
      resolve?: (n: string) => string | undefined;
    }) =>
      anthropicAdapter(
        fetchTransport({
          env: o.env,
          provider: 'Anthropic',
          retries: 0,
          sleep: async () => {},
          ...(o.resolve ? { resolveSecret: o.resolve } : {}),
        }),
      ).call({ messages: [{ role: 'user', content: 'ping' }] }, x);
    // The vault's key wins over a wrong environment value.
    await expect(
      call({
        env: { ANTHROPIC_API_KEY: 'wrong-env-value' },
        resolve: (n) => (n === 'ANTHROPIC_API_KEY' ? fake.key : undefined),
      }),
    ).resolves.toMatchObject({ text: expect.any(String) });
    // A name the resolver does not answer falls back to the environment.
    await expect(
      call({ env: { ANTHROPIC_API_KEY: fake.key }, resolve: () => undefined }),
    ).resolves.toMatchObject({ text: expect.any(String) });
    const missing = await call({ env: {}, resolve: () => '' }).catch((e) => e);
    expect(missing).toBeInstanceOf(GatewayError);
    expect((missing as GatewayError).code).toBe('not-connected');
  });
});
