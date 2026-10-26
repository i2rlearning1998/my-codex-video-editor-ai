// Phase 1 library brief, P1-01 to P1-03 and P1-34: the audit and the docs.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

describe('Phase 1 library audit and docs', () => {
  it('[LIB-001][LIB-002][LIB-003] the audit names every bundled source, the cloud leftovers and what is reused, and what it moved is gone from the editor', () => {
    const audit = read('reports/PHASE1-LIB-AUDIT.md');
    for (const heading of ['## P1-01', '## P1-02', '## P1-03'])
      expect(audit).toContain(heading);
    for (const source of [
      'public/library/index.json',
      'FONT_COMBINATIONS',
      'BUILT_IN_THEMES',
      'SOUND_PACK',
      'style-*.json',
    ])
      expect(audit).toContain(source);
    for (const leftover of ['Google login button', 'thumbnails', 'Free space'])
      expect(audit).toContain(leftover);
    // Moved: no longer bundled.
    expect(existsSync('public/library/index.json')).toBe(false);
    expect(existsSync('src/audio/sound-pack.ts')).toBe(false);
    expect(read('src/ui/text-styles.ts')).not.toMatch(
      /export const FONT_COMBINATIONS/,
    );
    // Reused, not invented: the catalog's payloads are the existing records.
    const format = read('src/library-client/format.ts');
    expect(format).toMatch(/LibraryItem|Creator Pack|Theme/);
  });

  it('[LIB-034] the ledger, decisions, status, changelog and docs describe the Phase 1 library', () => {
    const ledger = read('docs/FEATURES.md');
    for (let n = 1; n <= 34; n++)
      expect(ledger).toContain(`| LIB-${String(n).padStart(3, '0')} |`);
    const decisions = read('docs/DECISIONS.md');
    for (const id of ['D-329', 'D-336', 'D-339', 'D-340', 'D-343'])
      expect(decisions).toContain(`| ${id} |`);
    expect(read('docs/STATUS.md')).toContain('PHASE1-LIB');
    expect(read('CHANGELOG.md')).toContain('Phase 1 library');
    const library = read('docs/LIBRARY.md');
    expect(library).toContain('npm run library:publish');
    expect(library).toContain('catalog');
    expect(read('docs/PHASE1-PLAN.md')).toContain('training_records');
    expect(read('owner/README.md')).toContain('npm run owner');
  });
});
