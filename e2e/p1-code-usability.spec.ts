import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  menuAction,
  openRight,
  seekKeep,
  showCategory,
} from './fixtures';

// P1 (CREATOR-PACK-SPEC 5.2): a code layer's own menus, a poster and a
// "Rendering n %" before its first frames, and live settings while a
// control is dragged.
const PULSE = readFileSync('tests/fixtures/code/pulse-block.js', 'utf8');
const SLOW = readFileSync('tests/fixtures/code/slow-free.js', 'utf8');
const dialog = (page: Page) => page.locator('.code-import-dialog');
const panel = (page: Page) => page.locator('#right-section');
interface CodeDebug {
  state: string;
  stored: number;
  total: number;
}
const codeDebug = async (page: Page) =>
  (
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __AIVE__: { getMedia(): { code: CodeDebug[] } };
          }
        ).__AIVE__.getMedia().code,
    )
  )[0]!;
const baked = (page: Page) =>
  expect
    .poll(async () => (await codeDebug(page)).state, { timeout: 30_000 })
    .toBe('done');

/** A blank 720p project (1280 x 720), so only the code layer draws. */
async function newProject(page: Page) {
  await menuAction(page, '#new-project');
  const form = page.getByRole('dialog', { name: 'New project' });
  await form.getByLabel('Resolution', { exact: true }).selectOption('720p');
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect
    .poll(async () => (await hook(page)).project.compositions[0]!.layers.length)
    .toBe(0);
}
async function addCode(page: Page, source: string) {
  await showCategory(page, 'Media');
  await showCategory(page, 'AI');
  await page.locator('#ai-import').click();
  await dialog(page).locator('#ai-import-source').fill(source);
  await expect(dialog(page).locator('#code-thumb')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await dialog(page).locator('#ai-import-add').click();
  await expect(dialog(page)).toBeHidden();
}
/** The canvas pixel at a composition point (through the live view). */
async function pixelAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ x, y }) => {
      const [a, b, c, d, e, f] = (
        window as unknown as {
          __AIVE__: { getCanvas(): { view: number[] } };
        }
      ).__AIVE__.getCanvas().view as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const canvas = document.querySelector<HTMLCanvasElement>(
        '#composition-canvas',
      )!;
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      const data = canvas
        .getContext('2d')!
        .getImageData(
          Math.round((a * x + c * y + e) * ratio),
          Math.round((b * x + d * y + f) * ratio),
          1,
          1,
        ).data;
      return [data[0]!, data[1]!, data[2]!];
    },
    { x, y },
  );
}
const PINK = [255, 51, 102];
const isPink = (rgb: number[]) =>
  rgb.every((value, index) => Math.abs(value - PINK[index]!) <= 3);
const BLUE = [51, 102, 255];
const isBlue = (rgb: number[]) =>
  rgb.every((value, index) => Math.abs(value - BLUE[index]!) <= 3);

test.describe('P1 code layer usability', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as { __AIVE_E2E_FREECODE__?: string }).__AIVE_E2E_FREECODE__ =
        'fake';
    });
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
    await newProject(page);
  });

  test('[CP-001] a code layer has its own menus: Edit code, Animation settings, Save as template and Re-render; no picture or sound items', async ({
    page,
  }) => {
    await addCode(page, PULSE);
    await baked(page);
    const layerId = (await hook(page)).session.selectedIds[0]!;
    // Canvas menu.
    const canvasMenu = page.locator('#canvas-context-menu');
    const box = (await page.locator('#composition-canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
      button: 'right',
    });
    await expect(canvasMenu).toBeVisible();
    const actions = await canvasMenu
      .locator(':scope > [data-action]')
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset.action),
      );
    expect(actions.slice(0, 4)).toEqual([
      'code-edit',
      'code-settings',
      'code-save-template',
      'code-rerender',
    ]);
    expect(actions).not.toContain('set-background');
    expect(actions).not.toContain('detach-audio');
    // Animation settings opens the right panel's settings.
    await canvasMenu.locator('[data-action="code-settings"]').click();
    await expect(panel(page).locator('.code-tier')).toHaveText(
      'Tier B · Block',
    );
    // Timeline clip menu.
    const timelineMenu = page.locator('#timeline-foundation .timeline-menu');
    const clip = page.locator(
      `#timeline-foundation .timeline-clip[data-id="${layerId}"]`,
    );
    await clip.click({ button: 'right', position: { x: 20, y: 10 } });
    await expect(timelineMenu).toBeVisible();
    const commands = await timelineMenu
      .locator(':scope > [data-command]')
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset.command),
      );
    expect(commands).toEqual(
      expect.arrayContaining([
        'code-edit',
        'code-settings',
        'code-save-template',
        'code-rerender',
      ]),
    );
    await expect(
      timelineMenu.locator(
        '[data-action="audio-menu"], [data-action="auto-cut"]',
      ),
    ).toHaveCount(0);
    // R2: Save as template keeps it in the AI category (not an undo step).
    const steps = (await hook(page)).history.labels.length;
    await timelineMenu.locator('[data-command="code-save-template"]').click();
    await expect(
      page.locator('.toast', { hasText: 'AI › Motion' }),
    ).toBeVisible();
    expect((await hook(page)).history.labels.length).toBe(steps);
    await showCategory(page, 'AI');
    await expect(
      page.locator('#library-ai .ai-group[data-kind="motion"] .ai-card'),
    ).toHaveCount(1);
    // Re-render bakes again from frame 0.
    await clip.click({ button: 'right', position: { x: 20, y: 10 } });
    await timelineMenu.locator('[data-command="code-rerender"]').click();
    await expect
      .poll(async () => (await codeDebug(page)).state)
      .not.toBe('done');
    await baked(page);
    // Edit code opens the dialog with the layer's code.
    await clip.click({ button: 'right', position: { x: 20, y: 10 } });
    await timelineMenu.locator('[data-command="code-edit"]').click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('#code-source')).toHaveValue(PULSE);
  });

  test('[CP-002] a code layer is never blank: its thumbnail frame and "Rendering n %" before its frames, and it plays from the first baked frames', async ({
    page,
  }) => {
    // About 40 ms a frame (more under load), 90 frames: three bakes here.
    test.setTimeout(120_000);
    await addCode(page, SLOW);
    const status = page.locator('#code-render-status');
    await expect(status).toHaveText(/^Rendering \d+ %$/);
    const layerId = (await hook(page)).session.selectedIds[0]!;
    const poster = page.locator(
      `.timeline-clip[data-id="${layerId}"] .clip-code-poster`,
    );
    await expect(poster).toBeVisible();
    expect((await codeDebug(page)).state).not.toBe('done');
    await baked(page);
    await expect(status).toBeHidden();
    // At 2 s the bar covers two thirds of the width.
    await seekKeep(page, 2);
    await expect
      .poll(async () => isBlue(await pixelAt(page, 40, 360)))
      .toBe(true);
    // Re-render drops every frame: until the bake reaches 2 s again the
    // canvas shows the thumbnail frame (the bar at 1.5 s), never nothing.
    const clip = page.locator(`.timeline-clip[data-id="${layerId}"]`);
    await clip.click({ button: 'right', position: { x: 20, y: 10 } });
    await page
      .locator(
        '#timeline-foundation .timeline-menu [data-command="code-rerender"]',
      )
      .click();
    await expect(status).toBeVisible();
    const samples: boolean[] = [];
    while ((await codeDebug(page)).stored < 40) {
      samples.push(isBlue(await pixelAt(page, 40, 360)));
      if ((await codeDebug(page)).state === 'done') break;
    }
    expect(samples.length).toBeGreaterThan(3);
    expect(samples.every(Boolean)).toBe(true);
    // Playback starts from the cache while the rest bakes.
    await clip.click({ button: 'right', position: { x: 20, y: 10 } });
    await page
      .locator(
        '#timeline-foundation .timeline-menu [data-command="code-rerender"]',
      )
      .click();
    await expect
      .poll(async () => (await codeDebug(page)).stored)
      .toBeGreaterThan(0);
    const from = (await hook(page)).session.time;
    await page.locator('[data-action="play"]').click();
    await expect
      .poll(async () => (await hook(page)).session.time)
      .toBeGreaterThan(from + 0.2);
    expect((await codeDebug(page)).state).not.toBe('done');
    await page.locator('[data-action="play"]').click();
    await baked(page);
  });

  test('[CP-003] dragging a control renders the current frame live at Draft; the release re-bakes in one undo step', async ({
    page,
  }) => {
    await addCode(page, PULSE);
    await baked(page);
    await openRight(page, 'Code');
    // At 0 s the pulse's radius is 60 px: 150 px right of the centre is
    // background.
    expect(isPink(await pixelAt(page, 790, 360))).toBe(false);
    const steps = (await hook(page)).history.labels.length;
    const before = (await hook(page)).project.compositions[0]!.layers[0]!.code!
      .bakeKey;
    const slider = panel(page).locator('#code-setting-radius-slider');
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, {
      steps: 6,
    });
    // Live: drawn before the release, nothing committed yet.
    await expect
      .poll(async () => isPink(await pixelAt(page, 790, 360)))
      .toBe(true);
    expect((await hook(page)).history.labels.length).toBe(steps);
    await page.mouse.up();
    // The release applies and re-bakes, one step.
    await expect
      .poll(async () => (await hook(page)).history.labels.length)
      .toBe(steps + 1);
    expect((await hook(page)).history.labels.at(-1)).toBe('Animation settings');
    const after = (await hook(page)).project.compositions[0]!.layers[0]!.code!;
    expect(after.bakeKey).not.toBe(before);
    expect(Number(after.params.radius)).toBeGreaterThan(380);
    await baked(page);
    expect(isPink(await pixelAt(page, 790, 360))).toBe(true);
    await page.keyboard.press('Control+z');
    await expect
      .poll(
        async () =>
          (await hook(page)).project.compositions[0]!.layers[0]!.code!.bakeKey,
      )
      .toBe(before);
  });
});
