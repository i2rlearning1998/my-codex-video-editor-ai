// Phase 1 library (P1-28): the editor bundles no shared library any more,
// only the tiny fallback pack; the content lives in library/seed/ and the
// owner publishes it. `npm run build` also checks the built files.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FALLBACK_ITEMS } from '../../src/library-client/fallback';
import { BUILT_IN_THEMES } from '../../src/themes/themes';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });

describe('Phase 1 library: nothing bundled', () => {
  it('[LIB-028] the editor source holds no library payloads; only the fallback pack and one theme remain, and the built editor is checked', () => {
    expect(existsSync('public/library')).toBe(false);
    expect(existsSync('src/audio/sound-pack.ts')).toBe(false);
    const source = files('src')
      .filter((file) => /\.(ts|json)$/.test(file))
      .map((file) => [file, readFileSync(file, 'utf8')] as const);
    for (const [file, text] of source) {
      expect(text, file).not.toContain('"shape-star-5"');
      expect(text, file).not.toContain('Cinematic Teal');
      expect(text, file).not.toMatch(/combo-news|SOUND_PACK\s*[:=]/);
    }
    expect(FALLBACK_ITEMS.length).toBeLessThanOrEqual(6);
    // The editor's own theme list starts with the fallback theme only (the
    // test setup registers the seed themes, as the catalog does at run time).
    expect(BUILT_IN_THEMES.some((theme) => theme.id === 'clean-light')).toBe(
      true,
    );
    // The seed still has everything the owner publishes.
    const seed = JSON.parse(
      readFileSync('library/seed/starter-pack-1.json', 'utf8'),
    ) as {
      items: unknown[];
    };
    expect(seed.items).toHaveLength(200);
    if (existsSync('dist/index.html')) {
      const run = spawnSync(
        process.execPath,
        ['scripts/assert-editor-bundle.mjs'],
        {
          encoding: 'utf8',
        },
      );
      expect(run.stderr).toBe('');
      expect(run.status).toBe(0);
    }
  });
});
