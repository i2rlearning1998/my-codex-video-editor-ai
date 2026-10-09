import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 5175,
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
  },
  optimizeDeps: { include: ['typescript'] },
  build: { outDir: 'dist', emptyOutDir: true },
});
