import { test, expect } from './fixtures';
import { balance, signUp } from './p2-helpers';

// P4 Part 5: Studio tools. Story and SEO are text tools, Voice is one tool
// with four tabs, and everything a tool makes is listed under it and in the
// Asset Library. The fields are the owner's samples (editable in Admin).
test('[P4U-001] [P4U-002] Studio lists Story and SEO, and Voice is one card whose four tabs are speech, changer, effects and music', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/studio');
  const list = page.locator('#studio-list [data-studio]');
  await expect(list).toHaveCount(9);
  await expect(page.locator('[data-studio="story"]')).toBeVisible();
  await expect(page.locator('[data-studio="seo"]')).toBeVisible();
  // One Voice card, not four.
  await expect(page.locator('[data-studio="voice-change"]')).toHaveCount(0);
  await expect(page.locator('[data-studio="sfx"]')).toHaveCount(0);

  await page.locator('[data-studio="voice"] a.button').first().click();
  await expect(page).toHaveURL(/#\/studio\/voice$/);
  const tabs = page.locator('#studio-family-tabs a');
  await expect(tabs).toHaveCount(4);
  await expect(tabs).toHaveText([
    'Voice',
    'Voice changer',
    'Sound effects',
    'Music & sound',
  ]);
  await tabs.nth(2).click();
  await expect(page).toHaveURL(/#\/studio\/sfx$/);
  await expect(
    page.locator('#studio-family-tabs a[aria-current="page"]'),
  ).toHaveText('Sound effects');
  // The main tab bar still shows the family as one tab, "Voice".
  await expect(
    page.locator('.tool-tabs:not(.sub-tabs) a[aria-current="page"]'),
  ).toHaveText('Voice');
  await page.screenshot({ path: 'reports/p4-studio-voice-tabs.png' });
});

test('[P4U-003] [P4U-004] Story runs on the mock, costs credits, saves to the Asset Library, and the tool lists what it made', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/studio/story');
  await expect(page.locator('#studio-library-empty')).toBeVisible();
  await page
    .locator('#f-premise')
    .fill('A kite that learns to fly in the rain');
  await page.locator('[data-field="genre"] input[value="adventure"]').check();
  await page.locator('[data-field="tone"] input[value="warm"]').check();
  await page.locator('[data-field="length"] input[value="short"]').check();
  await page.locator('[data-field="language"] input[value="en"]').check();
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
  await expect(
    page.locator('#studio-library li').filter({ hasText: 'Story' }),
  ).toHaveCount(1);
  await page.goto('/panel/#/studio');
  await page.goto('/panel/#/studio/story');
  await expect(
    page.locator('#studio-library li').filter({ hasText: 'Story' }),
  ).toHaveCount(1);
  await page.goto('/panel/#/assets');
  await expect(page.locator('body')).toContainText('Studio Libraries');
});

test('[P4U-005] SEO asks what to make, with Titles, Description, Tags and Hashtags as choices', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/studio/seo');
  await expect(page.locator('[data-field="make"] input')).toHaveCount(4);
  await page.locator('#f-topic').fill('How kites fly');
  await page.locator('[data-field="platform"] input[value="youtube"]').check();
  await page.locator('[data-field="make"] input[value="titles"]').check();
  await page.locator('[data-field="language"] input[value="en"]').check();
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-saved')).toContainText(
    'Saved to the Asset Library',
  );
});
