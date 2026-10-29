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
