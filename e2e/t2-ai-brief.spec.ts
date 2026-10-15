import { test, expect, menuAction, showCategory } from './fixtures';

// T2: Copy AI brief from the main menu and the AI category.
test('[QT-022] Copy AI brief copies the task, project facts, the live library, the rules and the request; a blocked clipboard shows the text', async ({
  page,
}) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await menuAction(page, '#open-brief');
  const dialog = page.locator('.brief-dialog');
  await dialog.locator('#brief-request').fill('A 20 second intro');
  await dialog.locator('#brief-copy').click();
  await expect(
    page.locator('.toast', { hasText: /AI brief copied \(\d+ items listed\)/ }),
  ).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(new TextEncoder().encode(text).length).toBeLessThan(40 * 1024);
  expect(text.startsWith('You are authoring a Creator Pack')).toBe(true);
  expect(text).toContain('canvas: 1280x720 (16:9), 30 fps');
  for (const kind of [
    'shape',
    'background',
    'text',
    'template',
    'motion',
    'preset',
    'composition',
    'theme',
    'adjust',
    'filter',
    'effect',
    'transition',
  ])
    expect(text).toContain(`\n${kind}:\n`);
  expect(text).toContain('dark-neon - Dark Neon');
  expect(text).toContain('RULES');
  expect(text.trim().endsWith('REQUEST: A 20 second intro')).toBe(true);
  // The AI category header opens the same dialog; a blocked clipboard shows
  // the text in a read-only box.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('blocked')) },
      configurable: true,
    });
  });
  await showCategory(page, 'AI');
  await page.locator('#ai-copy-brief').click();
  await dialog.locator('#brief-copy').click();
  await expect(dialog.locator('#brief-fallback')).toBeVisible();
  await expect(dialog.locator('#brief-text')).toHaveValue(
    /^You are authoring a Creator Pack/,
  );
  await expect(dialog.locator('#brief-copy-text')).toBeVisible();
});
