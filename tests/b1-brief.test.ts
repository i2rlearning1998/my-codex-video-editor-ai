import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ITEM_KINDS } from '../src/creator-pack/schemas';
import {
  CREATOR_BRIEF_LIMIT,
  CREATOR_HEADER,
  buildAiBrief,
} from '../src/ai-brief/brief';
import {
  briefFilesText,
  briefSections,
  emptyBriefForm,
  normalizeBriefForm,
} from '../src/ai-brief/form';

const authoring = readFileSync('docs/CREATOR-PACK-AUTHORING.md', 'utf8');
const style = JSON.parse(
  readFileSync('examples/creator-packs/style-documentary.json', 'utf8'),
).items[0];
const base = {
  project: { width: 1920, height: 1080, fps: 30, duration: 12, theme: null },
  kinds: ITEM_KINDS,
  entries: { shape: [{ id: 'shape-star', label: 'Star' }] },
  blocks: [{ id: 'counter', label: 'Signal counter' }],
  animate: { in: ['fade'], loop: ['pulse'] },
  fonts: ['Inter'],
  authoring,
};
const filled = () =>
  normalizeBriefForm({
    ...emptyBriefForm(),
    styleId: 'docs/style-documentary',
    topic: 'How bees make honey',
    script: { on: true, text: 'Bees fly. Bees dance.', mode: 'exact' },
    references: { images: ['hive.jpg'], videos: [], logo: 'logo.png' },
  });

describe('[B1] New AI video brief', () => {
  it('puts filled fields under LOCKED and lists empty ones once under FREE', () => {
    const { locked, free } = briefSections(filled(), {
      id: 'docs/style-documentary',
      name: 'Documentary',
    });
    expect(locked.join('\n')).toContain('Topic / title: How bees make honey');
    expect(locked.join('\n')).toContain(
      'Script (use exactly, word for word):\nBees fly. Bees dance.',
    );
    expect(locked[0]).toBe('Style: Documentary (docs/style-documentary)');
    for (const label of ['Topic / title', 'Script', 'Style', 'Logo'])
      expect(free).not.toContain(label);
    for (const label of ['Language', 'Length', 'Aspect ratio', 'FPS'])
      expect(free.filter((entry) => entry === label)).toHaveLength(1);
  });
  it('an empty form keeps the T2 brief exactly', () => {
    const before = buildAiBrief({ ...base, request: 'x' }).text;
    const after = buildAiBrief({
      ...base,
      request: 'x',
      form: emptyBriefForm(),
      style: null,
      stock: [],
    }).text;
    expect(after).toBe(before);
    expect(after).not.toContain('=== BRIEF ===');
  });
  it('a filled form gives the creator block in order', () => {
    const { text } = buildAiBrief({
      ...base,
      request: '',
      form: filled(),
      style: {
        id: 'docs/style-documentary',
        name: 'Documentary',
        data: style.data,
      },
      stock: [],
    });
    expect(text.startsWith(CREATOR_HEADER)).toBe(true);
    const order = [
      '=== BRIEF ===',
      '=== STYLE ===',
      'PROJECT',
      'LIBRARY',
      'RULES',
    ];
    const at = order.map((mark) => text.indexOf(mark));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(text).toContain('none installed');
  });
  it('stays under 60 KB with a huge library, ids first, and says so', () => {
    const many = Array.from({ length: 20000 }, (_, index) => ({
      id: `item-${index}`,
      label: `A long library item label number ${index}`,
    }));
    const input = {
      ...base,
      entries: Object.fromEntries(ITEM_KINDS.map((kind) => [kind, many])),
      request: '',
      form: filled(),
      style: null,
      stock: [],
    };
    const { text } = buildAiBrief(input);
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(
      CREATOR_BRIEF_LIMIT,
    );
    expect(text).toContain('ids only, labels dropped');
    expect(text).not.toContain('A long library item label');
    expect(buildAiBrief(input).text).toBe(text);
  });
  it('is deterministic', () => {
    const input = {
      ...base,
      request: '',
      form: filled(),
      style: {
        id: 'docs/style-documentary',
        name: 'Documentary',
        data: style.data,
      },
      stock: [],
    };
    expect(buildAiBrief(input).text).toMatchSnapshot();
  });
  it('names the files to attach', () => {
    expect(briefFilesText(filled())).toBe(
      'Attach these files in the Claude chat: hive.jpg (reference image), logo.png (logo).',
    );
    expect(briefFilesText(emptyBriefForm())).toBe('');
  });
});
