// ROUND-B: AI mode screenshots: the empty start with the Brief card, the
// Plan card, and a built video with a proposal and the drawer, at 1920, 1440,
// 1280 and 1024 px, dark and light. Needs a dev server:
// `npx vite --port 4199 --strictPort`. Usage: node scripts/round-b-ai-shots.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'reports/round-b/ai-mode';
const base = process.env.SHOT_BASE ?? 'http://localhost:4199';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
await page.goto(`${base}/site/#/signup`);
await page.locator('#auth-email').fill(`ai-shots-${Date.now()}@example.com`);
await page.locator('#auth-password').fill('correct horse battery');
await page.locator('#auth-submit').click();
await page.waitForURL(/\/panel\//);
await page.locator('#credits-pill').waitFor();
await page.goto(`${base}/panel/#/home`);
await page
  .locator('#home-input')
  .fill('Explain how rain forms, in Hindi, 1 minute');
await page.locator('#home-send').click();
await page.locator('#ai-brief-card').waitFor({ timeout: 60_000 });
const widths = [1920, 1440, 1280, 1024];
const themes = ['dark', 'light'];
const snap = async (state) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 1440 ? 1000 : 820 });
    for (const theme of themes) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        document.documentElement.dataset.motion = 'off';
      }, theme);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${out}/${state}-${theme}-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
};
await snap('brief');
await page.locator('#ai-brief-card .ai-btn.primary').click();
await page.locator('#ai-plan-card').waitFor({ timeout: 60_000 });
await snap('plan');
await page.locator('#ai-plan-approve').click();
await page.locator('#ai-assets-card').waitFor();
await page.locator('#ai-build').click();
await page
  .locator('[data-card="build"][data-state="done"]')
  .waitFor({ timeout: 180_000 });
// Two seconds into the first scene (it fades in from black at 0:00).
await page.locator('#ai-play').click();
await page.waitForTimeout(2200);
await page.locator('#ai-play').click();
await snap('built');
// A selected layer with its bubble and a previewed proposal.
const clip = page.locator('#ai-track .ai-clip').first();
await clip.click();
await page.locator('#ai-input').fill('make it red');
await page.locator('#ai-send').click();
await page
  .locator('[data-card="proposal"][data-state="open"]')
  .waitFor({ timeout: 30_000 })
  .catch(() => undefined);
await snap('proposal');
await browser.close();
console.log('done');
