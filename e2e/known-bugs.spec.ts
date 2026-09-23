import { test, expect } from './fixtures';

// Known, unfixed bugs reproduced as expected failures (docs/PROCESS.md).
test.fail(
  '[MED-035] the Media tab lists the project media cards',
  async ({ page, openFixtureProject }) => {
    await page.goto('/');
    await openFixtureProject('nle-example.json');
    await page.locator('[data-category="Media"]').click();
    // The cards live inside the library placeholder, which the Media tab hides.
    await expect(
      page.locator('[draggable="true"]', { hasText: 'Footage 1080p' }),
    ).toBeVisible({ timeout: 2000 });
  },
);
