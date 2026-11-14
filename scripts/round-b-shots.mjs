// ROUND-B: screenshots of every panel page and Studio tool (dark, light,
// 1440 and 390 px). Needs a dev server: `npx vite --port 4199 --strictPort`.
// Usage: node scripts/round-b-shots.mjs [outDir] [quick]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'reports/round-b/panel';
const quick = process.argv[3] === 'quick';
const only = process.argv[4]?.split(',');
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
await page.locator('#auth-email').fill(`shots-${Date.now()}@example.com`);
await page.locator('#auth-password').fill('correct horse battery');
await page.locator('#auth-submit').click();
await page.waitForURL(/\/panel\//);
await page.locator('#credits-pill').waitFor();
// One Project with one Video, so the pages have something to show.
await page.goto(`${base}/panel/#/credits`);
await page.locator('[data-switch="pro"]').click();
await page.locator('[data-plan="pro"][data-current="true"]').waitFor();
await page.goto(`${base}/panel/#/projects?new=1`);
await page.locator('#np-name').fill('Monsoon science');
await page.locator('[data-option="editor"]').click();
await page.locator('#composition-canvas').waitFor();
await page.goBack();
await page.getByRole('button', { name: 'Leave without saving' }).click();
await page.waitForURL(/#\/project\//);
const projectId = /#\/project\/([^/?]+)/.exec(page.url())[1];
const routes = [
  ['home', '#/home'],
  ['styles', '#/styles'],
  ['projects', '#/projects'],
  ['new-project', '#/projects?new=1'],
  ['project', `#/project/${projectId}`],
  ['project-style', `#/project/${projectId}/style`],
  ['project-assets', `#/project/${projectId}/assets`],
  ['project-memory', `#/project/${projectId}/memory`],
  ['assets', '#/assets'],
  ['studio', '#/studio'],
  ['studio-images', '#/studio/images'],
  ['studio-video', '#/studio/video'],
  ['studio-story', '#/studio/story'],
  ['studio-seo', '#/studio/seo'],
  ['studio-voice', '#/studio/voice'],
  ['studio-sfx', '#/studio/sfx'],
  ['studio-voice-change', '#/studio/voice-change'],
  ['studio-voice-clone', '#/studio/voice-clone'],
  ['studio-captions', '#/studio/captions'],
  ['credits', '#/credits'],
  ['brand', '#/brand'],
  ['learn', '#/learn'],
  ['settings', '#/settings'],
].filter(([name]) => !only || only.includes(name));
const themes = quick ? ['dark'] : ['dark', 'light'];
const widths = quick ? [1440] : [1440, 390];
for (const width of widths) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  for (const theme of themes)
    for (const [name, hash] of routes) {
      await page.goto(`${base}/panel/${hash}`);
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        document.documentElement.dataset.motion = 'off';
      }, theme);
      await page.waitForTimeout(350);
      await page.screenshot({
        path: `${out}/${name}-${theme}-${width}.png`,
        fullPage: true,
      });
    }
}
await browser.close();
console.log('done', routes.length * themes.length * widths.length);
