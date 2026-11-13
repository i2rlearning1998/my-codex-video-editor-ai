// ROUND-A A0.2: the editor's baseline pack (public/library-baseline). With no
// catalog it supplies sounds, text styles and font combinations, and themes;
// a reachable catalog adds to it or overrides it entry by entry.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LibraryClient } from '../../src/library-client/client';
import { MemoryCache } from '../../src/library-client/cache';
import { MemoryMediaStore } from '../../src/media/store';

const DIR = path.resolve('public/library-baseline');
const BASE = 'https://editor.test/library-baseline/';
const index = JSON.parse(
  readFileSync(path.join(DIR, 'index.json'), 'utf8'),
) as {
  categories: Record<string, { entries: { id: string; kind: string }[] }>;
};

/** Serves the baseline folder; anything else fails like an absent catalog. */
const fetcher = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (!url.startsWith(BASE)) throw new TypeError('Failed to fetch');
  const file = path.join(DIR, url.slice(BASE.length));
  if (!existsSync(file)) return new Response(null, { status: 404 });
  return new Response(readFileSync(file));
}) as typeof fetch;

const client = () =>
  new LibraryClient({
    url: null,
    baselineUrl: BASE,
    publicKey: '',
    cache: Promise.resolve(new MemoryCache()),
    media: Promise.resolve(new MemoryMediaStore()),
    fetch: fetcher,
  });

describe('baseline pack', () => {
  it('[RDA-001] holds 12 sounds, text styles with font combinations and 8 themes, and nothing else', () => {
    expect(Object.keys(index.categories).sort()).toEqual([
      'audio',
      'styles',
      'text',
    ]);
    expect(index.categories.audio!.entries).toHaveLength(12);
    expect(index.categories.styles!.entries).toHaveLength(8);
    expect(
      index.categories.text!.entries.filter((e) => e.id.startsWith('combo-'))
        .length,
    ).toBeGreaterThanOrEqual(20);
    for (const c of Object.values(index.categories))
      for (const e of c.entries)
        expect(['sound', 'text', 'theme']).toContain(e.kind);
  });

  it('[RDA-001] with no catalog the client lists the baseline, reports no problem, and serves a sound file from the editor origin', async () => {
    const c = client();
    await c.ready;
    expect(c.status).toMatchObject({ source: 'fallback', problem: null });
    expect(c.entries('audio')).toHaveLength(12);
    expect(
      c.payloads('styles').filter((p) => p.entry.kind === 'theme'),
    ).toHaveLength(8);
    const texts = c.manifest().items.filter((i) => i.id.startsWith('combo-'));
    expect(texts.length).toBeGreaterThanOrEqual(20);
    const sound = c.entries('audio')[0]!;
    const blob = await c.file(sound.media!.full);
    expect(blob?.size).toBe(sound.media!.full.size);
  });
});
