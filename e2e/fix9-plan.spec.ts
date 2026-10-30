import { readFileSync } from 'node:fs';
import {
  test,
  expect,
  hook,
  menuAction,
  showCategory,
  settleBuild,
  addOwnMedia,
  HONEY_MEDIA,
} from './fixtures';

// FIX9: Review & swap opened from the AI card finds the built scenes again.
const PLAN = readFileSync('tests/fixtures/plans/honey-en.json', 'utf8');

test('[FIX9-002] Review & swap from the AI card shows the media rows and never says "scene deleted", also when the saved scene ids are out of step with the project', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_SPEECH__?: boolean }).__AIVE_E2E_SPEECH__ = true;
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await menuAction(page, '#new-project');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
  await addOwnMedia(page, HONEY_MEDIA);
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(PLAN);
  await page.locator('[data-action="build-video"]').click();
  await settleBuild(page);
  await page.locator('.plan-build #plan-cancel').click();
  await expect(page.locator('.plan-build')).toHaveCount(0);
  const built = (await hook(page)).project.compositions.map((c) => c.id);
  expect(built.length).toBeGreaterThanOrEqual(3);
  // The saved state now points at scenes that do not exist (an older panel
  // saved it, or a scene was remade under a new id).
  await page.evaluate(() => {
    for (const [key, text] of Object.entries(localStorage))
      if (key.startsWith('aive.videoPlan')) {
        const value = JSON.parse(text);
        const damage = (state: { sceneIds: (string | null)[] }) => {
          state.sceneIds = state.sceneIds.map((id) => `${id}-gone`);
        };
        if (value.sceneIds) damage(value);
        else Object.values(value).forEach((s) => damage(s as never));
        localStorage.setItem(key, JSON.stringify(value));
      }
  });
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  expect((await hook(page)).project.compositions.map((c) => c.id)).toEqual(
    built,
  );
  await showCategory(page, 'AI');
  const card = page
    .locator('#library-ai .shelf-item', { hasText: 'Where honey comes from' })
    .first();
  await expect(card).not.toContainText('Not built');
  await card.locator('[data-action$="more"], .shelf-more').first().click();
  await page.getByRole('menuitem', { name: 'Review & swap media' }).click();
  const panel = page.locator('.plan-review');
  await expect(panel).toContainText('Cold open');
  await expect(panel).not.toContainText('was deleted');
  await expect(panel.locator('[data-plan-layer]')).toHaveCount(2);
  await panel.locator('.plan-more > summary').click();
  await panel.locator('[data-action="plan-compare"]').click();
  await expect(panel.locator('.plan-compare')).not.toContainText('deleted');
  await page.screenshot({ path: 'reports/fix9/review-from-card.png' });
});

test('[FIX9-004] an AI composition card opens its assets in the same panel (never builds or adds by a click); an AI scene saved in My Templates has the AI menu with Review & swap and without Build again', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_SPEECH__?: boolean }).__AIVE_E2E_SPEECH__ = true;
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await addOwnMedia(page, HONEY_MEDIA);
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(PLAN);
  // Import only (Save to library): nothing is built yet.
  await page.locator('[data-action="build-video"]').click();
  await settleBuild(page);
  await page.locator('.plan-build #plan-cancel').click();
  await expect(page.locator('.plan-build')).toHaveCount(0);
  const state = await hook(page);
  const scenes = state.project.compositions.length;
  expect(scenes).toBeGreaterThanOrEqual(3);
  const card = page
    .locator('#library-ai .shelf-item', { hasText: 'Where honey comes from' })
    .first();
  await card.locator('.shelf-card').click();
  // No rebuild: the scenes are the same, and the assets are in this panel.
  const view = page.locator('#library-ai .asset-view');
  await expect(view).toBeVisible();
  expect((await hook(page)).project.compositions).toHaveLength(scenes);
  await expect(page.locator('.plan-build')).toHaveCount(0);
  await expect(page.locator('#library-ai .shelf-tabs')).toBeHidden();
  const cards = view.locator('.asset-card');
  expect(await cards.count()).toBeGreaterThan(3);
  await expect(cards.first().locator('canvas')).toHaveCount(1);
  await expect(cards.first().locator('.asset-name')).toHaveText(/\(.+\)$/);
  const a = (await cards.nth(0).boundingBox())!;
  const b = (await cards.nth(1).boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThan(a.x + a.width / 2);
  await expect(view.locator('[data-action="ai-assets-review"]')).toBeVisible();
  await expect(view.locator('[data-action="ai-assets-build"]')).toContainText(
    'Build again',
  );
  await page.screenshot({ path: 'reports/fix9/ai-assets.png' });
  // One click adds one asset to the open scene.
  const open = async () => {
    const s = await hook(page);
    return s.project.compositions.find(
      (item) => item.id === s.session.compositionId,
    )!.layers.length;
  };
  const before = await open();
  await cards.first().click();
  await expect.poll(open).toBe(before + 1);
  await view.locator('[data-action="asset-view-back"]').click();
  await expect(view).toHaveCount(0);
  await expect(card).toBeVisible();
  // Save this AI scene to My Templates: its menu is the AI menu.
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  await page.mouse.click(box.x + 6, box.y + 6, { button: 'right' });
  await page
    .locator('#canvas-context-menu [data-action="save-scene-to-mine"]')
    .click();
  await showCategory(page, 'MyTemplates');
  const mine = page.locator('#library-mine .mine-card').first();
  await mine.click({ button: 'right' });
  const menu = page.locator('#mine-menu');
  await expect(
    menu.getByRole('menuitem', { name: 'Review & swap media' }),
  ).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Build again' })).toHaveCount(
    0,
  );
  await page.screenshot({ path: 'reports/fix9/mine-ai-menu.png' });
  await menu.getByRole('menuitem', { name: 'Review & swap media' }).click();
  await expect(
    page.locator('#library-mine .asset-view[data-page="review"]'),
  ).toBeVisible();
});

test('[FIX9-009] Review & swap never says "scene deleted": with the built scenes deleted the media rows still show and a scene that is missing is built again by one button', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_SPEECH__?: boolean }).__AIVE_E2E_SPEECH__ = true;
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await addOwnMedia(page, HONEY_MEDIA);
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(PLAN);
  await page.locator('[data-action="build-video"]').click();
  await settleBuild(page);
  await page.locator('.plan-build #plan-cancel').click();
  await expect(page.locator('.plan-build')).toHaveCount(0);
  const before = (await hook(page)).project.compositions.map((c) => c.id);
  expect(before.length).toBeGreaterThanOrEqual(3);
  // Delete the built scenes (the last scene of a project always stays), as
  // the person did with the default template's scene.
  await page.locator('#scene-board-toggle').click();
  for (const id of before.slice(0, -1)) {
    await page
      .locator(
        `.scene-card[data-scene-id="${id}"] [data-action="delete-scene"]`,
      )
      .click();
  }
  await expect
    .poll(async () => (await hook(page)).project.compositions.length)
    .toBe(1);
  const card = page
    .locator('#library-ai .shelf-item', { hasText: 'Where honey comes from' })
    .first();
  await showCategory(page, 'AI');
  await card.locator('.shelf-card').click();
  await page.locator('#library-ai [data-action="ai-assets-review"]').click();
  const panel = page.locator('.plan-review');
  await expect(panel.locator('[data-plan-layer]')).toHaveCount(2);
  await expect(panel).not.toContainText('deleted');
  // One button builds the missing scene again; still no message.
  await panel.locator('[data-action="plan-regenerate"]').first().click();
  await expect
    .poll(async () => (await hook(page)).project.compositions.length)
    .toBeGreaterThan(0);
  await expect(page.locator('.plan-review')).not.toContainText('deleted');
});
