// P2-R2 (P2B-05 to P2B-07): every real adapter against the fake provider
// servers, over real localhost HTTP, with the key read from env by name.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayError, type GatewayRequest } from '../../src/gateway';
import {
  defaultConfig,
  modelById,
  providerById,
} from '../../src/platform-config';
import { providerConnected, serverAdapters } from '../../server/adapters';
import {
  fakeBase,
  startFakeProviders,
  type FakeProviders,
} from '../fakes/providers';

let fake: FakeProviders;
beforeAll(async () => (fake = await startFakeProviders()));
afterAll(() => fake.close());

const KEYS = {
  ANTHROPIC_API_KEY: '',
  OPENAI_API_KEY: '',
  GEMINI_API_KEY: '',
  XAI_API_KEY: '',
  ELEVENLABS_API_KEY: '',
  VIDEO_JOBS_API_KEY: '',
};
const env = () =>
  Object.fromEntries(Object.keys(KEYS).map((k) => [k, fake.key]));
function setup(e: Record<string, string> = env()) {
  const c = defaultConfig();
  for (const p of c.providers) {
    const b = fakeBase(fake.url)[p.kind as keyof ReturnType<typeof fakeBase>];
    if (b) p.baseUrl = b;
    if (p.kind === 'video-jobs') p.enabled = true;
  }
  const adapters = serverAdapters({
    env: e,
    timeoutMs: 1000,
    retries: 1,
    sleep: async () => {},
    pollMs: 0,
  });
  const ctx = (modelId: string) => {
    const model = modelById(c, modelId)!;
    if (model.kind === 'video') model.enabled = true;
    return { model, provider: providerById(c, model.providerId)! };
  };
  const call = (modelId: string, req: GatewayRequest) => {
    const x = ctx(modelId);
    return adapters[x.provider.kind]!.call(req, x);
  };
  return { c, call };
}
const req: GatewayRequest = {
  system: 'Plan.',
  messages: [{ role: 'user', content: 'Eratosthenes' }],
  json: true,
  maxOutputTokens: 500,
};
const TEXT = [
  'claude-balanced',
  'openai-balanced',
  'gemini-fast',
  'grok-balanced',
];
/** A failed call's whole message, to prove the key never leaks. */
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e as GatewayError;
  }
};

describe('P2-R2 real adapters against fake servers', () => {
  it("[P2R2-005] text, image, voice and video calls succeed with the provider's own usage", async () => {
    fake.mode('ok');
    const { call } = setup();
    for (const id of TEXT) {
      const r = await call(id, req);
      expect(r.text).toBe('echo: Eratosthenes');
      expect(r.usage.inputTokens).toBeGreaterThan(0);
      expect(r.usage.outputTokens).toBeGreaterThan(0);
    }
    const img = await call('openai-image', {
      messages: [],
      prompt: 'a globe',
      units: 2,
    });
    expect(img.media).toMatchObject({
      kind: 'image',
      mime: 'image/png',
      units: 2,
    });
    expect(img.media!.base64).toMatch(/^iVBOR/);
    const voice = await call('eleven-voice', {
      messages: [],
      prompt: 'Namaste'.repeat(10),
    });
    expect(voice.media?.mime).toBe('audio/wav');
    expect(voice.usage.minutes).toBeGreaterThan(0);
    const video = await call('video-standard', {
      messages: [],
      prompt: 'sunrise',
      units: 5,
    });
    expect(video.media?.url).toMatch(/\.mp4$/);
    expect(video.usage.seconds).toBe(5);
  });

  it('[P2R2-006] failures map to plain sentences: 401, 429 then retry, 429, 500, malformed, slow, truncated', async () => {
    const { call } = setup();
    const cases: [Parameters<FakeProviders['mode']>[0], string][] = [
      ['401', 'not-connected'],
      ['429', 'rate-limited'],
      ['500', 'provider-error'],
      ['malformed', 'bad-output'],
      ['slow', 'timeout'],
      ['truncated', 'bad-output'],
    ];
    for (const [mode, code] of cases)
      for (const id of TEXT) {
        fake.mode(mode);
        const e = await failure(call(id, req));
        expect(e, `${id} ${mode}`).toBeInstanceOf(GatewayError);
        expect(e!.code, `${id} ${mode}`).toBe(code);
        expect(e!.message).toMatch(/\.$/);
        expect(JSON.stringify({ m: e!.message, d: e!.detail })).not.toContain(
          fake.key,
        );
      }
    fake.mode('429-once');
    expect((await call('claude-balanced', req)).text).toBe(
      'echo: Eratosthenes',
    );
    fake.mode('ok');
  }, 30_000);

  it('[P2R2-007] a missing key means "not connected" without any request, and a key never appears in an error', async () => {
    const before = fake.seen.length;
    const { c, call } = setup({});
    for (const id of [...TEXT, 'openai-image', 'eleven-voice']) {
      const e = await failure(call(id, req));
      expect(e!.code).toBe('not-connected');
      expect(e!.message).toMatch(/is not connected yet\.$/);
    }
    expect(fake.seen.length).toBe(before);
    expect(providerConnected(providerById(c, 'anthropic')!, {})).toBe(false);
    expect(
      providerConnected(providerById(c, 'anthropic')!, {
        ANTHROPIC_API_KEY: 'x',
      }),
    ).toBe(true);
    expect(providerConnected(providerById(c, 'mock')!, {})).toBe(true);
    const v = providerById(defaultConfig(), 'video-jobs')!;
    expect(
      providerConnected({ ...v, enabled: true }, { VIDEO_JOBS_API_KEY: 'x' }),
    ).toBe(false); // needs its address
  });
});
