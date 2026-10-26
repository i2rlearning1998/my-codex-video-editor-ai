// Phase 1 library (P1-09): the first published catalog, made from the
// content the editor used to bundle (reports/PHASE1-LIB-AUDIT.md, "Moves").
// Deterministic: the same sources and the same `now` give the same files
// and the same signature (Ed25519 signatures are deterministic).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseLibrary, type LibraryItem } from '../../src/library/schema';
import {
  libraryItemCandidate,
  soundCandidate,
  styleCandidate,
  themeCandidate,
  type ThemeRecord,
} from './candidates';
import { buildCatalog, type BuildResult } from './build';
import type { CatalogKeys } from './keys';
import { ItemStore, upsertCandidate } from './store';

export const SEED_TIME = '2026-10-26T00:00:00.000Z';

export interface SeedSound {
  readonly id: string;
  readonly name: { en: string; hi: string };
  readonly tags: string[];
  readonly samples: Float32Array;
  readonly rate: number;
}
export interface SeedSources {
  /** The Starter Pack manifest (the old public/library/index.json). */
  readonly starterPack: unknown;
  /** Extra library records (the 24 font combinations). */
  readonly extraItems: readonly LibraryItem[];
  readonly themes: readonly ThemeRecord[];
  readonly sounds: readonly SeedSound[];
  readonly encodeWav: (samples: Float32Array, rate: number) => Uint8Array;
  /** Creator Packs whose `style` items are published. */
  readonly stylePacks: readonly { name: string; pack: unknown }[];
}

/** Reads the style example packs from a folder (style-*.json). */
export function readStylePacks(dir: string) {
  return readdirSync(dir)
    .filter((name) => /^style-.*\.json$/.test(name))
    .sort()
    .map((name) => ({
      name,
      pack: JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as unknown,
    }));
}

export function seedCatalog(
  sources: SeedSources,
  options: { dataDir: string; outDir: string; keys: CatalogKeys; now?: string },
): BuildResult & { added: number; updated: number; unchanged: number } {
  const now = options.now ?? SEED_TIME;
  const store = new ItemStore(options.dataDir);
  const manifest = parseLibrary(sources.starterPack);
  store.data.taxonomy = [...(manifest.templates ?? [])];
  const counts = { added: 0, updated: 0, unchanged: 0 };
  const add = (candidate: Parameters<typeof upsertCandidate>[1]) => {
    counts[upsertCandidate(store, candidate, now)] += 1;
  };
  for (const item of [...manifest.items, ...sources.extraItems])
    add(libraryItemCandidate(store, item, 'seed'));
  for (const theme of sources.themes) add(themeCandidate(store, theme, 'seed'));
  for (const sound of sources.sounds)
    add(soundCandidate(store, { ...sound, encode: sources.encodeWav }, 'seed'));
  for (const { name, pack } of sources.stylePacks) {
    const items = (pack as { items?: unknown[] }).items ?? [];
    for (const item of items as Parameters<typeof styleCandidate>[1][])
      if ((item as { type?: string }).type === 'style')
        add(styleCandidate(store, item, name));
  }
  store.save();
  return {
    ...buildCatalog(store, options.outDir, options.keys, { now }),
    ...counts,
  };
}
