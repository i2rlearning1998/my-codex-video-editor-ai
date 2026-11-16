// ROUND-C2 (Part 1, Part 4): the export card's engine, its own build
// (`npm run build` runs it). Output dist/mcp-card: card.js (the module the
// card's HTML shell loads from our server), its chunks and the bundled
// fonts. The editor's first load does not change: nothing here is imported
// by the editor.
import { defineConfig } from 'vite';
import { cpSync, existsSync, writeFileSync } from 'node:fs';

export default defineConfig({
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist/mcp-card',
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      // ROUND-C3 (0.2): the nested sandbox's frame script is a second entry.
      entry: {
        card: 'src/mcp-card/card.ts',
        'sandbox-frame': 'src/mcp-card/sandbox-frame.ts',
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: { output: { chunkFileNames: 'chunks/[name]-[hash].js' } },
  },
  worker: { format: 'es' },
  plugins: [
    {
      name: 'card-files',
      closeBundle() {
        if (existsSync('public/fonts'))
          cpSync('public/fonts', 'dist/mcp-card/fonts', { recursive: true });
        // A worker the spike tries to start from our origin.
        writeFileSync('dist/mcp-card/probe-worker.js', 'postMessage(1);\n');
      },
    },
  ],
});
