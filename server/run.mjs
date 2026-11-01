#!/usr/bin/env node
// Runs a server TypeScript entry (server/main.ts)
// through Vite's module loader (already installed), as owner/run.mjs
// does, so the server reuses src/gateway and the Platform Config without a
// build step or a new dependency.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const [entry, ...args] = process.argv.slice(2);
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  server: { middlewareMode: true, watch: null, hmr: false },
  // No dependency scan: the server loads Node modules only.
  optimizeDeps: { noDiscovery: true, include: [] },
});
let code = 1;
try {
  const module = await server.ssrLoadModule(entry);
  code = (await module.main(args)) ?? 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  // A long-running entry (the server) resolves only when it stops.
  await server.close();
}
process.exit(code);
