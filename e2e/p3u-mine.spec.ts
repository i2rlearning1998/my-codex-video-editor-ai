// P3U: project memory, My Styles and the Style review, in a real browser, on
// the P3 mock director. Every test acts like a person.
import { test, expect, type Page } from './fixtures';
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

/** Starts a chat so Director has something to remember. */
async function talk(page: Page) {
  await page.goto('/panel/#/room');
  await page
    .locator('#chat-input')
    .fill('A 60 second explainer about rainbows');
  await page.keyboard.press('Enter');
  await expect(page.locator('.room-fact')).toHaveCount(1);
}

test('[P3U-011] project memory: the person adds, pins and forgets what Director remembers, and sees the chats', async ({
  page,
}) => {
  await signUp(page);
  await talk(page);
  await page.locator('.room-open-memory').click();
  await expect(page.locator('h1')).toContainText('Project memory');
  await expect(page.locator('.mem-fact')).toHaveCount(1);
  await expect(page.locator('.mem-chat')).toHaveCount(1);
  await page.locator('#mem-new').fill('Always end with a call to action');
  await page.locator('#mem-add').click();
  await expect(page.locator('.mem-fact')).toHaveCount(2);
  // The same fact twice is kept once.
  await page.locator('#mem-new').fill('always end with a call to action');
  await page.keyboard.press('Enter');
  await expect(page.locator('.mem-fact')).toHaveCount(2);
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
  await expect(page.locator('.mem-fact')).toHaveCount(1);
});

test('[P3U-012] Make this my Style makes a draft that is reviewed, edited and accepted before it is used', async ({
  page,
}) => {
  await signUp(page);
  await talk(page);
  await page.locator('.room-make-style').click();
  await page.locator('.room-note-link').click();
  await expect(page.locator('h1')).toContainText('Review your Style');
  await expect(page.locator('.mine-badge')).toHaveAttribute(
    'data-status',
    'draft',
  );
  await expect(page.locator('#mine-save')).toBeHidden();
  // A Style needs a name and at least one rule.
  await page.locator('#mine-name').fill('');
  await page.locator('#mine-accept').click();
  await expect(page.locator('#mine-error')).toContainText('name');
  await page.locator('#mine-name').fill('Rainbow explainers');
  await page.locator('#mine-rules').fill('');
  await page.locator('#mine-accept').click();
  await expect(page.locator('#mine-error')).toContainText('rule');
  await page.locator('#mine-rules').fill('Open with a question\nKeep it warm');
  await page.locator('#mine-add-colour').click();
  await expect(page.locator('.mine-swatch')).toHaveCount(4);
  // The preview follows what is typed.
  await expect(page.locator('.mine-preview-title')).toHaveText(
    'Rainbow explainers',
  );
  await shot(page, 'style-review');
  await page.locator('#mine-accept').click();
  await expect(page.locator('#mine-note')).toContainText('active Style');
  await expect(page.locator('.mine-badge')).toHaveAttribute(
    'data-status',
    'active',
  );
  await expect(page.locator('#mine-accept')).toBeHidden();
  await expect(page.locator('#mine-save')).toBeVisible();
  // Editing an accepted Style saves a new version.
  await page.locator('#mine-save').click();
  await expect(page.locator('#mine-note')).toContainText('version 3');
  // It is listed on Styles and on My Styles.
  await page.locator('.back-link').click();
  await expect(page.locator('.mine-card')).toHaveCount(1);
  await expect(page.locator('.mine-card .mine-badge')).toHaveText('Active');
  await shot(page, 'my-styles');
  await page.goto('/panel/#/styles');
  await expect(page.locator('#mine-strip .mine-card')).toHaveCount(1);
});

test('[P3U-013] My Styles says so when empty, and an unknown Style says it was not found', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/my-styles');
  await expect(page.locator('#mine-grid .empty-state')).toContainText(
    'No Style of your own',
  );
  await page.goto('/panel/#/my-styles/nope');
  await expect(page.locator('.error-state')).toContainText('not found');
});

test('[P3U-014] the memory page and the Style review fit a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  await talk(page);
  await page.locator('.room-open-memory').click();
  await expect(page.locator('h1')).toContainText('Project memory');
  const over = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
  expect(await over()).toBeLessThanOrEqual(0);
  await shot(page, 'project-memory-phone');
  await page.locator('#mem-make-style').click();
  await page.locator('#mem-note a, #mem-note').first().waitFor();
  await page.locator('#mem-note a').click();
  await expect(page.locator('h1')).toContainText('Review your Style');
  expect(await over()).toBeLessThanOrEqual(0);
  await shot(page, 'style-review-phone');
});
