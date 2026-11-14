// P3U: project memory, in a real browser, on the P3 mock director. Round A
// moved it into the Project page's Memory tab and removed My Styles and the
// Style review (P3U-012 and P3U-013 are Dropped). Every test acts like a person.
import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';
import { signUp } from './p2-helpers';

const SHOTS = process.env.P3U_SHOTS ?? '';
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) =>
          Number.isFinite(a.effect?.getComputedTiming().iterations),
        )
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

/**
 * Starts a Video with Director (Round B: AI mode in the editor) and opens its
 * Project's Memory tab. A Video id in the address opens its Project.
 */
async function talk(page: Page) {
  await page.goto('/panel/#/home');
  await page
    .locator('#home-input')
    .fill('A 60 second explainer about rainbows');
  await page.locator('#home-send').click();
  await expect(page.locator('#ai-brief-card')).toBeVisible({ timeout: 30_000 });
  const videoId = (await hook(page)).project.id;
  await page.goto(`/panel/#/project/${videoId}/memory`);
}

test('[P3U-011] project memory: the person adds, pins and forgets what Director remembers, and sees the chats', async ({
  page,
}) => {
  await signUp(page);
  await talk(page);
  await expect(page).toHaveURL(/#\/project\/[^/]+\/memory/);
  await expect(page.locator('#tab-memory h2').first()).toContainText(
    'Project memory',
  );
  // The Video and its chat are listed beside the facts.
  await expect(page.locator('.mem-chat')).toHaveCount(1);
  await expect(page.locator('.mem-chat')).toContainText('1');
  const start = await page.locator('.mem-fact').count();
  await page.locator('#mem-new').fill('Always end with a call to action');
  await page.locator('#mem-add').click();
  await expect(page.locator('.mem-fact')).toHaveCount(start + 1);
  // The same fact twice is kept once.
  await page.locator('#mem-new').fill('always end with a call to action');
  await page.keyboard.press('Enter');
  await expect(page.locator('.mem-fact')).toHaveCount(start + 1);
  // Pinned facts go first and say so.
  const added = page.locator('.mem-fact', {
    hasText: 'call to action',
  });
  await added.locator('[data-act=pin]').click();
  await expect(page.locator('.mem-fact').first()).toContainText(
    'call to action',
  );
  await expect(page.locator('.mem-fact.pinned [data-act=pin]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await shot(page, 'project-memory');
  await page
    .locator('.mem-fact', { hasText: 'call to action' })
    .locator('[data-act=forget]')
    .click();
  await expect(page.locator('.mem-fact')).toHaveCount(start);
});

test('[P3U-014] the memory page fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  await talk(page);
  await expect(page.locator('#tab-memory h2').first()).toContainText(
    'Project memory',
  );
  const over = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
  expect(await over()).toBeLessThanOrEqual(0);
  await shot(page, 'project-memory-phone');
});
