import { test, expect } from './fixtures';
import { balance, signUp } from './p2-helpers';

// P4 Part 5, as Round A states it: Studio tools from the Platform Config
// (the Autodraft field lists). Story and SEO are text tools, Voice is one
// tool with four tabs (e2e/round-a-library.spec.ts proves the tabs), and
// everything a tool makes is listed under it and in the Asset Library.
test('[P4U-001] Studio lists Story and SEO next to the other tools, and Voice is one card', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/studio');
  const list = page.locator('#studio-list [data-studio]');
  await expect(list).toHaveCount(6);
  await expect(page.locator('[data-studio="story"]')).toBeVisible();
  await expect(page.locator('[data-studio="seo"]')).toBeVisible();
  // One Voice card, not four.
  await expect(page.locator('[data-studio="voice-change"]')).toHaveCount(0);
  await expect(page.locator('[data-studio="sfx"]')).toHaveCount(0);
  await page.locator('[data-studio="voice"] a.button').first().click();
  await expect(page).toHaveURL(/#\/studio\/voice$/);
  const tabs = page.locator('#studio-family-tabs a');
  await expect(tabs).toHaveCount(4);
  await tabs.nth(1).click();
  await expect(page).toHaveURL(/#\/studio\/sfx$/);
  await expect(
    page.locator('#studio-family-tabs a[aria-current="page"]'),
  ).toHaveText('AI Sound');
  // The main tab bar still shows the family as one tab, "Voice".
  await expect(
    page.locator('.tool-tabs:not(.sub-tabs) a[aria-current="page"]'),
  ).toHaveText('Voice');
});

test('[P4U-003] [P4U-004] Story runs on the mock, costs credits, saves to the Asset Library, and the tool lists what it made', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/studio/story');
  await expect(page.locator('#studio-library-empty')).toBeVisible();
  await page.locator('#sf-plot').fill('A kite that learns to fly in the rain');
  await page.locator('[data-field="category"] [data-value="moral"]').click();
  await page.locator('[data-field="language"] [data-value="en"]').click();
  await expect(page.locator('#studio-cost')).toHaveText(
    /This costs up to \d+ credits\./,
  );
  const before = await balance(page);
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-saved')).toContainText(
    'Saved to the Asset Library',
  );
  expect(await balance(page)).toBeLessThan(before);
  // The tool lists the result at once, and again when it is opened later.
  await expect(page.locator('#studio-library [data-asset]')).toHaveCount(1);
  await page.goto('/panel/#/studio');
  await page.goto('/panel/#/studio/story');
  await expect(page.locator('#studio-library [data-asset]')).toHaveCount(1);
  await page.goto('/panel/#/assets');
  await expect(page.locator('body')).toContainText('Studio Libraries');
});

test('[P4U-005] SEO asks what to make, with Titles, Description, Tags and Hashtags as choices', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/studio/seo');
  await expect(page.locator('[data-field="outputs"] [data-value]')).toHaveCount(
    4,
  );
  await page.locator('#sf-title').fill('How kites fly');
  await page.locator('#sf-description').fill('A short lesson on lift.');
  await page.locator('[data-field="outputs"] [data-value="tags"]').click();
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-saved')).toContainText(
    'Saved to the Asset Library',
  );
});
