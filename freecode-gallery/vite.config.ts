import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  server: {
    host: '127.0.0.1',
    port: 5176,
    strictPort: true,
    open: '/freecode-gallery/',
  },
  build: {
    outDir: 'dist/freecode',
    rollupOptions: { input: 'freecode-gallery/index.html' },
  },
});
