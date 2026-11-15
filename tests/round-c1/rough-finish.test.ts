// ROUND-C1 F5: rough use invented for the finishing parts (at least five per
// part; the browser ones are in e2e). F2: several graphics, a chatty vision
// model, the edge threshold. F3: the owner's own Brief rules, odd links.
// F4: broken voice and captions answers, rate limits, credits, size caps.
import { describe, expect, it, vi } from 'vitest';
import {
  defaultConfig,
  platformConfigSchema,
  type MediaProvider,
} from '../../src/platform-config';
import { planLoop } from '../../src/director/plan-loop';
import {
  assetRuleFromBrief,
  referenceUrl,
} from '../../src/director/brief-media';
import { judgeGraphic, lookAt } from '../../src/ui/render-frames';
import { runTool, type ToolContext } from '../../src/tools';
import { RateLimiter } from '../../src/tools/media';
import { memoryUsageLog } from '../../src/gateway/usage';
import {
  speakResult,
  transcribeResult,
  speechFixtureRunner,
  type SpeechRunner,
} from '../../src/tools/speech';
import { safeFetch } from '../../src/tools/net-guard';

const c = platformConfigSchema.parse(defaultConfig());
const loopBase = {
  config: c,
  plan: c.plans[0]!,
  base: { messages: [{ role: 'user' as const, content: 'plan' }] },
  extract: (t: string) => JSON.parse(t) as unknown,
  repairText: (e: string[]) => `FIX: ${e.join(' | ')}`,
  check: async (raw: unknown) => ({ ok: true as const, value: raw }),
};
const answerWith = (plan: unknown) => JSON.stringify({ plan });

describe('[RDC1-092] rough use of the frame and vision checks', () => {
  it('[RDC1-092] two new graphics, one bad: the fix call names only the bad one', async () => {
    const sent: string[] = [];
    const plan = { defs: { blocks: [{ id: 'good' }, { id: 'bad' }] } };
    let n = 0;
    const r = await planLoop({
      ...loopBase,
      ask: async (req) => {
        sent.push(req.messages.at(-1)!.content);
        return answerWith(plan);
      },
      frames: async () =>
        n++ === 0
          ? [
              { graphic: 'good', time: 1, blank: false, outside: false },
              { graphic: 'bad', time: 1, blank: true, outside: false },
            ]
          : [{ graphic: 'bad', time: 1, blank: false, outside: false }],
    });
    expect(r.ok).toBe(true);
    const fix = sent.find((s) => s.startsWith('FIX:'))!;
    expect(fix).toMatch(/"bad" draws nothing/);
    expect(fix).not.toMatch(/"good"/);
  });
  it('[RDC1-092] a chatty vision model: at most eight problems, each cut to 300 characters; "matches" with problems still counts them', async () => {
    const problems = Array.from(
      { length: 20 },
      (_, i) => `${i} ${'x'.repeat(400)}`,
    );
    const answers = [
      answerWith({ scenes: [{ id: 'a', narration: 'n' }] }),
      JSON.stringify({ matches: true, problems }),
    ];
    let fix = '';
    const r = await planLoop({
      ...loopBase,
      ask: async (req) => {
        const last = req.messages.at(-1)!.content;
        if (last.startsWith('FIX:')) fix = last;
        return answers.shift() ?? answerWith({ scenes: [] });
      },
      vision: {
        capable: true,
        frames: async () => [{ scene: 'a', base64: 'AA==' }],
      },
    });
    expect(r.ok).toBe(true);
    expect(r.steps).toContain('vision-problems:8');
    expect(fix.split('Seen in the frames:').length - 1).toBe(8);
    expect(fix).not.toMatch(/x{300}/);
  });
  it('[RDC1-092] the edge rule: ink on a fifth of an edge or less is not "outside"; just over it is', () => {
    const at = (rows: number) => {
      const w = 20,
        h = 20,
        d = new Uint8ClampedArray(w * h * 4);
      for (let y = 5; y < 5 + rows; y++) {
        const i = (y * w + 0) * 4;
        d[i] = 255;
        d[i + 3] = 255;
        d[i + 4] = 255;
        d[i + 7] = 255;
      }
      return judgeGraphic(lookAt(d, w, h));
    };
    expect(at(4).outside).toBe(false); // 4 of 20 rows = 20 %
    expect(at(5).outside).toBe(true); // 25 %
  });
  it('[RDC1-092] a frame of one transparent pixel is blank; a vision check with no frames asks nothing', async () => {
    expect(lookAt(new Uint8ClampedArray(4), 1, 1).blank).toBe(true);
    const ask = vi.fn(async () => answerWith({ scenes: [] }));
    const r = await planLoop({
      ...loopBase,
      ask,
      vision: { capable: true, frames: async () => [] },
    });
    expect(r.ok).toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it('[RDC1-092] the frame check throwing (not a stop) is not swallowed as success', async () => {
    await expect(
      planLoop({
        ...loopBase,
        ask: async () => answerWith({ defs: { blocks: [{ id: 'g' }] } }),
        frames: async () => {
          throw new Error('the renderer crashed');
        },
      }),
    ).rejects.toThrow('the renderer crashed');
  });
});

describe('[RDC1-094] rough use of the Brief rules', () => {
  it("[RDC1-094] the owner's own choices: changed caps reach the plan; an unknown or removed choice changes nothing; only-mine never allows AI", () => {
    const own = defaultConfig();
    own.director.assets.briefChoices = {
      'ai-pictures': { order: ['mine', 'ai'], aiImagesMax: 2, aiVideosMax: 1 },
      'only-mine': {
        order: ['mine'],
        onlyMine: true,
        aiImagesMax: 9,
        aiVideosMax: 3,
      },
    } as never;
    const cfg = platformConfigSchema.parse(own);
    expect(assetRuleFromBrief(cfg, 'ai-pictures')).toEqual({
      order: ['mine', 'ai'],
      aiImagesMax: 2,
      aiVideosMax: 1,
      onlyMine: false,
    });
    expect(assetRuleFromBrief(cfg, 'stock-first')).toBeNull();
    expect(assetRuleFromBrief(cfg, '__proto__')).toBeNull();
    expect(assetRuleFromBrief(cfg, undefined)).toBeNull();
    expect(assetRuleFromBrief(cfg, 'only-mine')).toMatchObject({
      onlyMine: true,
      aiImagesMax: 0,
      aiVideosMax: 0,
    });
  });
  it('[RDC1-094] only a plain web address is read; scripts, files, other schemes, words and huge text are not', () => {
    expect(referenceUrl(' https://forts.example.com/hill ')).toBe(
      'https://forts.example.com/hill',
    );
    for (const bad of [
      'javascript:alert(1)',
      'ftp://x.example.com/a',
      'file:///etc/passwd',
      'see my notes about forts',
      'https://a.example.com/x y',
      `https://a.example.com/${'x'.repeat(2100)}`,
      '',
      undefined,
    ])
      expect(referenceUrl(bad)).toBeNull();
  });
});

const voice = (over: Partial<MediaProvider> = {}): MediaProvider =>
  ({
    id: 'v1',
    name: 'Voice One',
    kinds: ['text-to-speech'],
    enabled: true,
    plans: [],
    costPerCall: 4,
    rateLimit: { perMinute: 2 },
    hint: { en: 'Voices.' },
    licences: [],
    adapter: {
      type: 'rest',
      descriptor: {
        baseUrl: 'https://voice.example.test',
        searchPath: '/',
        auth: { style: 'none', name: '', prefix: '' },
        request: {},
        speech: {
          path: '/say',
          response: { audio: 'a', text: 't', words: 'w' },
        },
      },
    },
    ...over,
  }) as never;
const speechConfig = (p: MediaProvider) => {
  const cfg = defaultConfig();
  cfg.mediaProviders.push(p);
  return platformConfigSchema.parse(cfg);
};
const d = (cfg: ReturnType<typeof speechConfig>) =>
  (cfg.mediaProviders.at(-1)!.adapter as unknown as { descriptor: never })
    .descriptor;

describe('[RDC1-096] rough use of voices and captions by provider', () => {
  it('[RDC1-096] an answer with no audio, or audio that is not base64, is one sentence', () => {
    const cfg = speechConfig(voice());
    const p = cfg.mediaProviders.at(-1)!;
    expect(() => speakResult({}, p, d(cfg))).toThrow('it sent no audio.');
    expect(() => speakResult({ a: '<html>oops</html>' }, p, d(cfg))).toThrow(
      'it sent no audio.',
    );
  });
  it('[RDC1-096] captions with no words and no text fail plainly; broken word times are dropped', () => {
    const cfg = speechConfig(voice({ kinds: ['speech-to-text'] }));
    const p = cfg.mediaProviders.at(-1)!;
    expect(() => transcribeResult({ w: [] }, p, d(cfg))).toThrow(
      'it sent no words.',
    );
    const r = transcribeResult(
      {
        w: [
          { text: 'a', start: 1, end: 0.5 },
          { text: '', start: 0, end: 1 },
          { text: 'ok', start: 0, end: 1 },
        ],
      },
      p,
      d(cfg),
    );
    expect(r.words).toEqual([{ text: 'ok', start: 0, end: 1 }]);
    expect(r.text).toBe('ok');
  });
  it('[RDC1-096] the rate limit and the credits come from the config: a third call in a minute and a call without credits send nothing', async () => {
    const cfg = speechConfig(voice());
    const calls: unknown[] = [];
    const run: SpeechRunner = async (x) => {
      calls.push(x.body);
      return { a: 'UklGRg==' };
    };
    const spent: number[] = [];
    let left = 100;
    const ctx: ToolContext = {
      config: cfg,
      planId: cfg.plans[0]!.id,
      userId: 'u',
      media: { builtin: {}, rest: async () => [] },
      usage: memoryUsageLog(),
      limiter: new RateLimiter(() => 1000),
      speech: run,
      available: () => left,
      spend: (_s, n) => {
        left -= n;
        spent.push(n);
      },
    };
    const say = () => runTool('speak', { text: 'hi', lang: 'en' }, ctx);
    expect((await say()).ok).toBe(true);
    expect((await say()).ok).toBe(true);
    expect(await say()).toMatchObject({
      ok: false,
      code: 'rate-limit',
      error: 'Voice One is busy; try again in a minute.',
    });
    expect(calls).toHaveLength(2);
    expect(spent).toEqual([4, 4]);
    const poor = await runTool(
      'speak',
      { text: 'hi', lang: 'en' },
      { ...ctx, limiter: undefined, available: () => 1 },
    );
    expect(poor).toMatchObject({ ok: false, code: 'no-credits' });
    expect(calls).toHaveLength(2);
  });
  it('[RDC1-096] in a browser without the server, provider voices say they need the server; offline fixtures answer like the provider', async () => {
    const cfg = speechConfig(voice({ costPerCall: 0 }));
    const base: ToolContext = {
      config: cfg,
      planId: cfg.plans[0]!.id,
      userId: 'u',
      media: { builtin: {}, rest: async () => [] },
    };
    expect(
      await runTool('speak', { text: 'hi', lang: 'en' }, base),
    ).toMatchObject({
      ok: false,
      error: 'Voices and captions from providers need the server.',
    });
    const r = await runTool(
      'speak',
      { text: 'hi', lang: 'en' },
      { ...base, speech: speechFixtureRunner({ v1: { a: 'UklGRg==' } }) },
    );
    expect(r.ok && r.output).toMatchObject({
      provider: 'v1',
      licence: 'provider-licence',
      attribution: 'Voice One',
    });
  });
  it('[RDC1-096] a speech answer larger than its cap is refused', async () => {
    const big = new Response('x'.repeat(5000), {
      headers: { 'content-type': 'application/json' },
    });
    await expect(
      safeFetch('https://voice.example.test/say', {
        fetch: async () => big,
        resolve: async () => ['93.184.216.34'],
        hosts: ['voice.example.test'],
        post: '{}',
        timeoutMs: 1000,
        maxBytes: 1024,
      }),
    ).rejects.toThrow(/too large/);
  });
});
