import { menuAction, test, expect, hook } from './fixtures';
test('[PRJ-001][PRJ-002][PRJ-003][PRJ-004][PRJ-005][PRJ-006] validate custom size and create a portrait project with a solid background', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.locator('[data-layer-id="example-headline"]').first().click();
  await page
    .getByRole('spinbutton', { name: 'Position X', exact: true })
    .fill('321');
  await page
    .getByRole('spinbutton', { name: 'Position X', exact: true })
    .press('Enter');
  expect((await hook(page)).history.canUndo).toBe(true);
  await menuAction(page, '#new-project');
  await page
    .locator('#new-project-form')
    .getByLabel('Name', { exact: true })
    .fill('Portrait lesson');
  await expect(page.locator('#new-project-aspect option')).toHaveText([
    '16:9',
    '9:16',
    '1:1',
    '4:5',
    '2:3',
    '21:9',
    '4:3',
    'Custom',
  ]);
  await expect(page.locator('#new-project-resolution option')).toHaveText([
    '720p',
    '1080p',
    '1440p',
    '4K',
  ]);
  await expect(page.locator('#new-project-fps option')).toHaveText([
    '24',
    '25',
    '30',
    '50',
    '60',
  ]);
  await page.getByLabel('Aspect ratio', { exact: true }).selectOption('custom');
  await page.getByLabel('Width', { exact: true }).fill('17');
  await page.getByLabel('Height', { exact: true }).fill('8000');
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(page.locator('#new-project-width-error')).toHaveText(
    'Use an even integer from 16 to 7680.',
  );
  await expect(page.locator('#new-project-height-error')).toHaveText(
    'Use an even integer from 16 to 7680.',
  );
  await page.getByLabel('Aspect ratio', { exact: true }).selectOption('9:16');
  await page.getByLabel('Resolution', { exact: true }).selectOption('1080p');
  await page.getByLabel('Frame rate', { exact: true }).selectOption('30');
  await page.getByLabel('Background color', { exact: true }).fill('#abcdef');
  await page.screenshot({ path: testInfo.outputPath('new-project-form.png') });
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  const beforeConfirm = await hook(page);
  const confirmation = page.locator('.modal-dialog');
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeHidden();
  await expect(page.locator('#new-project-name')).toHaveValue(
    'Portrait lesson',
  );
  expect((await hook(page)).project).toEqual(beforeConfirm.project);
  expect((await hook(page)).history).toEqual(beforeConfirm.history);
  await page.locator('#new-project-form button[type="submit"]').click();
  await confirmation.locator('[data-role="cancel"]').click();
  await expect(page.locator('#new-project-name')).toHaveValue(
    'Portrait lesson',
  );
  expect((await hook(page)).project).toEqual(beforeConfirm.project);
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.screenshot({
    path: testInfo.outputPath('new-project-confirm.png'),
  });
  await confirmation.locator('[data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
  const snapshot = await hook(page);
  expect(snapshot.project.metadata.name).toBe('Portrait lesson');
  expect(snapshot.project.compositions[0]).toMatchObject({
    width: 1080,
    height: 1920,
    fps: 30,
    layers: [],
    tracks: [],
  });
  expect(snapshot.project.settings.backgroundColor).toBe('#abcdef');
  expect(snapshot.project.schemaVersion).toBe(5);
  expect(snapshot.history).toEqual({
    canUndo: false,
    canRedo: false,
    labels: [],
  });
  expect(snapshot.session).toMatchObject({
    time: 0,
    playing: false,
    selectedIds: [],
  });
  await menuAction(page, '#save');
  await page.reload();
  expect((await hook(page)).project).toEqual(snapshot.project);
  await page.screenshot({ path: testInfo.outputPath('new-project.png') });
});
