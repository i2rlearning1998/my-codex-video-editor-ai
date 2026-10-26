// J: `npm run composition:build -- <pack.txt|pack.json> [--json] [--out=dir]`
// builds every composition of a Creator Pack headless and prints what is
// missing (empty slots, voice-over, captions, features) and every warning.
// --json prints the machine result; --out writes each built project JSON.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
if (!file) {
  console.error(
    'Usage: npm run composition:build -- <pack file> [--json] [--out=dir]',
  );
  process.exitCode = 2;
} else {
  let server;
  try {
    const json = args.includes('--json');
    const out = args.find((arg) => arg.startsWith('--out='))?.slice(6);
    const root = fileURLToPath(new URL('../', import.meta.url));
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, watch: null, hmr: false },
    });
    const { buildCompositionsFromPack, buildReport } =
      await server.ssrLoadModule('/src/composition/index.ts');
    const { libraryItemSchema } = await server.ssrLoadModule(
      '/src/library/schema.ts',
    );
    // The built-in library, as the editor loads it.
    const manifest = JSON.parse(
      await readFile(
        new URL('../library/seed/starter-pack-1.json', import.meta.url),
      ),
    );
    const library = new Map();
    for (const raw of manifest.items) {
      const parsed = libraryItemSchema.safeParse(raw);
      if (parsed.success) library.set(parsed.data.id, parsed.data);
    }
    const builds = await buildCompositionsFromPack(
      await readFile(file, 'utf8'),
      { library: (id) => library.get(id) },
    );
    if (!builds.length) console.log('No composition in this pack.');
    if (json)
      console.log(
        JSON.stringify(
          builds.map(({ itemId, name, result }) => ({
            itemId,
            name,
            errors: result.errors,
            missing: result.missing,
            warnings: result.warnings,
          })),
          null,
          2,
        ),
      );
    else for (const build of builds) console.log(buildReport(build));
    if (out) {
      await mkdir(out, { recursive: true });
      for (const { itemId, result } of builds)
        if (result.project)
          await writeFile(
            `${out}/${itemId}.project.json`,
            JSON.stringify(result.project, null, 2),
          );
    }
    process.exitCode = builds.some((b) => b.result.errors.length) ? 1 : 0;
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
