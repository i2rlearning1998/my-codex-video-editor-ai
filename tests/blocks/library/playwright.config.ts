import { defineConfig } from '@playwright/test';
import base from '../../../playwright.config';
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'library.browser.ts',
  retries: 0,
  reporter: 'list',
  timeout: 60000,
});
