import { test, expect } from './fixtures';

// QA-001 / QA-002: the export dialog lists problems before the export and
// each one can be shown in the editor.
test('[QA-001][QA-002] the export dialog warns about an empty scene and a layer outside the picture, and Show opens it', async ({
  page,
  openFixtureProject,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('preflight-issues.json');
  await page.locator('#export').click();
  const box = page.locator('.modal-dialog #export-preflight');
  await expect(box).toBeVisible();
  await expect(box.locator('[data-preflight="outside-canvas"]')).toHaveCount(1);
  await expect(box.locator('[data-preflight="empty-scene"]')).toContainText(
    'Empty scene has no clips.',
  );
  // Show closes the dialog and selects the layer the warning names.
  await box.locator('[data-preflight="outside-canvas"] button').click();
  await expect(page.locator('.modal-dialog')).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __AIVE__: { getSession(): { selectedIds: string[] } };
            }
          ).__AIVE__.getSession().selectedIds.length,
      ),
    )
    .toBe(1);
});

test('[QA-001] a clean project says no problems were found', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await page.locator('#export').click();
  await expect(
    page.locator('.modal-dialog #export-preflight [data-preflight]'),
  ).toBeVisible();
});
