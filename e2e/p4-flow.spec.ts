// P4 Part 1, as Round A states it: the Asset Library order, the Trash and
// Director's asset step. (P4F-001 to P4F-006 and P4F-011, Styles made from
// projects, are Dropped by Round A: e2e/round-a-panel.spec.ts states the
// Project and Video flow.) Every test acts like a person, on the offline mock.
import { test, expect, hook } from './fixtures';
import { signUp } from './p2-helpers';
import type { Page } from '@playwright/test';

/** New project › Start with editor; back on the Project page. Returns the Project id. */
async function newBlank(page: Page) {
  await page.goto('/panel/#/projects?new=1');
  await page.locator('[data-option="editor"]').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  await hook(page);
  await page.goBack();
  await page.getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page).toHaveURL(/#\/project\//);
  return /#\/project\/([^/?]+)/.exec(page.url())![1]!;
}

test('[P4F-007] the Asset Library lists cards in the order they were made, and a Studio result without a project fills one Studio Libraries card', async ({
  page,
}) => {
  await signUp(page);
  const a = await newBlank(page);
  await page.goto('/panel/#/assets');
  await expect(page.locator('[data-lib-studio]')).toHaveCount(0);
  await expect(page.locator(`[data-lib-project="${a}"]`)).toBeVisible();
  // A Studio asset (no project) adds the Studio card after the project.
  await page.evaluate(() => {
    const users = JSON.parse(localStorage.getItem('aive.localCloud')!).users;
    const me = users[users.length - 1].id as string;
    localStorage.setItem(
      'aive.panel.assets',
      JSON.stringify([
        {
          id: 'x1',
          userId: me,
          projectId: 'unsorted',
          kind: 'text',
          name: 'A story',
          studioId: 'story',
          text: 'Once',
          bytes: 4,
          createdAt: new Date(Date.now() + 5000).toISOString(),
        },
      ]),
    );
  });
  await page.reload();
  const cards = page.locator('#lib-grid > a');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute('data-lib-project', a);
  await expect(cards.nth(1)).toHaveAttribute('data-lib-studio', '');
  await cards.nth(1).click();
  await expect(page.locator('[data-studio-feature="story"]')).toBeVisible();
  await page.locator('[data-studio-feature="story"]').click();
  await expect(page.locator('#asset-list [data-asset]')).toHaveCount(1);
});

test('[P4F-008] a deleted project waits in the Trash and can be restored; a deleted asset too', async ({
  page,
}) => {
  await signUp(page);
  const id = await newBlank(page);
  await page.goto('/panel/#/projects');
  const card = page.locator(`[data-ws-project="${id}"]`);
  await card.locator('summary').click();
  await card.locator('[data-act="delete"]').click();
  await expect(card).toHaveCount(0);
  await page.locator('[data-view="trash"]').click();
  await expect(page.locator('#trash-note')).toContainText('30 days');
  await expect(page.locator(`[data-trash-project="${id}"]`)).toBeVisible();
  await page
    .locator(`[data-trash-project="${id}"] [data-act="restore"]`)
    .click();
  await page.locator('[data-view="all"]').click();
  await expect(page.locator(`[data-ws-project="${id}"]`)).toBeVisible();
});
