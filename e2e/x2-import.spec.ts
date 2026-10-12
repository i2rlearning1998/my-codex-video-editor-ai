import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, openRight } from './fixtures';

// X2 (CODE-TIERS-SPEC section 2): one import for code animations.
const read = (path: string) => readFileSync(path, 'utf8');
const PULSE = read('tests/fixtures/code/pulse-block.js');
const ORBIT = read('tests/fixtures/code/orbit-free.js');
const dialog = (page: Page) => page.locator('.code-import-dialog');

async function openImport(page: Page) {
  await showCategory(page, 'Media');
  await page.locator('#import-menu').click();
  await page.locator('#import-code').click();
  await expect(dialog(page)).toBeVisible();
}
async function paste(page: Page, text: string) {
  await dialog(page).locator('#code-source').fill(text);
}

test.describe('X2 import code animation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as { __AIVE_E2E_FREECODE__?: string }).__AIVE_E2E_FREECODE__ =
        'fake';
    });
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
  });

  test('[CODE-004][CODE-005] a pasted block is Tier B with a thumbnail, params and duration; Add puts it on the timeline in one undo step', async ({
    page,
  }) => {
    await openImport(page);
    await paste(page, PULSE);
    await expect(dialog(page).locator('#code-tier')).toHaveText(
      'Tier B · Block',
    );
    await expect(dialog(page).locator('#code-duration')).toHaveText('2 s');
    await expect(dialog(page).locator('#code-thumb')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await expect(dialog(page).locator('#code-notice')).toBeHidden();
    await expect(
      dialog(page).locator('.code-param[data-param="color"]'),
    ).toBeVisible();
    await expect(dialog(page).locator('#code-param-radius')).toHaveValue('120');
    await expect(dialog(page).locator('#code-save-template')).toBeChecked();
    const before = (await hook(page)).history.labels.length;
    await dialog(page).locator('#code-add').click();
    await expect(dialog(page)).toBeHidden();
    const state = await hook(page);
    const layer = state.project.compositions[0]!.layers.find((l) => l.code)!;
    expect(layer.code!.tier).toBe('B');
    expect(layer.code!.params).toEqual({ color: '#ff3366', radius: 120 });
    expect(state.history.labels.length).toBe(before + 1);
    expect(state.history.labels.at(-1)).toBe('Add code animation');
    await expect(page.locator('.timeline-clip[data-code="true"]')).toHaveCount(
      1,
    );
    await page.keyboard.press('Control+z');
    await expect(page.locator('.timeline-clip[data-code="true"]')).toHaveCount(
      0,
    );
  });

  test('[CODE-004] errors name the line, what is wrong and how to fix it; nothing is added', async ({
    page,
  }) => {
    await openImport(page);
    await paste(page, '{\n  "version": 1,\n  "id": oops\n}');
    const issue = dialog(page).locator('#code-errors li').first();
    await expect(issue).toHaveText(/^Line 3: The JSON is not valid.* Fix: /);
    await expect(dialog(page).locator('#code-add')).toBeDisabled();
    await paste(page, 'export default { meta: { id: "x", duration: 900 } }');
    await expect(dialog(page).locator('#code-errors li').first()).toHaveText(
      /Line 1: .*Fix: /,
    );
    await expect(dialog(page).locator('#code-add')).toBeDisabled();
    await dialog(page).locator('#code-cancel').click();
    expect(
      (await hook(page)).project.compositions[0]!.layers.filter((l) => l.code),
    ).toHaveLength(0);
  });

  test('[CODE-004][CODE-005] free code is Tier C (full mode notice); a dropped .js file opens the dialog', async ({
    page,
  }) => {
    // An OS file drop (HTML5 drag events, as the browser sends them).
    await page.evaluate((text) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([text], 'orbit.js', { type: 'text/javascript' }),
      );
      const target = document.querySelector('#composition-canvas')!;
      for (const type of ['dragenter', 'dragover', 'drop'])
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
    }, ORBIT);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('#code-file-name')).toHaveText(
      'orbit.js',
    );
    await expect(dialog(page).locator('#code-tier')).toHaveText(
      'Tier C · Full mode',
    );
    await expect(dialog(page).locator('#code-notice')).toHaveText(
      /Full mode: runs in a sandbox and is rendered to frames/,
    );
    await expect(dialog(page).locator('#code-thumb')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await expect(page.locator('#drop-overlay')).toBeHidden();
    await dialog(page).locator('#code-add').click();
    await expect(page.locator('.timeline-clip[data-code="true"]')).toHaveCount(
      1,
    );
    const layer = (await hook(page)).project.compositions[0]!.layers.find(
      (l) => l.code,
    )!;
    expect(layer.code!.tier).toBe('C');
  });

  test('[CODE-004] a Composition Spec is Tier A: new scenes or this scene, one undo step, code blocks become code layers', async ({
    page,
  }) => {
    await openImport(page);
    await paste(page, read('tests/ai-spec/fixtures/lower-third.spec.json'));
    await expect(dialog(page).locator('#code-tier')).toHaveText(
      'Tier A · Native layers',
    );
    await expect(dialog(page).locator('#code-scene-mode')).toBeVisible();
    await expect(dialog(page).locator('#code-thumb')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await dialog(page).locator('#code-add').click();
    await expect(dialog(page)).toBeHidden();
    let state = await hook(page);
    expect(state.project.compositions).toHaveLength(2);
    expect(state.session.compositionId).toBe(state.project.compositions[1]!.id);
    expect(state.project.compositions[1]!.layers).toHaveLength(4);
    expect(state.history.labels.at(-1)).toBe('Import code animation');
    // Into this scene: the quote's blocks become Tier B code layers.
    await openImport(page);
    await paste(page, read('tests/ai-spec/fixtures/kinetic-quote.spec.json'));
    await expect(dialog(page).locator('#code-tier')).toHaveText(
      'Tier A · Native layers',
    );
    await dialog(page).getByLabel('Into this scene').check();
    await dialog(page).locator('#code-add').click();
    await expect(dialog(page)).toBeHidden();
    state = await hook(page);
    const scene = state.project.compositions.find(
      (c) => c.id === state.session.compositionId,
    )!;
    expect(scene.layers.filter((l) => l.code?.tier === 'B')).toHaveLength(2);
    await page.keyboard.press('Control+z');
    state = await hook(page);
    expect(
      state.project.compositions
        .find((c) => c.id === state.session.compositionId)!
        .layers.filter((l) => l.code),
    ).toHaveLength(0);
  });

  test('[CODE-005] the Code button of a code layer opens Edit code; Apply changes its params in one step', async ({
    page,
  }) => {
    await openImport(page);
    await paste(page, PULSE);
    await expect(dialog(page).locator('#code-add')).toBeEnabled();
    await dialog(page).locator('#code-add').click();
    await expect(dialog(page)).toBeHidden();
    const before = (await hook(page)).project.compositions[0]!.layers.find(
      (l) => l.code,
    )!.code!;
    await openRight(page, 'Code');
    await page.locator('#code-edit').click();
    await expect(dialog(page).locator('h2')).toHaveText('Edit code');
    await expect(dialog(page).locator('#code-tier')).toHaveText(
      'Tier B · Block',
    );
    const radius = dialog(page).locator('#code-param-radius');
    await radius.fill('200');
    await radius.press('Enter');
    await dialog(page).locator('#code-add').click();
    await expect(dialog(page)).toBeHidden();
    const state = await hook(page);
    const after = state.project.compositions[0]!.layers.find(
      (l) => l.code,
    )!.code!;
    expect(after.params).toEqual({ color: '#ff3366', radius: 200 });
    expect(after.bakeKey).not.toBe(before.bakeKey);
    expect(state.history.labels.at(-1)).toBe('Edit code');
  });
});
