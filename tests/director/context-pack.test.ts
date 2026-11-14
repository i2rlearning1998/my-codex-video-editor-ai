// ROUND-B B1: the context pack's order, budget and drop order.
import { describe, expect, it } from 'vitest';
import {
  buildContextPack,
  tokensOf,
  type PackInput,
} from '../../src/director/context-pack';
import type { Entry, Turn } from '../../src/project/video-memory';

const at = (n: number) => `2026-11-13T00:00:${String(n).padStart(2, '0')}.000Z`;
const e = (text: string, n: number, pinned = false): Entry => ({
  id: `e${n}`,
  text,
  pinned,
  source: 'director',
  at: at(n),
});
const turn = (n: number): Turn => ({
  id: `t${n}`,
  role: n % 2 ? 'user' : 'director',
  text: `turn number ${n} ${'x'.repeat(60)}`,
  at: at(n),
});
const input = (over: Partial<PackInput> = {}): PackInput => ({
  rulebook: 'RULEBOOK\nYou are the Director.',
  playbook: `Playbook ${'p'.repeat(200)}`,
  styleLines: ['Voice: warm female, Hindi'],
  facts: [
    e('loose fact one', 1),
    e('loose fact two', 2),
    e('PINNED fact', 3, true),
  ],
  sheet: {
    brief: [e('Topic: how rain forms', 4)],
    scenes: [e('Scene 1: clouds', 5), e('Scene 2: drops', 6)],
    assets: [e('cloud.png: uploaded', 7)],
    decisions: [e('Made title bigger', 8), e('KEEP blue', 9, true)],
  },
  notes: [
    {
      id: 'n1',
      name: 'chapter.pdf',
      kind: 'pdf',
      bytes: 9,
      note: 'water cycle',
      at: at(10),
    },
  ],
  summary: `Summary ${'s'.repeat(120)}`,
  turns: Array.from({ length: 12 }, (_, i) => turn(i + 1)),
  canvas: {
    scenes: ['1. Clouds (5 s)', '2. Drops (5 s)'],
    layers: ['Title (text)', 'Sky (shape)'],
  },
  selection: 'Title (text) in scene 1',
  budgetTokens: 100000,
  lastTurns: 8,
  ...over,
});

describe('[RDB-005] the context pack', () => {
  it('[RDB-005] keeps the stated order and reads only the last N turns', () => {
    const p = buildContextPack(input());
    const order = [
      'RULEBOOK',
      'STYLE PLAYBOOK',
      'PROJECT MEMORY',
      'VIDEO SHEET: BRIEF',
      'VIDEO SHEET: SCENES',
      'VIDEO SHEET: ASSETS',
      'VIDEO SHEET: DECISIONS',
      'FILE NOTES',
      'EARLIER IN THIS CHAT',
      'LAST TURNS',
      'CANVAS NOW: SCENES',
      'CANVAS NOW: OPEN SCENE LAYERS',
      'SELECTED',
    ].map((k) => p.text.indexOf(k));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(p.text).toContain('turn number 12');
    expect(p.text).toContain('turn number 5 ');
    expect(p.text).not.toContain('turn number 4 ');
    expect(p.dropped).toEqual([]);
    expect(p.over).toBe(false);
    expect(p.tokens).toBe(tokensOf(p.text));
  });

  it('[RDB-005] fits the budget by dropping in the stated order, one item at a time', () => {
    const full = buildContextPack(input()).tokens;
    // A little under the full size: only the oldest turns leave.
    const a = buildContextPack(input({ budgetTokens: full - 10 }));
    expect(a.tokens).toBeLessThanOrEqual(full - 10);
    expect(new Set(a.dropped)).toEqual(new Set(['turn']));
    expect(a.text).toContain('turn number 12');
    expect(a.text).toContain('EARLIER IN THIS CHAT');
    // Tight: everything that may leave has left, in order.
    const b = buildContextPack(input({ budgetTokens: 1 }));
    const kinds = b.dropped.filter((k, i) => b.dropped[i - 1] !== k);
    expect(kinds).toEqual([
      'turn',
      'summary',
      'note',
      'fact',
      'playbook',
      'decision',
      'asset',
      'canvas-layers',
      'pinned-fact',
    ]);
    expect(b.dropped.filter((k) => k === 'turn')).toHaveLength(6);
    expect(b.over).toBe(true);
  });

  it('[RDB-005] never drops the rulebook, the brief, the scene lines, pinned decisions, the scene list, the selection or the two newest turns', () => {
    const p = buildContextPack(input({ budgetTokens: 1 }));
    for (const must of [
      'You are the Director.',
      'Topic: how rain forms',
      'Scene 2: drops',
      'KEEP blue',
      '2. Drops (5 s)',
      'Title (text) in scene 1',
      'turn number 11',
      'turn number 12',
    ])
      expect(p.text).toContain(must);
    for (const gone of [
      'Playbook',
      'loose fact',
      'PINNED fact',
      'chapter.pdf',
      'Sky (shape)',
      'Made title bigger',
    ])
      expect(p.text).not.toContain(gone);
  });

  it('[RDB-005] a very long chat still reads the brief: pinned facts outlast loose ones', () => {
    const base = input({
      turns: Array.from({ length: 400 }, (_, i) => turn(i + 1)),
    });
    let budget = buildContextPack(base).tokens;
    let mid = buildContextPack(base);
    while (!mid.dropped.includes('fact') && budget > 1)
      mid = buildContextPack({ ...base, budgetTokens: (budget -= 5) });
    expect(mid.dropped).toContain('fact');
    expect(mid.dropped).not.toContain('pinned-fact');
    expect(mid.text).toContain('Topic: how rain forms');
    expect(mid.text).toContain('PINNED fact');
    expect(mid.text).not.toContain('loose fact one');
  });
});
