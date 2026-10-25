// Rebuild from npm pack extracts rooted at the first argument (see THIRD-PARTY.md).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = process.argv[2];
if (!root)
  throw Error(
    'Pass directory containing three/package, pixi.js/package, lottie-web/package',
  );
const out = 'src/freecode/vendor';
mkdirSync(out, { recursive: true });
const entries = [
  [
    'three',
    '0.170.0',
    '2024-10-31T07:08:27.705Z',
    'three/package/build/three.module.js',
    'THREE',
    'LICENSE',
  ],
  [
    'pixi',
    '7.4.3',
    '2025-03-06T15:00:18.351Z',
    'pixi.js/package/dist/pixi.min.js',
    'PIXI',
    'LICENSE',
  ],
  [
    'lottie',
    '5.12.2',
    '2023-06-13T12:10:02.060Z',
    'lottie-web/package/build/player/lottie_canvas.min.js',
    'lottie',
    'LICENSE.md',
  ],
];
const manifest = [];
for (const [name, version, released, file, global, license] of entries) {
  let code;
  if (name === 'three') {
    // THREE plus GLTFLoader (examples/jsm), so Tier C code can load a .glb
    // from bytes embedded in its own source (no network in the sandbox).
    const core = path.resolve(root, file);
    const built = await build({
      stdin: {
        contents: `export * from ${JSON.stringify(core)};export { GLTFLoader } from ${JSON.stringify(path.resolve(root, 'three/package/examples/jsm/loaders/GLTFLoader.js'))};`,
        resolveDir: root,
      },
      alias: { three: core },
      bundle: true,
      minify: true,
      format: 'iife',
      globalName: global,
      write: false,
      legalComments: 'inline',
    });
    code = built.outputFiles[0].text + `;window.${global}=${global};`;
  } else {
    code =
      readFileSync(path.join(root, file), 'utf8') +
      (name === 'pixi' ? ';window.PIXI=PIXI;' : '');
  }
  const buffer = Buffer.from(code);
  const compressed = gzipSync(buffer, { level: 9 });
  writeFileSync(`${out}/${name}.txt`, compressed.toString('base64') + '\n');
  const pkg =
    name === 'pixi' ? 'pixi.js' : name === 'lottie' ? 'lottie-web' : name;
  writeFileSync(
    `${out}/${name}-LICENSE.txt`,
    readFileSync(path.join(root, pkg, 'package', license)),
  );
  manifest.push({
    name,
    package: pkg,
    version,
    released,
    bytes: buffer.length,
    gzipBytes: compressed.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  });
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
const helper = await build({
  entryPoints: ['src/freecode/helpers.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'FreeCodeHelpers',
  write: false,
});
writeFileSync(
  `${out}/helpers.txt`,
  helper.outputFiles[0].text + '\nreturn FreeCodeHelpers.helpers;\n',
);
