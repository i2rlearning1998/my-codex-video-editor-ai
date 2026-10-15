import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ITEM_KINDS } from '../src/creator-pack/schemas';
import {
  BRIEF_HEADER,
  BRIEF_LIMIT,
  authoringRules,
  buildAiBrief,
} from '../src/ai-brief/brief';

const authoring = readFileSync('docs/CREATOR-PACK-AUTHORING.md', 'utf8');
const base = {
  project: {
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 12,
    theme: {
      name: 'Dark Neon',
      palette: { background: '#0b0b1a', text: '#f8fafc' },
      fonts: { heading: 'Poppins', body: 'Inter' },
      motion: 'snappy',
    },
  },
  kinds: ITEM_KINDS,
  entries: { shape: [{ id: 'shape-star', label: 'Star' }] },
  blocks: [{ id: 'counter', label: 'Signal counter' }],
  animate: { in: ['fade'], loop: ['pulse'] },
  fonts: ['Inter', 'Poppins'],
  authoring,
};

describe('[QT-022] Copy AI brief', () => {
  it('lists every registered Creator Pack kind, the project facts, the rules and the request', () => {
    const { text, count } = buildAiBrief({ ...base, request: 'A 20 s intro' });
    expect(text.startsWith(BRIEF_HEADER)).toBe(true);
    for (const kind of ITEM_KINDS) expect(text).toContain(`\n${kind}:\n`);
    expect(ITEM_KINDS).toContain('theme');
    expect(text).toContain('canvas: 1920x1080 (16:9), 30 fps, 12.0 s');
    expect(text).toContain('theme: Dark Neon; palette background #0b0b1a');
    expect(text).toContain('  shape-star - Star');
    expect(text).toContain('RULES');
    expect(text).toContain('## Theme items');
    expect(text).not.toContain('```json');
    expect(text.trim().endsWith('REQUEST: A 20 s intro')).toBe(true);
    expect(count).toBe(2);
  });
  it('keeps the rules under 3,000 words and the brief under 40 KB with a huge library', () => {
    expect(authoringRules(authoring).split(/\s+/).length).toBeLessThanOrEqual(
      3000,
    );
    const many = Array.from({ length: 20000 }, (_, index) => ({
      id: `item-${index}`,
      label: `A long library item label number ${index}`,
    }));
    const { text } = buildAiBrief({
      ...base,
      entries: Object.fromEntries(ITEM_KINDS.map((kind) => [kind, many])),
    });
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(
      BRIEF_LIMIT,
    );
    for (const kind of ITEM_KINDS) expect(text).toContain(`\n${kind}:\n`);
    expect(text).toMatch(/\.\.\. \d+ more/);
  });
});
