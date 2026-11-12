// ROUND-A A0.2: the editor's baseline library pack. A production build with
// no catalog set up must still show the sound effects, the Text panel's
// styles and font combinations, and the themes. This script makes that pack
// from the same seed the owner's first catalog is made from (owner/catalog
// seed, read only), and writes it to public/library-baseline/: one index
// (the catalog's own entry format, for the audio, text and styles
// categories) and the content-hashed files the entries name. The editor
// loads it from its own origin; a reachable catalog adds to it or overrides
// it entry by entry (src/library-client/client.ts).
//
// Run: node owner/run.mjs /scripts/library-baseline.ts
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { seedCatalog } from '../owner/catalog/seed';
import { defaultSeedSources } from '../owner/catalog/sources';
import { ensureKeys } from '../owner/catalog/keys';
import { readManifest } from '../owner/catalog/build';
import {
  categoryIndexSchema,
  type CatalogCategory,
  type CatalogEntry,
  type CategoryIndex,
} from '../src/library-client/format';

/** What the baseline holds: sounds, text styles and combinations, themes. */
export const BASELINE: Partial<Record<CatalogCategory, readonly string[]>> = {
  audio: ['sound'],
  text: ['text'],
  styles: ['theme'],
};

export function main(args: string[]): number {
  const out = path.resolve(args[0] ?? 'public/library-baseline');
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'aive-baseline-'));
  try {
    seedCatalog(defaultSeedSources(), {
      dataDir: path.join(tmp, 'data'),
      outDir: path.join(tmp, 'catalog'),
      keys: ensureKeys(path.join(tmp, 'keys')),
    });
    const catalog = path.join(tmp, 'catalog');
    const { manifest } = readManifest(catalog);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(path.join(out, 'files'), { recursive: true });
    const categories: Partial<Record<CatalogCategory, CategoryIndex>> = {};
    const files = new Set<string>();
    for (const [category, kinds] of Object.entries(BASELINE) as [
      CatalogCategory,
      readonly string[],
    ][]) {
      const ref = manifest.categories[category];
      const index = categoryIndexSchema.parse(
        JSON.parse(readFileSync(path.join(catalog, ref.url), 'utf8')),
      );
      const entries = index.entries.filter((e) => kinds.includes(e.kind));
      for (const e of entries) for (const f of filesOf(e)) files.add(f);
      categories[category] = {
        format: 'aive-catalog-index',
        category,
        catalogVersion: 1,
        entries,
      };
    }
    for (const f of files)
      copyFileSync(path.join(catalog, f), path.join(out, f));
    writeFileSync(
      path.join(out, 'index.json'),
      `${JSON.stringify({ format: 'aive-library-baseline', version: 1, categories })}\n`,
    );
    const counts = Object.entries(categories)
      .map(([c, i]) => `${c} ${i!.entries.length}`)
      .join(', ');
    console.log(`Baseline pack: ${counts}; ${files.size} files in ${out}`);
    return 0;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Every file an entry names (thumbnail, payload, media). */
function filesOf(e: CatalogEntry): string[] {
  const list: string[] = [];
  if (e.thumbUrl) list.push(e.thumbUrl);
  if ('file' in e.payload) list.push(e.payload.file.url);
  if (e.media) {
    list.push(e.media.full.url);
    if (e.media.poster) list.push(e.media.poster.url);
    if (e.media.proxy) list.push(e.media.proxy.url);
  }
  return list;
}
