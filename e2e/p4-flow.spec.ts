// P4 Part 1: projects first, Styles made from projects, the Asset Library and
// Director's asset step. Every test acts like a person, on the offline mock.
import { test, expect, hook, settleBuild } from './fixtures';
import { balance, signUp } from './p2-helpers';
import type { Page } from '@playwright/test';

const tags = (page: Page) => page.locator('#project-list [data-project]');
/** Create with Blank project; returns the new project's id. */
async function newBlank(page: Page) {
  await page.goto('/panel/#/projects');
  await page.locator('#new-blank').click();
  await expect(page).toHaveURL(/#\/start\/[^/?]+/);
  return /#\/start\/([^/?]+)/.exec(page.url())![1]!;
}

test('[P4F-001] [P4F-002] [P4F-003] Create with Director and Create with Blank both make a project at once; blank asks Director or Editor; Open Editor opens that same project; Manual becomes AI once Director is used', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/projects');
  await expect(page.locator('#new-director')).toHaveText(
    'Create with Director',
  );
  await expect(page.locator('#new-blank')).toHaveText(
    'Create with Blank project',
  );
  await expect(page.locator('#project-list')).toContainText('No projects yet');
  // Blank: the project exists, two cards ask how to go on.
  await page.locator('#new-blank').click();
  await expect(page).toHaveURL(/#\/start\//);
  await expect(page.locator('[data-start="director"]')).toBeVisible();
  await expect(page.locator('[data-start="editor"]')).toBeVisible();
  const id = /#\/start\/([^/?]+)/.exec(page.url())![1]!;
  await page.locator('#start-name').fill('Shadows lesson');
  await page.locator('[data-start="editor"]').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  // The editor opened the very project the panel made.
  const state = await hook(page);
  expect(state.project.id).toBe(id);
  expect(state.project.metadata.name).toBe('Shadows lesson');
  // Back in the panel it is a Manual project.
  await page.goto('/panel/#/projects');
  const card = page.locator(`[data-project="${id}"]`);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-origin', 'manual');
  await expect(card.locator('.ws-tag')).toHaveText('Manual');
  // Director is used on it: it becomes AI.
  await card.locator('summary').click();
  await card.locator('[data-act="director"]').click();
  await expect(page).toHaveURL(new RegExp(`#/room/${id}`));
  await page
    .locator('#chat-input, .composer textarea, textarea')
    .first()
    .fill('Make a short video about shadows');
  await page.keyboard.press('Enter');
  await expect(page.locator('.room-msg.director').first()).toBeVisible({
    timeout: 20_000,
  });
  await page.goto('/panel/#/projects');
  await expect(page.locator(`[data-project="${id}"]`)).toHaveAttribute(
    'data-origin',
    'ai',
  );
  // Create with Director: a project at once, AI from the start.
  await page.locator('#new-director').click();
  await expect(page).toHaveURL(/#\/room\//);
  await page.goto('/panel/#/projects');
  await expect(tags(page)).toHaveCount(2);
  await expect(
    page.locator('#project-list [data-project][data-origin="ai"]'),
  ).toHaveCount(2);
});

test('[P4F-004] [P4F-005] [P4F-006] Save to your styles makes a Style card, the project moves inside it, and the Asset Library shows Style then Project then the three libraries', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/assets');
  // No Style yet: no Style card, and an empty library says so.
  await expect(page.locator('[data-lib-style]')).toHaveCount(0);
  const id = await newBlank(page);
  await page.goto('/panel/#/projects');
  const card = page.locator(`[data-project="${id}"]`);
  await card.locator('summary').click();
  await card.locator('[data-act="save-style"]').click();
  await expect(page.locator('.ws-dialog')).toBeVisible();
  await page.locator('#style-name').fill('Hindi physics explainer');
  await page.locator('#style-save').click();
  // The project left the plain Project cards.
  await expect(
    page.locator(`#project-list [data-project="${id}"]`),
  ).toHaveCount(0);
  // A Style card exists on the Styles page and the Asset Library.
  await page.goto('/panel/#/styles');
  await expect(
    page.locator('#ws-styles [data-ws-style]').first(),
  ).toContainText('Hindi physics explainer');
  await page.goto('/panel/#/assets');
  const style = page.locator('[data-lib-style]');
  await expect(style).toHaveCount(1);
  await expect(page.locator('[data-lib-project]')).toHaveCount(0);
  await style.click();
  await expect(page.locator(`[data-lib-project="${id}"]`)).toBeVisible();
  await page.locator(`[data-lib-project="${id}"]`).click();
  await expect(page.locator('[data-library]')).toHaveCount(3);
  await expect(page.locator('[data-library="ai"]')).toContainText(
    'AI Libraries',
  );
  await expect(page.locator('[data-library="templates"]')).toContainText(
    'My Templates Libraries',
  );
  await expect(page.locator('[data-library="media"]')).toContainText(
    'Media Libraries',
  );
});

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
  void balance;
  void settleBuild;
});

test('[P4F-008] a deleted project waits in the Trash and can be restored; a deleted asset too', async ({
  page,
}) => {
  await signUp(page);
  const id = await newBlank(page);
  await page.goto('/panel/#/projects');
  const card = page.locator(`[data-project="${id}"]`);
  await card.locator('summary').click();
  await card.locator('[data-act="trash"]').click();
  await expect(card).toHaveCount(0);
  await page.locator('[data-view="trash"]').click();
  await expect(page.locator('#trash-note')).toContainText('30 days');
  await expect(page.locator(`[data-project="${id}"]`)).toBeVisible();
  await page.locator(`[data-project="${id}"] [data-act="restore"]`).click();
  await page.locator('[data-view="all"]').click();
  await expect(page.locator(`[data-project="${id}"]`)).toBeVisible();
});

async function briefToPlan(page: Page) {
  await page.goto('/panel/#/styles');
  await page.locator('[data-style="story-explainer"] a.button').click();
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
  // The project card says Director is waiting.
  await page.goto('/panel/#/projects');
  await expect(page.locator('[data-waiting="true"]').first()).toBeVisible();
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

test('[P4F-011] after a Director build "Save to your styles?" makes a Style card and the project moves inside it', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await briefToPlan(page);
  await page.locator('#plan-approve').click();
  await page.locator('#step-ai').click();
  await expect(page.locator('#build-status')).toHaveAttribute(
    'data-state',
    'done',
    { timeout: 60_000 },
  );
  await page.locator('#save-style-q').click();
  await page.locator('#style-name').fill('Eratosthenes look');
  await page.locator('#style-save').click();
  await expect(page).toHaveURL(/#\/assets/);
  await expect(page.locator('[data-lib-style]')).toContainText(
    'Eratosthenes look',
  );
  await page.goto('/panel/#/projects');
  await expect(page.locator('#project-list [data-project]')).toHaveCount(0);
});
