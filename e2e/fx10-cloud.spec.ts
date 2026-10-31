import { test, expect } from './fixtures';

// FX10: the Cloud storage switch and the Back button's exit dialog.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[FX10-008] the Cloud button opens a panel with a master switch and a switch with its size for Project, Media, My Templates and Themes, and AI compositions; the choice survives a reload', async ({
  page,
}) => {
  await page.locator('#cloud-sync').click();
  const panel = page.locator('.cloud-dialog');
  await expect(panel.locator('[data-role="cloud-master"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  for (const group of ['project', 'media', 'templates', 'ai'])
    await expect(
      panel.locator(`[data-role="cloud-group-${group}"]`),
    ).toContainText(/\d+ items · /);
  await expect(panel.locator('[data-role="cloud-status"]')).toContainText(
    'Off',
  );
  await panel.locator('[data-role="cloud-group-media"]').click();
  await panel.locator('[data-role="cloud-master"]').click();
  await expect(panel.locator('[data-role="cloud-master"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // No account yet: the panel says the choice waits.
  await expect(panel.locator('[data-role="cloud-status"]')).toContainText(
    'No cloud account',
  );
  await expect(page.locator('#cloud-sync')).toHaveAttribute(
    'data-state',
    'waiting',
  );
  await page.keyboard.press('Escape');
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await page.locator('#cloud-sync').click();
  await expect(
    page.locator('.cloud-dialog [data-role="cloud-master"]'),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.locator('.cloud-dialog [data-role="cloud-group-media"]'),
  ).toHaveAttribute('aria-checked', 'false');
});

test('[FX10-009] the browser Back button asks "Save to your cloud?" first; Stay keeps the editor open', async ({
  page,
}) => {
  await page.goBack().catch(() => undefined);
  const dialog = page.locator('.modal-dialog', {
    hasText: 'Save to your cloud?',
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('No cloud account is connected yet');
  await dialog.locator('[data-role="cloud-exit-stay"]').click();
  await expect(dialog).toHaveCount(0);
  // Still in the editor, and Back asks again.
  expect(page.url()).toContain('127.0.0.1');
  await expect(page.locator('#cloud-sync')).toBeVisible();
  await page.goBack().catch(() => undefined);
  await expect(dialog).toBeVisible();
});

test('[FX10-009] Save to cloud in the exit dialog sends once and leaves; Leave without saving leaves and sends nothing', async ({
  page,
}) => {
  await page.goBack().catch(() => undefined);
  const dialog = page.locator('.modal-dialog', {
    hasText: 'Save to your cloud?',
  });
  await dialog.locator('[data-role="cloud-exit-save"]').click();
  await expect.poll(() => page.url()).toBe('about:blank');
  await page.goto('/');
  const stub = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('aive.cloudStub') ?? '{}'),
  );
  const projects = Object.values(stub) as Record<string, unknown>[];
  expect(projects.length).toBe(1);
  expect(Object.keys(projects[0]!).sort()).toEqual([
    'ai',
    'media',
    'project',
    'templates',
  ]);
  // The switch itself stayed off: Save from this dialog is a single send.
  expect(
    await page.evaluate(() => localStorage.getItem('aive.cloudSync')),
  ).toBeNull();

  await page.evaluate(() => localStorage.removeItem('aive.cloudStub'));
  const second = await page.context().newPage();
  await second.setViewportSize({ width: 1600, height: 900 });
  await second.goto('/');
  await expect
    .poll(async () => second.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await second.goBack().catch(() => undefined);
  await second.locator('.modal-dialog [data-role="cloud-exit-leave"]').click();
  await expect.poll(() => second.url()).toBe('about:blank');
  await second.goto('/');
  expect(
    await second.evaluate(() => localStorage.getItem('aive.cloudStub')),
  ).toBeNull();
});

test('[FX10-011] loaders keep turning when the system asks for reduced motion, so a build or import never looks frozen', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const turning = await page.evaluate(() => {
    const spinner = document.createElement('span');
    spinner.className = 'plan-spinner';
    document.body.append(spinner);
    const style = getComputedStyle(spinner);
    const result = {
      duration: style.animationDuration,
      count: style.animationIterationCount,
      name: style.animationName,
    };
    spinner.remove();
    return result;
  });
  expect(turning.name).toBe('plan-spin');
  expect(turning.count).toBe('infinite');
  expect(parseFloat(turning.duration)).toBeGreaterThan(1);
});
