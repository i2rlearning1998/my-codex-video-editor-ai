import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Prefer an installed Google Chrome, then Microsoft Edge (D-002). Only when neither
// exists (for example a Linux sandbox) fall back to a pre-installed Chromium build
// named by PLAYWRIGHT_CHROMIUM_PATH or PLAYWRIGHT_BROWSERS_PATH/chromium; CI keeps the
// Chromium it installs itself. Reports must name the browser actually used.
const windowsRoots = [
  process.env.PROGRAMFILES,
  process.env['PROGRAMFILES(X86)'],
  process.env.LOCALAPPDATA,
].filter((root): root is string => !!root);
const installed = (paths: string[]) => paths.some((file) => existsSync(file));
const chromeInstalled = installed([
  ...windowsRoots.map((root) =>
    path.join(root, 'Google/Chrome/Application/chrome.exe'),
  ),
  '/opt/google/chrome/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]);
const edgeInstalled = installed([
  ...windowsRoots.map((root) =>
    path.join(root, 'Microsoft/Edge/Application/msedge.exe'),
  ),
  '/opt/microsoft/msedge/msedge',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
]);
const chromiumFallback = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  process.env.PLAYWRIGHT_BROWSERS_PATH &&
    path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'),
].find((file): file is string => !!file && existsSync(file));
// PLAYWRIGHT_CHANNEL (for example "chrome") picks an installed branded browser; the
// W5-A export-mp4 CI job uses it because only branded Chrome encodes H.264 and AAC.
const browser = process.env.PLAYWRIGHT_CHANNEL
  ? { channel: process.env.PLAYWRIGHT_CHANNEL }
  : process.env.CI
    ? {}
    : chromeInstalled
      ? { channel: 'chrome' }
      : edgeInstalled || !chromiumFallback
        ? { channel: 'msedge' }
        : { launchOptions: { executablePath: chromiumFallback } };

// FINAL2: E2E_PORT lets parallel worktrees run their own dev server.
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'e2e-results/results.json' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...browser,
    // V7 (spec 11.4): Chromium's fake microphone, so the voiceover
    // recording flow runs without a device or a permission prompt.
    launchOptions: {
      ...('launchOptions' in browser ? browser.launchOptions : {}),
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
    // H2: wide enough for the desktop layout (docked left and right panels)
    // with the canvas at least as large as before the H2 shell.
    // I3 (D-150): 72 px taller for the scene strip, so the canvas keeps the
    // size the pixel-measuring tests were written for (D-120).
    // FIX1 F9: the owner's real Chrome window (1920 wide, about 940 tall
    // inside the browser's own bars). Earlier pixel-measuring specs that were
    // written for the 1600 × 1072 canvas opt back in with `LEGACY_VIEWPORT`.
    viewport: { width: 1920, height: 940 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // FIX1 F9: a small-laptop smoke run of the panel-scroll test only.
  projects: [
    { name: 'desktop', testIgnore: /phase0-play\.spec\.ts/ },
    {
      name: 'laptop-1366',
      testMatch:
        /(fix1|fix3|fix4)-(panels|whisper)\.spec\.ts|fix[45]\.spec\.ts/,
      use: { viewport: { width: 1366, height: 768 } },
    },
    // PHASE 0: the owner's real Chrome blocks sound until a click; this project
    // runs the first-Play test under that policy.
    {
      name: 'autoplay-policy',
      testMatch: /phase0-play\.spec\.ts/,
      use: {
        launchOptions: {
          ...('launchOptions' in browser ? browser.launchOptions : {}),
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--autoplay-policy=document-user-activation-required',
          ],
        },
      },
    },
  ],
  updateSnapshots: 'missing',
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
