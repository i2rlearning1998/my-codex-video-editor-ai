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
    baseURL: 'http://127.0.0.1:4173',
    ...browser,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  updateSnapshots: 'missing',
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
