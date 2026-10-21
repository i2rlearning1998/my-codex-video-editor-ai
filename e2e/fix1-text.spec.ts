import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, showCategory } from './fixtures';

// FIX1 F8: the on-canvas text editor is never a form field (no autofill or
// suggestions), its caret is visible, the font list draws each font in its
// own face, and a single-weight Google font is asked for without weights.
const FONT_BYTES = readFileSync(
  'public/fonts/noto-sans-devanagari/noto-sans-devanagari-devanagari-400-normal.woff2',
);

async function mockGoogleFonts(page: Page, requests: string[]) {
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('https://fonts.googleapis.com/css2**', (route) => {
    const url = route.request().url();
    requests.push(url);
    // Google refuses a weight list for a font that has one weight.
    if (/Pacifico(%3A|:)wght/.test(url))
      return route.fulfill({ status: 400, headers: cors, body: '' });
    const family =
      new URL(url).searchParams.get('family')?.split(':')[0] ?? 'X';
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'text/css' },
      body: `@font-face { font-family: '${family}'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/s/test/${encodeURIComponent(family)}.woff2) format('woff2'); }`,
    });
  });
  await page.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'font/woff2' },
      body: FONT_BYTES,
    }),
  );
}

test('[FX1-018] the text editor has no autofill and a visible 2 px caret', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'Text');
  await page.locator('#add-text-box').click();
  const editor = page.locator('.text-editor');
  await expect(editor).toBeVisible();
  for (const [name, value] of [
    ['autocomplete', 'off'],
    ['autocorrect', 'off'],
    ['autocapitalize', 'off'],
    ['writingsuggestions', 'false'],
    ['aria-autocomplete', 'none'],
  ] as const)
    await expect(editor).toHaveAttribute(name, value);
  await page.keyboard.insertText('Hello');
  const caret = page.locator('.text-caret');
  await expect(caret).toBeAttached();
  await expect
    .poll(() =>
      caret.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { hidden: (node as HTMLElement).hidden, width: box.width };
      }),
    )
    .toEqual({ hidden: false, width: 2 });
  await page.screenshot({ path: 'reports/fix1/f8-caret.png' });
  // The caret is the text colour, or black or white when that would vanish.
  const colours = await page.evaluate(() => {
    const box = document.querySelector<HTMLElement>('.text-editor')!;
    const mark = document.querySelector<HTMLElement>('.text-caret')!;
    return {
      caret: getComputedStyle(mark).backgroundColor,
      native: getComputedStyle(box).caretColor,
    };
  });
  expect(colours.caret).not.toBe('rgba(0, 0, 0, 0)');
  expect(colours.native).toBe('rgba(0, 0, 0, 0)');
  await page.keyboard.press('Escape');
  await expect(caret).toBeHidden();
});

test('[FX1-017] font rows use their own face and single-weight fonts load', async ({
  page,
}) => {
  const requests: string[] = [];
  await mockGoogleFonts(page, requests);
  await page.goto('/');
  await showCategory(page, 'Text');
  await page.locator('#add-text-box').click();
  await page.keyboard.insertText('Hello');
  await page.keyboard.press('Escape');
  await page.locator('#toolbar-font').click();
  const panel = page.locator('[data-tool-panel="font"]');
  await panel.locator('#font-search').fill('Pacifico');
  const row = panel.locator('[data-font="Pacifico"]');
  await expect(row).toBeVisible();
  expect(
    await row.evaluate((node) => (node as HTMLElement).style.fontFamily),
  ).toContain('Pacifico Preview');
  await row.click();
  await expect(panel.locator('.font-error')).toHaveCount(0);
  await page.screenshot({ path: 'reports/fix1/f8-fonts.png' });
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          new URL(url).searchParams.get('family') === 'Pacifico' &&
          !new URL(url).searchParams.has('text'),
      ),
    )
    .toBe(true);
  expect(requests.some((url) => /Pacifico(%3A|:)wght/.test(url))).toBe(false);
});
