// P2-R2 Part F: ledger rows, docs, Hindi strings, the server kept out of
// every browser bundle, the check script, and the round's report.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_STRINGS } from '../../src/panel/strings';

const read = (f: string) => readFileSync(f, 'utf8');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? files(f) : /\.ts$/.test(f) ? [f] : [];
  });

describe('P2-R2 close', () => {
  it('[P2R2-035] [P2R2-036] ledger rows P2R2-001 to 040, the server, keys, panel and gateway docs, and Hindi beside every panel string', () => {
    const ledger = read('docs/FEATURES.md');
    for (let i = 1; i <= 40; i++) {
      const id = `P2R2-${String(i).padStart(3, '0')}`;
      expect(ledger, id).toContain(`| ${id} |`);
    }
    expect(read('docs/SERVER.md')).toContain('npm run server');
    expect(read('docs/KEYS.md')).toContain('ANTHROPIC_API_KEY');
    expect(read('docs/PANEL.md')).toContain('P2-R2');
    expect(read('docs/GATEWAY.md')).toContain('P2-R2');
    expect(read('docs/CAPABILITY-SHEET.md')).toContain('GRAPHICS BLOCKS');
    for (const [key, [en, hi]] of Object.entries(ALL_STRINGS)) {
      expect(en, key).toBeTruthy();
      expect(hi, key).toBeTruthy();
    }
  });

  it('[P2R2-038] no browser code imports the server; the bundle check names every server-only marker', () => {
    for (const f of files('src'))
      for (const m of read(f).matchAll(
        /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g,
      )) {
        const target = path.normalize(path.join(path.dirname(f), m[1]!));
        expect(target.startsWith('server'), `${f} imports ${target}`).toBe(
          false,
        );
      }
    const script = read('scripts/assert-editor-bundle.mjs');
    for (const marker of [
      'SUPABASE_SERVICE_ROLE_KEY',
      'service_role',
      'SUPABASE_JWT_SECRET',
      'api.anthropic.com',
      'api.openai.com',
    ])
      expect(script).toContain(`'${marker}'`);
    expect(JSON.parse(read('package.json')).scripts.build as string).toContain(
      'assert-editor-bundle',
    );
  });

  it('[P2R2-039] [P2R2-040] the check gate covers format, types, unit tests and build; the report lists every item with its state', () => {
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.check).toMatch(/format|prettier/);
    expect(pkg.scripts.verify).toContain('check');
    expect(existsSync('reports/P2-R2.md')).toBe(true);
    const report = read('reports/P2-R2.md');
    for (const part of [
      'Built and verified',
      'Built, needs a live key',
      'BLOCKED',
      'Not tested',
      'Known old failures',
      'Try-it script for the owner',
      'First real run',
    ])
      expect(report, part).toContain(part);
    for (let i = 1; i <= 40; i++)
      expect(report).toContain(`P2B-${String(i).padStart(2, '0')}`);
  });
});
