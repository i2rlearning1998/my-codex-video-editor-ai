import { build } from 'vite';
import { resolve } from 'node:path';
/** In-memory ES bundle, using the project's existing build tooling. */
export async function bundleFx() {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('src/fx/index.ts'),
        formats: ['es'],
        fileName: 'fx',
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const output = Array.isArray(bundle) ? bundle[0].output : bundle.output;
  return (
    'data:text/javascript;base64,' +
    Buffer.from(output.find((x) => x.type === 'chunk').code).toString('base64')
  );
}
