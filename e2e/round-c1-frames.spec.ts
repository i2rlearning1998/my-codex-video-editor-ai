// ROUND-C1 F2 (C1.5.2, C1.6.2): after a plan passes its checks, AI mode draws
// sample frames of every new graphic off screen (the editor's own renderer
// and the graphic's own sandboxed session). A blank graphic, one drawn past
// the canvas edge, one that throws and one that never finishes a frame each
// get ONE fix call; failing twice is refused with the owner's text and
// nothing is charged. Stop during the check keeps the brief; a reload during
// the check comes back to the brief. Offline model with scripted answers.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { credits, lastDirector, startAi, toPlan } from './round-b-helpers';
import { stage } from './round-c1-helpers';

const block = (name: string, body: string) => `({
  id: 'shape-g',
  version: '1.0.0',
  name: '${name}',
  category: 'Data',
  defaultDuration: 3,
  thumbnailTime: 1,
  params: [{ name: 'color', label: 'Colour', type: 'color', default: '#ffb703' }],
  render(ctx, t, size, params, seed) {
    ${body}
  },
})`;
const GOOD = block(
  'Centred box',
  'ctx.fillStyle = params.color; ctx.fillRect(size.width * 0.3, size.height * 0.3, size.width * 0.4, size.height * 0.4);',
);
const BLANK = block('Empty box', '');
const OFF = block(
  'Sliding box',
  'ctx.fillStyle = params.color; ctx.fillRect(-size.width * 0.3, size.height * 0.3, size.width * 0.6, size.height * 0.4);',
);
const THROWS = block('Broken box', "throw new Error('boom');");
const LOOPS = block('Spinning box', 'let i = 0; while (i >= 0) { i = i + 1; }');
const plan = (source: string) => ({
  format: 'video-plan',
  version: 4,
  meta: {
    title: 'Boxes',
    language: 'en',
    aspect: '16:9',
    videoType: 'explainer',
  },
  defs: { blocks: [{ id: 'shape-g', tier: 'B', source }] },
  scenes: [
    {
      id: 'one',
      title: 'A box',
      narration: 'A box appears.',
      durationHint: 4,
      notes: 'method:motion-graphics;source:ai',
      layers: [
        { id: 't', kind: 'title', text: 'Boxes', anchor: 'top' },
        { id: 'g', kind: 'block', block: 'shape-g' },
      ],
    },
  ],
});
const answer = (source: string) => ({ plan: plan(source), upgrades: [] });
const MESSAGE = 'Explain boxes, 1 minute, in English';
const graphicNames = (page: Page) =>
  page.locator('#ai-plan-card .ai-plan-graphic').allTextContents();

test('[RDC1-064] a new graphic that draws nothing gets one fix call; the fixed plan reaches the Plan card', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await stage(page, null, undefined, [answer(BLANK), answer(GOOD)]);
  await startAi(page, MESSAGE);
  await toPlan(page);
  expect((await graphicNames(page)).join(' ')).toMatch(/Centred box/);
  await page
    .locator('.editor-shell')
    .screenshot({ path: 'reports/round-c1/f2-blank-fixed.png' });
});

test('[RDC1-064] a graphic drawn past the canvas edge twice is refused with the owner text; nothing is charged', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await stage(page, null, undefined, [answer(OFF), answer(OFF)]);
  await startAi(page, MESSAGE);
  const before = await credits(page);
  await page.locator('#ai-brief-card .ai-btn.primary').click();
  await expect(lastDirector(page)).toContainText(
    'I could not make a plan I trust from this brief.',
    { timeout: 60_000 },
  );
  await expect(page.locator('#ai-plan-card')).toHaveCount(0);
  await expect(page.locator('#ai-brief-card')).toBeVisible();
  expect(await credits(page)).toBe(before);
  await page
    .locator('.editor-shell')
    .screenshot({ path: 'reports/round-c1/f2-outside-refused.png' });
});

test('[RDC1-064] a graphic that throws, and one that never finishes a frame, each get one fix call', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await stage(page, null, undefined, [answer(THROWS), answer(GOOD)]);
  await startAi(page, MESSAGE);
  await toPlan(page);
  expect((await graphicNames(page)).join(' ')).toMatch(/Centred box/);
  // The endless loop: its sandbox stops it, the check says so, one fix.
  await stage(page, null, undefined, [answer(LOOPS), answer(GOOD)]);
  await page.reload();
  await expect(page.locator('#ai-plan-card')).toBeVisible({ timeout: 30_000 });
  await page.locator('#ai-input').fill('Make a new plan please');
  await page.locator('#ai-send').click();
  // A rewrite runs the same loop; the plan card shows the fixed graphic.
  await expect
    .poll(async () => (await graphicNames(page)).join(' '), {
      timeout: 60_000,
    })
    .toMatch(/Centred box/);
});

test('[RDC1-065] Stop during the frame check stops planning: nothing charged, the brief kept, planning again works', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await stage(page, null, undefined, [answer(LOOPS), answer(GOOD)]);
  await startAi(page, MESSAGE);
  const before = await credits(page);
  await page.locator('#ai-brief-card .ai-btn.primary').click();
  const working = page.locator('#ai-plan-working');
  await expect(working).toContainText('Drawing sample frames', {
    timeout: 30_000,
  });
  await page
    .locator('.editor-shell')
    .screenshot({ path: 'reports/round-c1/f2-checking.png' });
  await page.locator('#ai-plan-stop').click();
  await expect(working).toHaveCount(0);
  await expect(lastDirector(page)).toContainText(
    'I stopped making the plan. Nothing was charged',
  );
  await expect(page.locator('#ai-plan-card')).toHaveCount(0);
  await expect(page.locator('#ai-brief-card')).toBeVisible();
  expect(await credits(page)).toBe(before);
  // Impatient: press it again at once.
  await toPlan(page);
  expect((await graphicNames(page)).join(' ')).toMatch(/Centred box/);
});

test('[RDC1-065] a reload during the frame check comes back to the brief, nothing charged; Make the plan works again', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await stage(page, null, undefined, [answer(LOOPS), answer(GOOD)]);
  await startAi(page, MESSAGE);
  const before = await credits(page);
  await page.locator('#ai-brief-card .ai-btn.primary').click();
  await expect(page.locator('#ai-plan-working')).toContainText(
    'Drawing sample frames',
    { timeout: 30_000 },
  );
  await page.reload();
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/, {
    timeout: 30_000,
  });
  await expect(page.locator('#ai-brief-card')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#ai-plan-working')).toHaveCount(0);
  await expect(lastDirector(page)).toContainText(
    'The page was reloaded while I was making the plan',
  );
  expect(await credits(page)).toBe(before);
  await page
    .locator('.editor-shell')
    .screenshot({ path: 'reports/round-c1/f2-reload-resume.png' });
  await toPlan(page);
  expect((await graphicNames(page)).join(' ')).toMatch(/Centred box/);
});
