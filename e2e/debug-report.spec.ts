import { test, expect, allowError, hook } from './fixtures';
import { writeFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  allowError(
    page,
    (message) => message.includes('404') && message.endsWith('/favicon.ico'),
    'REL-001 favicon 404 is recorded separately and remains unfixed in Wave 0.',
  );
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[DEV-007] button copies a parseable debug report and shortcut also works', async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page
    .getByRole('button', { name: 'Copy debug report', exact: true })
    .click();
  await expect(page.locator('#status')).toHaveText('Debug report copied.');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await writeFile(testInfo.outputPath('copied-debug-report.txt'), text, 'utf8');
  const report = JSON.parse(text);
  expect(report.schema).toBe('aive-debug-report/1');
  expect(report.project).toEqual((await hook(page)).project);
  expect(report.editor).toEqual((await hook(page)).session);
  expect(report.env.viewport).toEqual({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath('debug-report.png') });
  await page.keyboard.press('Control+Shift+d');
  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .not.toBe(text);
});

test('[DEV-007] clipboard rejection downloads the same JSON report', async ({
  page,
}) => {
  // Exercise an unavailable browser permission; no editor state is changed by this test setup.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () =>
          Promise.reject(new Error('Clipboard unavailable in test')),
      },
      configurable: true,
    });
  });
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Copy debug report', exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('aive-debug-report.json');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(report.schema).toBe('aive-debug-report/1');
  expect(report.project).toEqual((await hook(page)).project);
});
