// P2-R1: the integration, docs, Hindi strings and report are in place.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_STRINGS } from '../../src/panel/strings';

const read = (f: string) => readFileSync(f, 'utf8');
describe('P2-R1 integration and docs', () => {
  it('[P2R1-001] the Phase 1 cloud code is on the branch with its scripts and dependency', () => {
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@supabase/supabase-js']).toBe('2.117.3');
    for (const s of ['cloud:start', 'cloud:stop', 'cloud:test'])
      expect(pkg.scripts[s]).toBeTruthy();
    for (const f of [
      'src/cloud/backend.ts',
      'src/cloud/supabase.ts',
      'src/cloud/local.ts',
      'src/ui/cloud-ui.ts',
      'supabase/config.toml',
      'owner/server/main.ts',
      'src/library-client/index.ts',
    ])
      expect(existsSync(f), f).toBe(true);
  });
  it('[P2R1-002] [P2R1-039] [P2R1-040] docs, ledger, decisions and the report describe the round; every panel string has Hindi', () => {
    const report = read('reports/P2-R1.md');
    for (const part of [
      'How the Phase 1 cloud was integrated',
      'BLOCKED',
      'Not tested',
      'Try-it script for the owner',
      'Real keys later',
    ])
      expect(report, part).toContain(part);
    for (let i = 1; i <= 40; i++) {
      const id = `P2R1-${String(i).padStart(3, '0')}`;
      expect(read('docs/FEATURES.md'), id).toContain(`| ${id} |`);
      expect(report, id).toContain(id);
    }
    expect(read('docs/PANEL.md')).toContain('There is no guest mode');
    expect(read('docs/GATEWAY.md')).toContain('Credits rule');
    expect(read('docs/DECISIONS.md')).toContain('P2-R1 Part D');
    expect(read('CHANGELOG.md')).toContain('P2-R1');
    expect(read('docs/STATUS.md')).toContain('P2-R1');
    for (const [key, [en, hi]] of Object.entries(ALL_STRINGS)) {
      expect(en, key).toBeTruthy();
      expect(hi, key).toBeTruthy();
    }
  });
});
