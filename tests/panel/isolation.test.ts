// P2-R1 (P2-21): the editor never imports the panel, the website, the
// gateway, Director or payments; the panel and website never import the
// editor's entry or shell. When a build exists, the per-page bundle check runs.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? files(f) : /\.ts$/.test(f) ? [f] : [];
  });
const imports = (f: string) =>
  [
    ...readFileSync(f, 'utf8').matchAll(
      /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g,
    ),
  ].map((m) => path.normalize(path.join(path.dirname(f), m[1]!)));
const PANEL_SIDE = [
  'src/panel',
  'src/site',
  'src/gateway',
  'src/director',
  'src/payments',
  // P3-WIRING: the Director and Studio services the panel and server use.
  'src/wiring',
];

describe('P2-R1 page isolation', () => {
  it('[P2R1-021] the editor imports no panel, website, gateway, Director or payment code; the panel and website import no editor entry or shell', () => {
    for (const f of files('src')) {
      if (PANEL_SIDE.some((d) => f.startsWith(d))) continue;
      for (const target of imports(f))
        for (const d of [
          'src/panel',
          'src/site',
          'src/gateway',
          'src/director',
          'src/payments',
        ])
          expect(target.startsWith(d), `${f} imports ${target}`).toBe(false);
    }
    for (const f of [
      ...files('src/panel'),
      ...files('src/site'),
      ...files('src/gateway'),
      ...files('src/director'),
    ])
      for (const target of imports(f))
        for (const banned of [
          'src/main',
          'src/boot',
          'src/ui/shell',
          'src/ui/',
        ])
          if (!target.endsWith('tokens.css'))
            expect(target.startsWith(banned), `${f} imports ${target}`).toBe(
              false,
            );
    expect(readFileSync('index.html', 'utf8')).toContain('/src/boot.ts');
    if (existsSync('dist/.vite/manifest.json'))
      expect(
        execFileSync('node', ['scripts/assert-editor-bundle.mjs'], {
          encoding: 'utf8',
        }),
      ).toMatch(/panel and website without the editor/);
  });
});
