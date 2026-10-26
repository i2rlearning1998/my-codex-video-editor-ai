// Phase 1 library: Vite plugins of the editor build.
// - ownerGuard (P1-11): the editor's dev server never serves the owner app,
//   the owner's data, keys or the catalog folder (they sit in the same
//   repository, which Vite would otherwise serve as plain files).
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { ensureKeys, readPublicKey } from './owner/catalog/keys';
import { catalogResponse } from './owner/catalog/serve';

export const OWNER_PATHS =
  /^\/(owner|owner-data|catalog-out|\.e2e-library)(\/|$)/;

export function ownerGuard(): Plugin {
  return {
    name: 'owner-guard',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '/').split('?')[0]!;
        let decoded = path;
        try {
          decoded = decodeURIComponent(path);
        } catch {
          /* keep the raw path */
        }
        // Vite also serves files by absolute path (/@fs/...).
        if (
          OWNER_PATHS.test(decoded) ||
          /\/(owner|owner-data|catalog-out)\//.test(
            decoded.replace(/^\/@fs/, ''),
          )
        ) {
          response.statusCode = 404;
          response.end('Not found');
          return;
        }
        next();
      });
    },
  };
}

// - catalogDev (P1-20): in `npm run dev` (and the e2e run) the editor reads
//   a local catalog at /__catalog/, from LIBRARY_CATALOG_DIR (catalog-out/),
//   seeded on first use and signed with the key in LIBRARY_KEYS_DIR
//   (owner/keys/, made once if missing). The build takes only the public
//   key (VITE_LIBRARY_PUBLIC_KEY or owner/keys/catalog-public.txt).
export const libraryDirs = () => ({
  catalogDir: path.resolve(process.env.LIBRARY_CATALOG_DIR ?? 'catalog-out'),
  dataDir: path.resolve(process.env.LIBRARY_DATA_DIR ?? 'owner-data'),
  keysDir: path.resolve(process.env.LIBRARY_KEYS_DIR ?? 'owner/keys'),
});

export function libraryPublicKey(command: 'serve' | 'build'): string {
  if (process.env.VITE_LIBRARY_PUBLIC_KEY)
    return process.env.VITE_LIBRARY_PUBLIC_KEY;
  const { keysDir } = libraryDirs();
  if (command === 'serve') return ensureKeys(keysDir).publicKey;
  return readPublicKey(keysDir) ?? '';
}

export function catalogDev(): Plugin {
  let seeding: Promise<unknown> | null = null;
  return {
    name: 'catalog-dev',
    apply: 'serve',
    configureServer(server) {
      const { catalogDir, dataDir, keysDir } = libraryDirs();
      server.middlewares.use('/__catalog', (request, response, next) => {
        const answer = async () => {
          if (!existsSync(path.join(catalogDir, 'manifest.json'))) {
            seeding ??= (async () => {
              const seed = (await server.ssrLoadModule(
                '/owner/catalog/seed.ts',
              )) as typeof import('./owner/catalog/seed');
              const sources = (await server.ssrLoadModule(
                '/owner/catalog/sources.ts',
              )) as typeof import('./owner/catalog/sources');
              seed.seedCatalog(sources.defaultSeedSources(), {
                dataDir,
                outDir: catalogDir,
                keys: ensureKeys(keysDir),
              });
            })();
            await seeding;
          }
          const result = catalogResponse(
            catalogDir,
            request.method ?? 'GET',
            request.url ?? '/',
            {
              'if-none-match': request.headers['if-none-match'],
              range: request.headers.range,
            },
          );
          response.writeHead(result.status, result.headers);
          response.end(result.body ?? undefined);
        };
        answer().catch(next);
      });
    },
  };
}
