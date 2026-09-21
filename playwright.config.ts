import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const chromeInstalled = [
  process.env.PROGRAMFILES,
  process.env['PROGRAMFILES(X86)'],
  process.env.LOCALAPPDATA,
].some(
  (root) =>
    root && existsSync(path.join(root, 'Google/Chrome/Application/chrome.exe')),
);

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
    ...(process.env.CI
      ? {}
      : { channel: chromeInstalled ? 'chrome' : 'msedge' }),
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
