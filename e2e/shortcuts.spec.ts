import { test, expect, allowError, hook, toScreen } from './fixtures';
import type { Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  allowError(
    page,
    (message) => message.includes('404') && message.endsWith('/favicon.ico'),
    'Known REL-001 favicon bug remains outside this brief.',
  );
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});
async function selectAndDrag(page: Page, release = true) {
  const ruler = (await page.locator('.timeline-ruler').boundingBox())!;
  await page.mouse.click(ruler.x + 120, ruler.y + 8);
  const point = await toScreen(page, 300, 250);
  await page.mouse.click(point.x, point.y);
  const before = await hook(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 50, point.y + 25, { steps: 8 });
  if (release) await page.mouse.up();
  return before;
}
test('[KEY-003] regression: Undo and both Redo shortcuts work on canvas and after a top-bar click', async ({
  page,
}, testInfo) => {
  const before = await selectAndDrag(page);
  const moved = (await hook(page)).project;
  expect(moved).not.toEqual(before.project);
  await page.keyboard.press('Control+z');
  expect((await hook(page)).project).toEqual(before.project);
  await page.keyboard.press('Control+Shift+z');
  expect((await hook(page)).project).toEqual(moved);
  await page.locator('#save').click();
  await page.keyboard.press('Control+z');
  expect((await hook(page)).project).toEqual(before.project);
  await page.keyboard.press('Control+y');
  expect((await hook(page)).project).toEqual(moved);
  await page.screenshot({ path: testInfo.outputPath('global-undo.png') });
});
test('[KEY-005] Ctrl+S prevents the browser default and saves the current project', async ({
  page,
}) => {
  await page.evaluate(() => {
    let saveEvent: KeyboardEvent | undefined;
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.ctrlKey && event.key === 's') saveEvent = event;
      },
      true,
    );
    window.addEventListener(
      'keyup',
      () => {
        if (saveEvent)
          document.body.dataset.savePrevented = String(
            saveEvent.defaultPrevented,
          );
      },
      true,
    );
  });
  await page.locator('#save').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status')).toHaveText('Saved locally.');
  await expect(page.locator('body')).toHaveAttribute(
    'data-save-prevented',
    'true',
  );
  await page.reload();
  await expect(page.locator('#status')).toHaveText(
    'Project loaded from this browser.',
  );
});
test('[KEY-006] Space plays and pauses globally but never in a text input', async ({
  page,
}) => {
  await page.locator('#save').click();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await hook(page)).session.playing).toBe(true);
  await page.keyboard.press('Space');
  expect((await hook(page)).session.playing).toBe(false);
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Space');
  expect((await hook(page)).session.playing).toBe(false);
});
test('[KEY-007] typing in inputs, textarea and contenteditable never runs editor shortcuts', async ({
  page,
}) => {
  await page.locator('[data-layer-id="example-headline"]').first().click();
  const position = page.getByRole('spinbutton', {
    name: 'Position X',
    exact: true,
  });
  const original = await position.inputValue();
  await position.fill('321');
  await position.press('Escape');
  await expect(position).toHaveValue(original);
  expect((await hook(page)).history.canUndo).toBe(false);
  await page.locator('#save').click();
  await page.keyboard.press('Control+k');
  const before = await hook(page);
  await page.keyboard.type('s');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+d');
  expect((await hook(page)).project).toEqual(before.project);
  await page.keyboard.press('Escape');
  // Temporary editable DOM fixtures exercise the global typing guard without mutating the engine.
  await page.evaluate(() => {
    const textarea = document.createElement('textarea');
    textarea.id = 'typing-area';
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.id = 'typing-editable';
    editable.textContent = 'abc';
    document.body.append(textarea, editable);
  });
  for (const selector of ['#typing-area', '#typing-editable']) {
    await page.locator(selector).click();
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Delete');
    await page.keyboard.type('s ');
    expect((await hook(page)).project).toEqual(before.project);
    expect((await hook(page)).session.playing).toBe(false);
  }
});
test('[KEY-008] shortcut sheet lists Undo, Redo and Save from the registry', async ({
  page,
}, testInfo) => {
  await page.keyboard.press('Control+/');
  await expect(page.locator('#shortcut-sheet')).toBeVisible();
  for (const label of [
    'Undo: Ctrl+Z',
    'Redo: Ctrl+Shift+Z / Ctrl+Y',
    'Save locally: Ctrl+S',
  ])
    await expect(page.locator('#shortcut-sheet')).toContainText(label);
  await page.screenshot({ path: testInfo.outputPath('shortcuts.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#shortcut-sheet')).toBeHidden();
});
test('[KEY-009] Escape cancels a drag, then closes a palette, then deselects', async ({
  page,
}, testInfo) => {
  const before = await selectAndDrag(page, false);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await hook(page)).project).toEqual(before.project);
  expect((await hook(page)).history).toEqual(before.history);
  expect((await hook(page)).session.selectedIds).toEqual(
    before.session.selectedIds,
  );
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await expect(page.locator('#command-palette')).toBeHidden();
  expect((await hook(page)).session.selectedIds).toEqual(
    before.session.selectedIds,
  );
  await page.keyboard.press('Escape');
  expect((await hook(page)).session.selectedIds).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('escape.png') });
});
