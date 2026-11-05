// P3-WIRING W5: the Studio service against a real gateway and the FAKE
// provider servers, with a stand-in for Part 1's StudioEngine.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Asset } from '../../src/panel/services';
import { createStudioService } from '../../src/wiring/studio-service';
import { paramsRequest } from '../../src/wiring/vision';
import { startFakeProviders, type FakeProviders } from '../fakes/providers';
import { collect, harness } from './harness';
import { stubEntitlements, stubStudioEngine } from './stubs/engines';

let fake: FakeProviders;
beforeAll(async () => (fake = await startFakeProviders()));
afterAll(() => fake.close());
const bodies: { provider: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  fake.seen.length = 0;
  bodies.length = 0;
  fake.mode('ok');
  fake.respond((provider, body) => {
    bodies.push({ provider, body });
    return JSON.stringify({
      values: {
        prompt: 'A clear, sunlit diagram of the Earth with two sticks',
        aspect: 'NOT-ALLOWED',
      },
    });
  });
});

function setup(ent = stubEntitlements()) {
  const h = harness(fake);
  const assets: Asset[] = [];
  const svc = createStudioService({
    config: () => h.config,
    userId: h.user,
    plan: () => h.plan,
    engine: stubStudioEngine(),
    gateway: h.gateway,
    connected: (id) => !id.startsWith('video-'),
    entitlements: ent,
    saveAsset: (a) => void assets.push(a),
  });
  return { ...h, svc, assets, ent };
}
const VALUES = { prompt: 'earth with sticks', aspect: '1024x1024', count: 2 };

describe('P3-WIRING Studio service', () => {
  it('[P3W-019] the form comes from the chosen model params; preview and estimate use the assembled units', async () => {
    const s = setup();
    const models = await s.svc.models('images');
    expect(models.map((m) => m.id)).toEqual(
      expect.arrayContaining(['mock-image', 'openai-image']),
    );
    const form = await s.svc.form('images', 'openai-image');
    expect(form.basic.map((p) => p.id)).toEqual(['prompt', 'aspect', 'count']);
    expect(form.advanced.map((p) => p.id)).toEqual(['avoid']);
    expect(form.canEnhance).toBe(true);
    const a = s.svc.preview(form, VALUES);
    expect(a).toMatchObject({ units: 2, params: { size: '1024x1024', n: 2 } });
    const one = await s.svc.estimate('images', 'openai-image', {
      ...VALUES,
      count: 1,
    });
    const two = await s.svc.estimate('images', 'openai-image', VALUES);
    expect(two.max).toBeGreaterThan(one.max);
    // Another model, another form (the voice model's params).
    const voice = await s.svc.form('voice', 'eleven-voice');
    expect(voice.basic.map((p) => p.id)).toEqual(['script', 'minutes']);
  });

  it('[P3W-020] run reserves, calls the model with the assembled prompt and params, settles, and saves the asset', async () => {
    const s = setup();
    const before = s.ledger('u1').balance();
    const est = await s.svc.estimate('images', 'openai-image', VALUES);
    const ev = await collect(s.svc.run('images', 'openai-image', VALUES, 'p1'));
    expect(ev.map((e) => e.type)).toEqual([
      'progress',
      'progress',
      'progress',
      'result',
    ]);
    // The assembled params reach the provider body (reserved keys kept).
    const model = s.config.models.find((m) => m.id === 'openai-image')!;
    const provider = s.config.providers.find((p) => p.id === model.providerId)!;
    const http = s.adapters.openai!.buildRequest(
      paramsRequest(
        { messages: [], prompt: 'earth with sticks', units: 2 },
        { size: '1024x1024', n: 2, model: 'evil' },
      ),
      { model, provider },
    );
    expect(http.body).toMatchObject({
      size: '1024x1024',
      n: 2,
      model: 'gpt-image-1',
      prompt: 'earth with sticks',
    });
    const used = before - s.ledger('u1').balance();
    expect(used).toBeGreaterThan(0);
    expect(used).toBeLessThanOrEqual(est.max);
    expect(s.ledger('u1').held()).toBe(0);
    expect(s.assets).toHaveLength(1);
    expect(s.assets[0]).toMatchObject({
      projectId: 'p1',
      kind: 'image',
      studioId: 'images',
      userId: 'u1',
    });
    expect(s.assets[0]!.dataUrl).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(s.ent.checks).toEqual(['ai-call']);
  });

  it('[P3W-021] a provider failure refunds the whole hold and saves nothing; an invalid form never calls', async () => {
    const s = setup();
    const before = s.ledger('u1').balance();
    fake.mode('500', 'openai');
    const ev = await collect(s.svc.run('images', 'openai-image', VALUES, null));
    expect(ev.at(-1)).toMatchObject({ type: 'failure' });
    expect(s.ledger('u1').balance()).toBe(before);
    expect(s.ledger('u1').held()).toBe(0);
    expect(s.assets).toEqual([]);
    expect(JSON.stringify(ev)).not.toContain(fake.key);
    fake.mode('ok');
    fake.seen.length = 0;
    const bad = await collect(
      s.svc.run('images', 'openai-image', { prompt: '' }, null),
    );
    expect(bad).toEqual([
      {
        type: 'failure',
        failure: {
          code: 'form',
          message: { en: 'Describe the picture is needed.' },
        },
      },
    ]);
    expect(fake.seen).toEqual([]);
    const denied = setup(
      stubEntitlements({
        refuse: {
          'ai-call': { code: 'ai-off', message: { en: 'AI is paused.' } },
        },
      }),
    );
    expect(
      await collect(denied.svc.run('images', 'openai-image', VALUES, null)),
    ).toEqual([
      {
        type: 'failure',
        failure: { code: 'ai-off', message: { en: 'AI is paused.' } },
      },
    ]);
  });

  it('[P3W-022] Enhance rewrites only the prompt text fields, costs credits, and leaves choices alone', async () => {
    const s = setup();
    const before = s.ledger('u1').balance();
    const r = await s.svc.enhance('images', 'openai-image', VALUES);
    expect(r.ok ? 'ok' : r.failure).toBe('ok');
    if (!r.ok) return;
    expect(r.value).toEqual({
      ...VALUES,
      prompt: 'A clear, sunlit diagram of the Earth with two sticks',
    });
    expect(s.ledger('u1').balance()).toBeLessThan(before);
    const sys = String(bodies.at(-1)!.body.system);
    expect(sys).toContain('TASK: ENHANCE');
    expect(sys).toContain('prompt (Describe the picture)');
    expect(sys).not.toContain('aspect (');
    fake.mode('500');
    const failed = await s.svc.enhance('images', 'openai-image', VALUES);
    expect(failed.ok).toBe(false);
    expect(s.ledger('u1').held()).toBe(0);
  });
});
