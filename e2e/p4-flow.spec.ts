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

async function briefToPlan(page: Page) {
  await page.goto('/panel/#/styles');
  await page.locator('[data-style="story-explainer"] [data-use-style]').click();
  await page
    .locator('#f-idea')
    .fill(
      'How Eratosthenes measured the circumference of the Earth. He used shadows in two cities.',
    );
  await page.locator('#talk-director').click();
  await expect(page.locator('.msg[data-kind="question"]').last()).toContainText(
    'script',
  );
  for (const line of ['Write it for me', 'Text to speech', 'None', 'Hindi']) {
    await page.locator('#chat-input').fill(line);
    await page.locator('#chat-send').click();
  }
  await expect(page.locator('.msg[data-kind="upgrade"]')).toBeVisible();
  await page.locator('#make-plan').click();
  await expect(page.locator('#plan-card .scene')).toHaveCount(5);
}

test('[P4F-009] Director waits at the asset step: every file is listed by its exact name, each can be AI, uploaded, or given as a prompt; the choice and the added file survive a reload', async ({
  page,
}) => {
  await signUp(page);
  await briefToPlan(page);
  await page.locator('#plan-approve').click();
  await expect(page).toHaveURL(/#\/assets-step\/.+/);
  const rows = page.locator('#step-list .step-row');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  const first = rows.first();
  const name = (await first.getAttribute('data-slot'))!;
  await first.locator('[data-mode="prompt"]').click();
  await expect(first.locator('[data-prompt]')).not.toBeEmpty();
  await first.locator('[data-mode="upload"]').click();
  await first.locator('[data-slot-file]').setInputFiles({
    name: 'whatever-name.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(first).toHaveAttribute('data-filled', 'true');
  // Close the site and come back: same page, same choices.
  await page.reload();
  await expect(page).toHaveURL(/#\/assets-step\/.+/);
  const again = page.locator(`#step-list [data-slot="${name}"]`);
  await expect(again).toHaveAttribute('data-mode', 'upload');
  await expect(again).toHaveAttribute('data-filled', 'true');
  // Home's Continue says Director is waiting at the assets.
  await page.goto('/panel/#/home');
  await expect(
    page.locator('#home-continue [data-stage="assets"]').first(),
  ).toBeVisible();
});

test('[P4F-010] Continue without assets builds the project with blank slots and the editor lists every expected asset name', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await briefToPlan(page);
  await page.locator('#plan-approve').click();
  await expect(page).toHaveURL(/#\/assets-step\/.+/);
  const rows = page.locator('#step-list .step-row');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  for (let i = 0; i < count; i++)
    await rows.nth(i).locator('[data-mode="upload"]').click();
  const names = await rows.evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-slot')),
  );
  await page.locator('#step-skip').click();
  await expect(page.locator('#build-status')).toHaveAttribute(
    'data-state',
    'done',
    { timeout: 60_000 },
  );
  await page.locator('#open-in-editor').click();
  const dialog = page.locator('#missing-assets-list');
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  for (const n of names) await expect(dialog).toContainText(n!);
});
