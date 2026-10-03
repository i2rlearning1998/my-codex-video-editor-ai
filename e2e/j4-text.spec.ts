import type { Page } from '@playwright/test';
import { test, expect, hook, toScreen } from './fixtures';

// J4: on-canvas text editing with a caret and selection, range styles,
// lists, IME input, copy and paste, and undo inside the session.
// Example text layers: headline 76,165 730x230 ("Make every frame count"
// style), subtitle 76,570 680x70.
const editor = (page: Page) => page.locator('.text-editor');
const labels = async (page: Page) => (await hook(page)).history.labels;
const layer = async (page: Page, id: string): Promise<any> => {
  const state = await hook(page);
  const find = (layers: any[]): any =>
    layers.find((item) => item.id === id) ??
    layers.map((item) => find(item.children)).find(Boolean);
  return find(
    state.project.compositions.find(
      (item) => item.id === state.session.compositionId,
    )!.layers as any[],
  );
};
const textOf = async (page: Page, id: string) =>
  (await layer(page, id)).properties.text.value as string;
const runsOf = async (page: Page, id: string) => {
  const value = (await layer(page, id)).properties.textRuns?.value;
  return value ? JSON.parse(value) : [];
};
const selectionText = (page: Page) =>
  page.evaluate(() => document.getSelection()?.toString() ?? '');
/** Double-clicks a text layer on the canvas at a composition point. */
async function editAt(page: Page, x: number, y: number) {
  const at = await toScreen(page, x, y);
  await page.mouse.dblclick(at.x, at.y);
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).toBeFocused();
}
/** Selects the editor's text from one character offset to another. */
async function selectRange(page: Page, from: number, to: number) {
  await editor(page).evaluate(
    (box, [from, to]) => {
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      let remaining = [from, to];
      const points: [Node, number][] = [];
      let total = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent!.length;
        for (const target of remaining)
          if (target >= total && target <= total + length && points.length < 2)
            points.push([node, target - total]);
        remaining = remaining.filter(
          (target) => !(target >= total && target <= total + length),
        );
        total += length;
      }
      // The editor reads the selection on selectionchange, which the browser
      // fires asynchronously; wait for it (its listener was added first, so
      // it has run by then) so the next toolbar action sees this selection.
      const selection = document.getSelection()!;
      const same =
        selection.anchorNode === points[0]![0] &&
        selection.anchorOffset === points[0]![1] &&
        selection.focusNode === points[1]![0] &&
        selection.focusOffset === points[1]![1];
      const seen = same
        ? Promise.resolve()
        : new Promise<void>((resolve) =>
            document.addEventListener('selectionchange', () => resolve(), {
              once: true,
            }),
          );
      selection.setBaseAndExtent(
        points[0]![0],
        points[0]![1],
        points[1]![0],
        points[1]![1],
      );
      return seen;
    },
    [from, to] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TXT-003] double-click edits a text layer on the canvas with a caret; typing, word and line selection, Escape commits one undo step', async ({
  page,
}) => {
  const id = 'example-subtitle';
  const before = await textOf(page, id);
  await editAt(page, 200, 600);
  // The canvas leaves the edited text to the editor.
  expect((await hook(page)).session.selectedIds).toEqual([id]);
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Edited');
  // Nothing is committed while typing.
  expect(await textOf(page, id)).toBe(before);
  // A double-click selects a word; a triple-click the whole line.
  const box = (await editor(page).boundingBox())!;
  await page.mouse.dblclick(box.x + 30, box.y + box.height / 2);
  const word = await selectionText(page);
  expect(word.trim().length).toBeGreaterThan(1);
  expect(word.trim()).not.toContain(' ');
  await page.mouse.click(box.x + 30, box.y + box.height / 2, {
    clickCount: 3,
  });
  expect((await selectionText(page)).trim()).toBe(`${before} Edited`.trim());
  const steps = (await labels(page)).length;
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  expect(await textOf(page, id)).toBe(`${before} Edited`);
  expect(await labels(page)).toHaveLength(steps + 1);
  expect((await labels(page)).at(-1)).toBe('Edit text');
  // One undo restores the old text.
  await page.keyboard.press('Control+z');
  expect(await textOf(page, id)).toBe(before);
  // Enter on a selected text layer edits it with all of it selected.
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Enter');
  await expect(editor(page)).toBeFocused();
  expect(await selectionText(page)).toBe(before);
  await page.keyboard.type('Replaced');
  // A click elsewhere on the canvas commits too.
  const away = await toScreen(page, 1200, 40);
  await page.mouse.click(away.x, away.y);
  await expect(editor(page)).toBeHidden();
  expect(await textOf(page, id)).toBe('Replaced');
});

test('[TXT-023] bold, italic, colour and size apply to the selected characters only; the toolbar mirrors the selection; undo inside the session', async ({
  page,
}) => {
  const id = 'example-subtitle';
  const text = await textOf(page, id);
  const first = text.indexOf(' ');
  await editAt(page, 200, 600);
  await selectRange(page, 0, first);
  const bold = page.locator('#context-toolbar [data-control="bold"]');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  // Undo inside the session takes the bold away, redo brings it back; the
  // project history is untouched until the edit is committed.
  const steps = (await labels(page)).length;
  await editor(page).focus();
  await page.keyboard.press('Control+z');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+Shift+z');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  expect(await labels(page)).toHaveLength(steps);
  // Italic with the keyboard, then a colour, on the second word.
  const second = text.indexOf(' ', first + 1);
  await selectRange(page, first + 1, second > 0 ? second : text.length);
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+i');
  await expect(
    page.locator('#context-toolbar [data-control="italic"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#toolbar-color').click();
  await page.locator('#color-picker-hex').fill('#cc2200');
  await page.locator('#color-picker-hex').press('Enter');
  await page.keyboard.press('Escape');
  // A size for the first word. The toolbar re-renders on the next frame to
  // mirror the new selection (bold again); wait for that, or the typing below
  // can land in a field that the render then replaces.
  await selectRange(page, 0, first);
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  const size = page.locator('#toolbar-size');
  await size.fill('60');
  await size.press('Enter');
  await editor(page).focus();
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  expect(await textOf(page, id)).toBe(text);
  const runs = await runsOf(page, id);
  expect(runs).toEqual([
    { start: 0, end: first, weight: 700, size: 60 },
    {
      start: first + 1,
      end: second > 0 ? second : text.length,
      italic: true,
      color: '#cc2200',
    },
  ]);
  expect((await labels(page)).at(-1)).toBe('Edit text');
  // Not editing, the buttons show the whole box: mixed weight is not bold.
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  // Bold on the whole box clears the runs' weight.
  await bold.click();
  expect((await layer(page, id)).properties.fontWeight.value).toBe(700);
  expect((await runsOf(page, id))[0]).toEqual({
    start: 0,
    end: first,
    size: 60,
  });
});

test('[TXT-024] bulleted and numbered lists from the toolbar, drawn on the canvas and in the editor', async ({
  page,
}) => {
  const id = 'example-subtitle';
  const at = await toScreen(page, 200, 600);
  await page.mouse.click(at.x, at.y);
  const sample = () => page.locator('#composition-canvas').screenshot();
  const before = await sample();
  await page.locator('#context-toolbar [data-control="list"]').click();
  await page
    .locator('.toolbar-options [role="option"]', { hasText: 'Bulleted list' })
    .click();
  expect((await layer(page, id)).properties.listStyle.value).toBe('bullet');
  expect((await labels(page)).at(-1)).toBe('Set list');
  expect(Buffer.compare(before, await sample())).not.toBe(0);
  await page.locator('#context-toolbar [data-control="list"]').click();
  await page
    .locator('.toolbar-options [role="option"]', { hasText: 'Numbered list' })
    .click();
  expect((await layer(page, id)).properties.listStyle.value).toBe('number');
  // The editor shows the same markers.
  await editAt(page, 200, 600);
  await expect(editor(page)).toHaveAttribute('data-list', 'number');
  const marker = await editor(page)
    .locator('div')
    .first()
    .evaluate((div) => getComputedStyle(div, '::before').content);
  expect(marker).toContain('counter');
  await page.keyboard.press('Escape');
});

test('[TXT-004] an input method (IME) composes Hindi (Devanagari) text in the editor', async ({
  page,
}) => {
  const id = 'example-subtitle';
  await editAt(page, 200, 600);
  await page.keyboard.press('Control+End');
  const client = await page.context().newCDPSession(page);
  // Composition events as a phonetic Hindi keyboard sends them.
  for (const step of ['न', 'नम', 'नमस्', 'नमस्ते'])
    await client.send('Input.imeSetComposition', {
      text: step,
      selectionStart: step.length,
      selectionEnd: step.length,
    });
  await client.send('Input.insertText', { text: 'नमस्ते' });
  await expect(editor(page)).toContainText('नमस्ते');
  await page.keyboard.press('Escape');
  expect(await textOf(page, id)).toContain('नमस्ते');
  expect(await textOf(page, id)).not.toContain('ननम');
});

test('[TXT-003] copy and paste inside the editor, plain and rich', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const id = 'example-subtitle';
  const text = await textOf(page, id);
  const first = text.indexOf(' ');
  await editAt(page, 200, 600);
  // Make the first word bold, copy it, paste it at the end: still bold.
  await selectRange(page, 0, first);
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+v');
  await expect(editor(page)).toContainText(text + text.slice(0, first));
  // Plain text pasted from elsewhere takes the caret's style.
  await editor(page).evaluate((box) => {
    const data = new DataTransfer();
    data.setData('text/plain', ' plain');
    box.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.keyboard.press('Escape');
  const result = await textOf(page, id);
  expect(result).toBe(`${text}${text.slice(0, first)} plain`);
  const runs = await runsOf(page, id);
  expect(runs[0]).toEqual({ start: 0, end: first, weight: 700 });
  // The pasted copy is bold too (rich paste); " plain" follows the caret.
  expect(runs[1]).toMatchObject({ start: text.length, weight: 700 });
});

test('[TXT-002] the Text tool adds a text box at the click and opens it for typing', async ({
  page,
}) => {
  await page.locator('#rail-left [data-category="Draw"]').click();
  await page.locator('[data-palette-tool="text"]').click();
  const at = await toScreen(page, 900, 120);
  await page.mouse.click(at.x, at.y);
  await expect(editor(page)).toBeFocused();
  const id = (await hook(page)).session.selectedIds[0]!;
  await page.keyboard.type('Hello class');
  await page.keyboard.press('Escape');
  expect(await textOf(page, id)).toBe('Hello class');
});
