import { describe, expect, it } from 'vitest';
import {
  buildBrief,
  canUse,
  costOf,
  defaultConfig,
  enabledStyles,
  localConfigSource,
  nextQuestions,
  parseConfig,
  planFor,
  styleById,
  text,
  toolDecision,
  validateBrief,
} from '../../src/platform-config';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const style = () => styleById(defaultConfig(), 'story-explainer')!;

describe('P2-0 platform config', () => {
  it('[P20-001] the built-in default is valid', () => {
    expect(parseConfig(defaultConfig()).ok).toBe(true);
  });
  it('[P20-002] bad configs are refused with readable errors', () => {
    const c = defaultConfig();
    c.studios[0]!.costId = 'nope';
    c.styles[0]!.brief.fields[5]!.showIf = { field: 'missing', in: ['x'] };
    const r = parseConfig(c);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.join(' ')).toMatch(/unknown cost[\s\S]*unknown field/);
    expect(parseConfig({ ...defaultConfig(), schemaVersion: 99 }).ok).toBe(
      false,
    );
  });
  it('[P20-003] plans, limits and costs come from config', () => {
    const c = defaultConfig();
    const free = planFor(c, undefined);
    expect(free.id).toBe('free');
    expect(canUse(free, ['studio-video'])).toBe(false);
    expect(canUse(planFor(c, 'pro'), ['studio-video'])).toBe(true);
    expect(costOf(c, 'voice', 2)).toBe(12);
    expect(costOf(c, 'scene-motion', 1, 'min')).toBe(3);
    expect(text({ en: 'a', hi: 'b' }, 'hi')).toBe('b');
    expect(text({ en: 'a' }, 'hi')).toBe('a');
  });
  it('[P20-004] the gateway rule: tools off, unknown or above the plan are refused', () => {
    const c = defaultConfig();
    const free = planFor(c, 'free');
    expect(toolDecision(c.director, free, 'motion-graphics')).toMatchObject({
      ok: true,
    });
    expect(toolDecision(c.director, free, 'ai-video')).toEqual({
      ok: false,
      reason: 'plan',
    });
    expect(toolDecision(c.director, free, 'hack')).toEqual({
      ok: false,
      reason: 'unknown-tool',
    });
    c.director.tools[0]!.enabled = false;
    expect(toolDecision(c.director, free, 'motion-graphics')).toEqual({
      ok: false,
      reason: 'disabled',
    });
  });
  it('[P20-005] the Brief form is built from the Style: visibility, validation, brief JSON', () => {
    const s = style();
    expect(validateBrief(s, {}).map((i) => i.field)).toEqual([
      'idea',
      'script',
      'voice',
    ]);
    const a = {
      idea: 'Eratosthenes',
      script: 'ai',
      voice: 'clone',
      captionLang: 'hi',
      captionStyle: 'bold',
      junk: 1,
    };
    expect(validateBrief(s, a)).toEqual([]);
    expect(validateBrief(s, { ...a, voice: 'bad' })).toEqual([
      { field: 'voice', code: 'option' },
    ]);
    const hidden = buildBrief(s, {
      idea: 'x',
      script: 'ai',
      voice: 'tts',
      captionStyle: 'bold',
    });
    expect(hidden.answers).not.toHaveProperty('captionStyle');
    expect(buildBrief(s, a).answers).not.toHaveProperty('junk');
  });
  it('[P20-006] the interview skips what is answered and respects the cap', () => {
    const s = style();
    expect(nextQuestions(s, {}).map((q) => q.id)).toEqual([
      'q-script',
      'q-voice',
      'q-music',
      'q-captions',
    ]);
    expect(
      nextQuestions(s, { script: 'ai', voice: 'tts' }).map((q) => q.id),
    ).toEqual(['q-music', 'q-captions']);
    const capped = { ...s, interview: { ...s.interview, maxQuestions: 1 } };
    expect(nextQuestions(capped, {})).toHaveLength(1);
    const c = defaultConfig();
    const n = enabledStyles(c).length;
    c.styles[0]!.enabled = false;
    expect(enabledStyles(c)).toHaveLength(n - 1);
  });
  it('[P20-007] versions are saved, published and rolled back; bad saves change nothing', async () => {
    const src = localConfigSource(mem(), () => '2026-11-01T00:00:00Z');
    expect((await src.getLive()).version).toBe(0);
    const c1 = defaultConfig();
    const v1 = await src.save(c1, 'first');
    const c2 = defaultConfig();
    c2.brand.name = 'Second';
    const v2 = await src.save(c2, 'second');
    expect([v1.version, v2.version]).toEqual([1, 2]);
    await src.publish(2);
    expect((await src.getLive()).config.brand.name).toBe('Second');
    await src.rollback(1);
    expect((await src.getLive()).config.brand.name).toBe('Platform');
    await expect(src.save({ nope: true }, 'bad')).rejects.toThrow(/refused/);
    expect(await src.list()).toHaveLength(2);
  });
  it('[P20-008] unreadable storage falls back to the built-in default', async () => {
    const bad = { getItem: () => '{not json', setItem: () => {} };
    const live = await localConfigSource(bad).getLive();
    expect(live.version).toBe(0);
    expect(live.config.plans.length).toBeGreaterThan(0);
  });
});
