// Phase 1 library: Vite plugins of the editor build.
// - ownerGuard (P1-11): the editor's dev server never serves the owner app,
//   the owner's data, keys or the catalog folder (they sit in the same
//   repository, which Vite would otherwise serve as plain files).
import type { Plugin } from 'vite';

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
