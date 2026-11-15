// ROUND-C1 F2 (C1.5.2, C1.6.2): how a sample frame is judged (blank, cut off
// at the edge), the vision check (skipped with a note without vision; one
// fix call with what it saw), graphics that throw or loop, and refunds.
import { describe, expect, it, vi } from 'vitest';
import { llmPlan, mockPlanner } from '../../src/director';
import {
  defaultConfig,
  planFor,
  platformConfigSchema,
  styleById,
} from '../../src/platform-config';
import { judgeGraphic, lookAt } from '../../src/ui/render-frames';
import type { VideoPlan } from '../../src/video-plan';
import { BAR_RISE } from './v4-fixtures';

const pixels = (
  w: number,
  h: number,
  paint: (x: number, y: number) => number,
) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = paint(x, y);
      const i = (y * w + x) * 4;
      d[i] = 200;
      d[i + 1] = 40;
      d[i + 2] = 40;
      d[i + 3] = a;
    }
  return d;
};
const judge = (d: Uint8ClampedArray) => judgeGraphic(lookAt(d, 40, 30));

describe('[RDC1-061] a sample frame of a new graphic is judged by its pixels', () => {
  it('[RDC1-061] no ink is blank; ink cut along an edge is outside; a centred shape or a full background is neither', () => {
    expect(judge(pixels(40, 30, () => 0))).toEqual({
      blank: true,
      outside: false,
    });
    // A bar hanging off the left edge (14 of 30 rows there have ink).
    expect(
      judge(pixels(40, 30, (x, y) => (x < 12 && y > 8 && y < 23 ? 255 : 0))),
    ).toEqual({ blank: false, outside: true });
    // A centred box, away from every edge.
    expect(
      judge(
        pixels(40, 30, (x, y) =>
          x > 10 && x < 30 && y > 8 && y < 22 ? 255 : 0,
        ),
      ),
    ).toEqual({ blank: false, outside: false });
    // A full-canvas background is meant to reach the edges.
    expect(judge(pixels(40, 30, (x) => (x % 2 ? 255 : 230)))).toEqual({
      blank: false,
      outside: false,
    });
    // One flat colour everywhere (alpha and colour equal) counts as blank.
    expect(judge(pixels(40, 30, () => 255)).blank).toBe(true);
  });
});

const base = platformConfigSchema.parse(defaultConfig());
const visionConfig = (() => {
  const c = structuredClone(defaultConfig()) as unknown as {
    models: { id: string; capabilities?: { vision?: boolean } }[];
  };
  const m = c.models.find((x) => x.id === 'mock-balanced')!;
  m.capabilities = { ...(m.capabilities ?? {}), vision: true };
  return platformConfigSchema.parse(c);
})();
const style = styleById(base, 'story-explainer')!;
const pro = planFor(base, 'pro');
const answers = { idea: 'How rivers carve valleys.', captionLang: 'en' };
const draft = async (): Promise<VideoPlan> =>
  (await mockPlanner().draft({
    config: base,
    style,
    answers,
    notes: [],
    plan: pro,
  })) as VideoPlan;
const withGraphic = (plan: VideoPlan) => ({
  ...plan,
  version: 4 as const,
  defs: {
    blocks: [{ id: 'bar-rise', tier: 'B' as const, source: BAR_RISE }],
  },
  scenes: plan.scenes.map((s, i) =>
    i === 0
      ? {
          ...s,
          layers: [
            ...s.layers,
            {
              id: 'g',
              kind: 'block' as const,
              block: 'bar-rise',
              anchor: 'center' as const,
              size: 'medium' as const,
              enter: 'fade' as const,
              exit: 'none' as const,
            },
          ],
        }
      : s,
  ),
});
const j = (v: unknown) => JSON.stringify(v);
const shots = async () => [{ scene: 'one', base64: 'iVBORw0KGgo=' }];
const run = (
  config: typeof base,
  modelId: string,
  script: string[],
  over: Record<string, unknown> = {},
) => {
  const steps: string[] = [];
  return {
    steps,
    result: llmPlan({
      gateway: {
        startJob: () => {
          throw new Error('offline must not start a paid job');
        },
      } as never,
      config,
      style,
      answers,
      notes: [],
      plan: pro,
      locale: 'en',
      userId: 'u',
      modelId,
      key: 'k',
      script,
      onStep: (s: string) => steps.push(s),
      ...over,
    }),
  };
};

describe('[RDC1-062] the vision check looks at the built frames when the model can see', () => {
  it('[RDC1-062] a model without vision: the check is skipped with a plain note and the plan is kept', async () => {
    const plan = await draft();
    const r = run(base, 'mock-balanced', [j({ plan, upgrades: [] })], {
      visionFrames: shots,
    });
    const out = await r.result;
    expect(out.ok).toBe(true);
    expect(out.ok && out.notes).toEqual(['vision-skipped']);
    expect(r.steps).toEqual(['check-ok', 'vision-skipped']);
  });
  it('[RDC1-062] with vision: the frames go with the question; problems get ONE fix call; a clean second look passes', async () => {
    const plan = await draft();
    const asked: unknown[] = [];
    const r = run(
      visionConfig,
      'mock-balanced',
      [
        j({ plan, upgrades: [] }),
        j({ matches: false, problems: ['The title is cut off in scene 1.'] }),
        j({ plan, upgrades: [] }),
        j({ matches: true, problems: [] }),
      ],
      {
        visionFrames: async (p: VideoPlan) => {
          asked.push(p.meta.title);
          return shots();
        },
      },
    );
    const out = await r.result;
    expect(out.ok).toBe(true);
    expect(out.ok && out.notes).toEqual([]);
    expect(out.ok && out.repaired).toBe(true);
    expect(asked).toHaveLength(2);
    expect(r.steps).toEqual([
      'check-ok',
      'vision-problems:1',
      'check-ok',
      'vision-ok',
    ]);
  });
  it('[RDC1-062] problems still seen after the fix are kept as notes (not refused); an unreadable answer is passed over', async () => {
    const plan = await draft();
    const still = await run(
      visionConfig,
      'mock-balanced',
      [
        j({ plan, upgrades: [] }),
        j({ matches: false, problems: ['Too dark.'] }),
        j({ plan, upgrades: [] }),
        j({ matches: false, problems: ['Still too dark.'] }),
      ],
      { visionFrames: shots },
    ).result;
    expect(still.ok && still.notes).toEqual(['Still too dark.']);
    const odd = run(
      visionConfig,
      'mock-balanced',
      [j({ plan, upgrades: [] }), 'I think it looks fine!'],
      { visionFrames: shots },
    );
    expect((await odd.result).ok).toBe(true);
    expect(odd.steps).toEqual(['check-ok', 'vision-unreadable']);
  });
});

describe('[RDC1-063] graphics that throw or loop are fixed once; two failures refuse and give every credit back', () => {
  it('[RDC1-063] an error or a time-out in a sample frame asks for ONE fix with the reason', async () => {
    const plan = withGraphic(await draft());
    let n = 0;
    const r = run(
      base,
      'mock-planner',
      [j({ plan, upgrades: [] }), j({ plan, upgrades: [] })],
      {
        frames: async () =>
          n++ === 0
            ? [
                {
                  graphic: 'bar-rise',
                  time: 1,
                  blank: false,
                  outside: false,
                  error:
                    'it did not finish a frame in 8 s (it may loop forever)',
                },
              ]
            : [{ graphic: 'bar-rise', time: 1, blank: false, outside: false }],
      },
    );
    expect((await r.result).ok).toBe(true);
    expect(r.steps).toEqual([
      'check-ok',
      'frames-bad:bar-rise',
      'check-ok',
      'frames-ok',
    ]);
  });
  it('[RDC1-063] with a real model a graphic that throws twice is refused with the owner text: the hold is refunded, nothing settled', async () => {
    const plan = withGraphic(await draft());
    const model = base.models.find(
      (m) => m.providerId !== 'mock' && m.kind === 'text',
    )!;
    const job = {
      call: vi.fn(async () => ({ text: j({ plan, upgrades: [] }) })),
      finish: vi.fn(async () => 5),
      fail: vi.fn(async () => undefined),
    };
    const out = await llmPlan({
      gateway: { startJob: () => job } as never,
      config: base,
      style,
      answers,
      notes: [],
      plan: pro,
      locale: 'en',
      userId: 'u',
      modelId: model.id,
      key: 'k',
      frames: async () => [
        {
          graphic: 'bar-rise',
          time: 1,
          blank: false,
          outside: false,
          error: 'boom',
        },
      ],
    });
    expect(out).toMatchObject({ ok: false, credits: 0 });
    expect(out.ok || out.message).toMatch(/could not|plan/i);
    expect(out.ok || out.errors[0]).toMatch(/did not draw.*boom/);
    expect(job.fail).toHaveBeenCalledTimes(1);
    expect(job.finish).not.toHaveBeenCalled();
    expect(job.call).toHaveBeenCalledTimes(2);
  });
  it('[RDC1-063] a Stop during the check (an abort) is not a charge: the hold is refunded', async () => {
    const plan = withGraphic(await draft());
    const model = base.models.find(
      (m) => m.providerId !== 'mock' && m.kind === 'text',
    )!;
    const job = {
      call: vi.fn(async () => ({ text: j({ plan, upgrades: [] }) })),
      finish: vi.fn(async () => 5),
      fail: vi.fn(async () => undefined),
    };
    await expect(
      llmPlan({
        gateway: { startJob: () => job } as never,
        config: base,
        style,
        answers,
        notes: [],
        plan: pro,
        locale: 'en',
        userId: 'u',
        modelId: model.id,
        key: 'k',
        frames: async () => {
          throw new DOMException('stopped', 'AbortError');
        },
      }),
    ).rejects.toThrow(/stopped/);
    expect(job.fail).toHaveBeenCalledTimes(1);
    expect(job.finish).not.toHaveBeenCalled();
  });
});
