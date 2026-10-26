// Phase 1 library (P1-07): the gate's headless browser. A private Vite
// server (no config file, its own random port on 127.0.0.1) serves the
// harness page with the editor's code; Playwright's Chromium opens it.
// Any failure to start throws, and the gate then fails closed.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { GateBrowser } from './gate';
import type { MediaProbe } from '../gate/harness';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

export async function openGateBrowser(): Promise<GateBrowser> {
  const { createServer } = await import('vite');
  const { chromium } = await import('playwright');
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      hmr: false,
      watch: null,
    },
    optimizeDeps: { include: ['mediabunny'] },
    worker: { format: 'es' },
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('No port');
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    const page = await browser.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${address.port}/owner/gate/harness.html`);
    await page
      .waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 60_000,
      })
      .catch(() => {
        throw new Error(
          `The gate page did not start: ${problems.join(' | ') || 'no answer'}`,
        );
      });
    const opened = browser;
    return {
      checkItems: (items) =>
        page.evaluate(
          (list) =>
            (
              window as unknown as {
                __gate: { checkItems: (i: unknown) => Promise<never> };
              }
            ).__gate.checkItems(list),
          items as unknown[],
        ),
      probeMedia: (bytes, mime) =>
        page.evaluate(
          ([b64, type]) =>
            (
              window as unknown as {
                __gate: {
                  probeMedia: (b: string, m: string) => Promise<MediaProbe>;
                };
              }
            ).__gate.probeMedia(b64, type),
          [toB64(bytes), mime] as const,
        ),
      close: async () => {
        await opened.close();
        await server.close();
      },
    };
  } catch (error) {
    await browser?.close();
    await server.close();
    throw error;
  }
}
