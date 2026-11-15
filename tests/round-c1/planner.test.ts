// RDC1-030..033 (planner side of C1.4, C1.5, C1.7): the research step with
// a fixed tool list and a cap, new graphics checked and repaired once,
// sample frames fixed once, two failures refused with nothing charged; the
// rulebook, video-type playbook and authoring guide come from the config.
import { describe, expect, it } from 'vitest';
import { llmPlan, mockPlanner, planPrompt } from '../../src/director';
import {
  defaultConfig,
  planFor,
  platformConfigSchema,
  styleById,
} from '../../src/platform-config';
import type { VideoPlan } from '../../src/video-plan';
import { BAR_RISE } from './v4-fixtures';

const c = platformConfigSchema.parse(defaultConfig());
const style = styleById(c, 'story-explainer')!;
const pro = planFor(c, 'pro');
const answers = { idea: 'How rivers carve valleys.', captionLang: 'en' };
const noGateway = {
  startJob: () => {
    throw new Error('the offline model must not start a paid job');
  },
};
const base = async (): Promise<VideoPlan> =>
  (await mockPlanner().draft({
    config: c,
    style,
    answers,
    notes: [],
    plan: pro,
  })) as VideoPlan;
const withGraphic = (plan: VideoPlan, source = BAR_RISE) => ({
  ...plan,
  version: 4 as const,
  defs: {
    blocks: [
      { id: 'bar-rise', tier: 'B' as const, source, summary: 'Bars rise.' },
    ],
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
const run = (script: string[], over: Record<string, unknown> = {}) => {
  const steps: string[] = [];
  return {
    steps,
    result: llmPlan({
      gateway: noGateway as never,
      config: c,
      style,
      answers,
      notes: [],
      plan: pro,
      locale: 'en',
      userId: 'u',
      modelId: 'mock-planner',
      key: 'k',
      script,
      onStep: (s) => steps.push(s),
      ...over,
    }),
  };
};
const j = (v: unknown) => JSON.stringify(v);

describe('[RDC1-030] research step', () => {
  it('[RDC1-030] the model asks for tools from the fixed list; results come back as data; then the plan', async () => {
    const plan = await base();
    const asked: string[] = [];
    const r = run(
      [
        j({
          research: [
            { tool: 'searchWeb', input: { query: 'river valley' } },
            { tool: 'deleteFiles', input: {} },
          ],
        }),
        j({ plan, upgrades: [] }),
      ],
      {
        research: async (tool: string, input: unknown) => (
          asked.push(`${tool}:${j(input)}`),
          { ok: true, text: '<<UNTRUSTED WEB TEXT>> rivers erode' }
        ),
      },
    );
    const out = await r.result;
    expect(out.ok).toBe(true);
    expect(out.credits).toBe(0);
    expect(asked).toEqual(['searchWeb:{"query":"river valley"}']);
    expect(r.steps).toEqual([
      'research:searchWeb',
      'research-refused:deleteFiles',
      'check-ok',
    ]);
  });
  it('[RDC1-030] research past the cap is stopped; a model that keeps asking is refused with the owner text', async () => {
    const plan = await base();
    const ask = j({
      research: [
        { tool: 'searchMedia', input: { kind: 'stock-photo', query: 'x' } },
      ],
    });
    const research = async () => ({ ok: true, text: 'ok' });
    const fine = run([ask, ask, ask, ask, ask, j({ plan, upgrades: [] })], {
      research,
    });
    expect((await fine.result).ok).toBe(true);
    expect(fine.steps.filter((s) => s.startsWith('research:'))).toHaveLength(4);
    expect(fine.steps).toContain('research-stopped');
    const loop = run([ask, ask, ask, ask, ask, ask], { research });
    const out = await loop.result;
    expect(out.ok).toBe(false);
    expect(out.ok || out.errors[0]).toMatch(/kept asking for research/);
    expect(out.credits).toBe(0);
  });
});

describe('[RDC1-031] new graphics: check, one repair, frames, refuse', () => {
  it('[RDC1-031] a graphic that breaks the drawing rules is repaired once with the exact error', async () => {
    const plan = await base();
    const broken = withGraphic(
      plan,
      BAR_RISE.replace(
        'ctx.fillStyle = params.color;',
        'ctx.fillStyle = params.color; document.title = "x";',
      ),
    );
    const r = run([
      j({ plan: broken, upgrades: [] }),
      j({ plan: withGraphic(plan), upgrades: [] }),
    ]);
    const out = await r.result;
    expect(out.ok).toBe(true);
    expect(out.ok && out.repaired).toBe(true);
    expect(r.steps).toEqual(['check-failed:1', 'check-ok']);
  });
  it('[RDC1-031] a blank or outside frame gets one fix call; failing twice is refused, nothing charged', async () => {
    const plan = await base();
    let n = 0;
    const frames = async () =>
      n++ === 0
        ? [{ graphic: 'bar-rise', time: 1, blank: true, outside: false }]
        : [{ graphic: 'bar-rise', time: 1, blank: false, outside: false }];
    const ok = run(
      [
        j({ plan: withGraphic(plan), upgrades: [] }),
        j({ plan: withGraphic(plan), upgrades: [] }),
      ],
      { frames },
    );
    expect((await ok.result).ok).toBe(true);
    expect(ok.steps).toEqual([
      'check-ok',
      'frames-bad:bar-rise',
      'check-ok',
      'frames-ok',
    ]);
    const never = run(
      [
        j({ plan: withGraphic(plan), upgrades: [] }),
        j({ plan: withGraphic(plan), upgrades: [] }),
      ],
      {
        frames: async () => [
          { graphic: 'bar-rise', time: 2, blank: false, outside: true },
        ],
      },
    );
    const out = await never.result;
    expect(out).toMatchObject({ ok: false, credits: 0 });
    expect(out.ok || out.errors[0]).toMatch(/draws outside the canvas/);
  });
  it('[RDC1-031] a graphic with the id of a built-in, or two settings with one name, is an error', async () => {
    const plan = await base();
    const builtin = {
      ...withGraphic(plan),
      defs: {
        blocks: [
          {
            id: 'counter',
            tier: 'B',
            source: BAR_RISE.replace("id: 'bar-rise'", "id: 'counter'"),
          },
        ],
      },
    };
    const dupes = withGraphic(
      plan,
      BAR_RISE.replace("{ name: 'speed'", "{ name: 'bars'"),
    );
    const out = await run([
      j({ plan: builtin, upgrades: [] }),
      j({ plan: dupes, upgrades: [] }),
    ]).result;
    expect(out.ok).toBe(false);
    expect(out.ok || out.errors.join(' ')).toMatch(
      /Unsafe or duplicate|two settings|duplicate/i,
    );
  });
});

describe('[RDC1-033] power rules come from the config', () => {
  it("[RDC1-033] rulebook v2 (English and Hindi in config), the video type's playbook slot and the authoring guide reach the prompt", () => {
    // ROUND-C2 (D-438, D-439): the defaults are now the architect's TEXTS:
    // T1's items first, then the Round C1 items T1 does not name (which keep
    // their Hindi lines); playbooks for eight video types.
    expect(c.director.rulebook.map((r) => r.id).slice(-4)).toEqual([
      'never-refuse-makeable',
      'design-new',
      'check-layout',
      'providers-by-kind',
    ]);
    expect(c.director.rulebook[0]!.id).toBe('scope');
    expect(
      c.director.rulebook.slice(-4).every((r) => r.hi && r.hi !== r.en),
    ).toBe(true);
    expect(Object.keys(c.director.playbooks).sort()).toEqual([
      'documentary',
      'explainer',
      'lesson',
      'logo-intro',
      'product',
      'recording',
      'short',
      'story',
    ]);
    const cfg = structuredClone(c);
    cfg.director.playbooks.documentary =
      'SAMPLE PLAYBOOK: archive photos first.';
    cfg.director.authoring.guide = 'SAMPLE GUIDE: draw with ctx only.';
    const p = planPrompt({
      config: cfg,
      style,
      answers,
      notes: [],
      plan: pro,
      locale: 'en',
      videoType: 'documentary',
    });
    expect(p.system).toContain('Never refuse a picture, graphic or sound');
    expect(p.system).toContain(
      'Video type: documentary.\nSAMPLE PLAYBOOK: archive photos first.',
    );
    expect(p.system).toContain('SAMPLE GUIDE: draw with ctx only.');
    expect(p.system).toContain(
      'VIDEO TYPES: explainer, lesson, story, product, short, recording, documentary, logo-intro, general',
    );
    // A type added in config only is known to the sheet and the prompt.
    cfg.director.fieldLibrary.types.push({
      id: 'reel',
      name: { en: 'Reel' },
      keywords: ['reel'],
      blocks: [{ id: 'topic', required: true }],
    });
    cfg.director.playbooks.reel = 'SAMPLE REEL';
    const q = planPrompt({
      config: cfg,
      style,
      answers,
      notes: [],
      plan: pro,
      locale: 'en',
      videoType: 'reel',
    });
    expect(q.system).toContain('Video type: reel.\nSAMPLE REEL');
    expect(q.system).toMatch(/VIDEO TYPES: .*general, reel/);
  });
  it('[RDC1-043] the offline planner keeps every text inside a 9:16 frame', async () => {
    const r = await llmPlan({
      gateway: noGateway as never,
      config: c,
      style,
      answers: {
        ...answers,
        idea: 'A very long title that keeps going and going about rivers, valleys, canyons, deltas and the sea, in one breath, for a vertical short',
      },
      notes: [],
      plan: pro,
      locale: 'en',
      userId: 'u',
      modelId: 'mock-planner',
      key: 'k',
    });
    expect(r.ok).toBe(true);
    const { checkLayout } = await import('../../src/video-plan/layout-check');
    const plan = r.ok
      ? { ...r.plan, meta: { ...r.plan.meta, aspect: '9:16' as const } }
      : null;
    const { fitTextsInFrame } = await import('../../src/director/plan-loop');
    expect(
      checkLayout(fitTextsInFrame(c, plan!)).filter((f) => f.level === 'error'),
    ).toEqual([]);
  });
});
