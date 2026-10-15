import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const args = process.argv.slice(2);
if (!args[0]) {
  console.error(
    'Usage: npm run pack:check -- <file> [--fx=id,id] [--known=pack/item,pack/item]',
  );
  process.exitCode = 2;
} else {
  let server;
  try {
    const options = { fxCatalog: [], knownLibraryIds: [] };
    for (const argument of args.slice(1)) {
      if (argument.startsWith('--fx='))
        options.fxCatalog = argument.slice(5).split(',').filter(Boolean);
      else if (argument.startsWith('--known='))
        options.knownLibraryIds = argument.slice(8).split(',').filter(Boolean);
      else throw Error('Unknown argument: ' + argument);
    }
    const root = fileURLToPath(new URL('../', import.meta.url));
    // Vite is already installed; middleware mode loads TS without opening a port.
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, watch: null, hmr: false },
    });
    const { checkPack } = await server.ssrLoadModule(
      '/src/creator-pack/index.ts',
    );
    const result = checkPack(await readFile(args[0], 'utf8'), options);
    console.log(result.report);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(
      'Pack rejected: ' +
        (error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 2;
  } finally {
    await server?.close();
  }
}
