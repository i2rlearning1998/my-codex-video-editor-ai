// Phase 1 library manager (P1-11): the owner app is its own product. No
// editor file imports it, the editor's dev server never serves it, and the
// built editor (when dist/ exists) has none of its routes.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OWNER_PATHS, ownerGuard } from '../../vite.library';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });

describe('Phase 1 owner app isolation', () => {
  it('[LIB-011] no file under src/ imports from owner/, and the editor dev server refuses owner paths', () => {
    const offenders = files('src')
      .filter((file) => /\.(ts|tsx|js|mjs|css|html)$/.test(file))
      .filter((file) =>
        /(from\s+|import\s*\(\s*|import\s+)['"][^'"]*\/owner(\/|['"])|url\(['"]?[^)]*\/owner\//.test(
          readFileSync(file, 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
    const plugin = ownerGuard() as unknown as {
      configureServer: (server: {
        middlewares: { use: (fn: unknown) => void };
      }) => void;
    };
    let middleware: (
      req: { url: string },
      res: { statusCode: number; end: (t: string) => void },
      next: () => void,
    ) => void = () => undefined;
    plugin.configureServer({
      middlewares: { use: (fn) => (middleware = fn as typeof middleware) },
    });
    const ask = (url: string) => {
      const res = { statusCode: 200, end: () => undefined };
      let passed = false;
      middleware({ url }, res, () => (passed = true));
      return passed ? 200 : res.statusCode;
    };
    for (const url of [
      '/owner/ui/app.ts',
      '/owner/server/app.ts',
      '/owner-data/items.json',
      '/catalog-out/manifest.json',
      '/%6Fwner/keys/catalog-private.pem',
      `/@fs${path.resolve('owner/keys/catalog-private.pem')}`,
    ])
      expect(ask(url)).toBe(404);
    expect(ask('/src/main.ts')).toBe(200);
    expect(OWNER_PATHS.test('/ownership')).toBe(false);
  });

  it('[LIB-011] the built editor bundle has no owner routes, cookie or screens', () => {
    if (!existsSync('dist')) return; // Proven by the build step itself (npm run build).
    const markers = [
      '/api/rotate-key',
      'aive_owner',
      '/api/reauth',
      'Library manager',
      'owner/gate/harness',
    ];
    for (const file of files('dist').filter((f) => /\.(js|html)$/.test(f))) {
      const text = readFileSync(file, 'utf8');
      for (const marker of markers)
        expect(`${file}: ${text.includes(marker)}`).toBe(`${file}: false`);
    }
  });
});
