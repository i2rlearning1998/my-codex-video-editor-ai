import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  artboard,
  mode2d,
  openInspector,
  openRight,
  openRightPanel,
  seekKeep,
  showCategory,
} from './fixtures';

// P3 (CREATOR-PACK-SPEC 5.1, 5.1b): Creator presets in Animate > Creator,
// the Controls that show only what a layer has, Edited manually and Add
// animation. Default example: shape "example-badge" at 76,456 (224×48);
// composition 1280×720.
const MOVE = readFileSync('examples/creator-packs/move-preset.json', 'utf8');
const MOVE_ID = 'move-pack--preset-move';
const FADE_ID = 'fade-pack--preset-fade';
/** An inline pack with one opacity preset (a second property to add). */
const FADE = JSON.stringify({
  format: 'creator-pack',
  version: 1,
  pack: {
    id: 'fade-pack',
    name: { en: 'Fade pack' },
    version: 1,
    author: 'ai',
    createdWith: 'codex',
  },
  items: [
    {
      id: 'preset-fade',
      name: { en: 'Fade to level' },
      tags: ['original'],
      type: 'preset',
      data: {
        appliesTo: ['any'],
        controls: [
          {
            name: 'level',
            label: { en: 'Level' },
            type: 'number',
            default: 0.5,
            min: 0,
            max: 1,
            step: 0.1,
          },
        ],
        tracks: [
          {
            property: 'opacity',
            keys: [
              { t: 0, v: 1 },
              { t: 1, v: '$level' },
            ],
          },
        ],
      },
    },
  ],
});
const dialog = (page: Page) => page.locator('.creator-pack-dialog');
const panel = (page: Page) => page.locator('#right-section');

async function importPack(page: Page, text: string) {
  await showCategory(page, 'Media');
  await page.locator('#import-menu').click();
  await page.locator('#import-creator').click();
  await dialog(page).locator('#creator-source').fill(text);
  await expect(dialog(page).locator('#creator-summary')).toHaveText(
    /passed the checks/,
    { timeout: 60_000 },
  );
  await dialog(page).locator('#creator-add').click();
  // Q4: the result card, then Done.
  await dialog(page).locator('#creator-done').click();
  await expect(dialog(page)).toBeHidden();
}
async function selectBadge(page: Page) {
  await showCategory(page, 'Scene');
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(['example-badge']);
  await openRightPanel(page);
}
interface Frame {
  time: number;
  value: unknown;
  easing?: unknown;
}
const badge = async (page: Page) => {
  const project = (await hook(page)).project as unknown as {
    compositions: {
      layers: {
        id: string;
        transform: Record<string, { keyframes: Frame[]; animated: boolean }>;
        properties: Record<string, { value: unknown }>;
      }[];
      tracks: { clips: { layerId: string; startTime: number }[] }[];
    }[];
  };
  const composition = project.compositions[0]!;
  const layer = composition.layers.find((item) => item.id === 'example-badge')!;
  const start = composition.tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.layerId === 'example-badge')!.startTime;
  return { layer, start };
};
const frames = async (page: Page, key = 'position') =>
  (await badge(page)).layer.transform[key]!.keyframes;
const groups = (page: Page) =>
  panel(page)
    .locator('.controls-group')
    .evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.group),
    );
async function applyMove(page: Page) {
  await importPack(page, MOVE);
  await selectBadge(page);
  await openRight(page, 'Animate');
  const tabs = await panel(page)
    .locator('.animate-tabs [role="tab"]')
    .evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.tab),
    );
  // In, Out and Loop are kept; Creator is added.
  expect(tabs).toEqual(
    expect.arrayContaining(['in', 'out', 'loop', 'creator']),
  );
  await panel(page).locator('.animate-tabs [data-tab="creator"]').click();
  const steps = (await hook(page)).history.labels.length;
  await panel(page).locator(`.animate-card[data-preset="${MOVE_ID}"]`).click();
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(steps + 1);
  expect((await hook(page)).history.labels.at(-1)).toBe('Apply preset');
}

test.describe('P3 presets and Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
  });

  test('[CP-009][CP-010] the Move preset writes ordinary keyframes in one step; Controls show only Move, and a control rewrites the keyframes', async ({
    page,
  }) => {
    await applyMove(page);
    const { start } = await badge(page);
    // Ordinary keyframes from the clip's start: x moves by 0.25 × 1280.
    expect(await frames(page)).toEqual([
      { time: start, value: [76, 456] },
      { time: start + 1, value: [396, 456] },
    ]);
    expect((await badge(page)).layer.transform.scale!.animated).toBe(false);
    const record = JSON.parse(
      String((await badge(page)).layer.properties.preset!.value),
    ) as { presets: { id: string; params: unknown }[] };
    expect(record.presets.map((item) => item.id)).toEqual([MOVE_ID]);
    // Controls (the rail's Code section) show only the Move heading.
    await openRight(page, 'Code');
    await expect(
      page.locator('#rail-right [data-section="Code"] .icon-rail-label'),
    ).toHaveText('Controls');
    expect(await groups(page)).toEqual(['move']);
    await expect(panel(page).locator('.controls-group-name')).toHaveText([
      'Move',
    ]);
    const move = panel(page).locator('.controls-group[data-group="move"]');
    await expect(move.locator('.code-param')).toHaveCount(2);
    await expect(
      move.locator('.code-param[data-param="distance"]'),
    ).toBeVisible();
    await expect(move.locator('.code-param[data-param="angle"]')).toBeVisible();
    // Duration, Delay and Smoothness are advanced, under More.
    await expect(panel(page).locator('.controls-more summary')).toHaveText(
      'More',
    );
    // A control rewrites the keyframes, one step.
    const steps = (await hook(page)).history.labels.length;
    const field = panel(page).locator(`#controls-${MOVE_ID}-move-distance`);
    await field.fill('0.5');
    await field.press('Enter');
    await expect
      .poll(async () => (await frames(page))[1]!.value)
      .toEqual([716, 456]);
    expect((await hook(page)).history.labels.length).toBe(steps + 1);
    expect((await hook(page)).history.labels.at(-1)).toBe('Animation controls');
    // Delay under More shifts the keyframes.
    await panel(page).locator('.controls-more summary').click();
    const delay = panel(page).locator(`#controls-${MOVE_ID}-more-delay`);
    await delay.fill('1');
    await delay.press('Enter');
    await expect
      .poll(async () => (await frames(page)).map((frame) => frame.time))
      .toEqual([start + 1, start + 2]);
    // Undo restores the distance change's keyframes.
    await page.locator('#undo').click();
    await expect
      .poll(async () => (await frames(page)).map((frame) => frame.time))
      .toEqual([start, start + 1]);
    expect((await frames(page))[1]!.value).toEqual([716, 456]);
  });

  test('[CP-011] keyframes edited by hand in 2D Animation turn the controls off ("Edited manually") until Reset to controls', async ({
    page,
  }) => {
    await applyMove(page);
    const { start } = await badge(page);
    await mode2d(page);
    // A canvas drag at 0.5 s adds a keyframe there by hand.
    await seekKeep(page, start + 0.5);
    const board = await artboard(page);
    const at = (x: number, y: number) => ({
      x: board.x + x * board.scale,
      y: board.y + y * board.scale,
    });
    const from = at(236 + 112, 480);
    const to = at(236 + 112 + 60, 480);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.keyboard.down('Control');
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect.poll(async () => (await frames(page)).length).toBe(3);
    await openRight(page, 'Code');
    const box = panel(page).locator(
      `.controls-preset[data-preset="${MOVE_ID}"]`,
    );
    await expect(box).toHaveAttribute('data-edited', 'true');
    await expect(box.locator('.controls-edited')).toContainText(
      'Edited manually',
    );
    // The controls are greyed out (not usable).
    const form = box.locator('.controls-group[data-group="move"] .code-params');
    await expect(form).toHaveClass(/is-disabled/);
    expect(await form.evaluate((item) => (item as HTMLElement).inert)).toBe(
      true,
    );
    // Reset to controls asks first, then rebuilds the preset's keyframes.
    await box.locator('[data-action="controls-reset"]').click();
    await page.locator('.modal-dialog [data-role="confirm"]').click();
    await expect.poll(async () => (await frames(page)).length).toBe(2);
    expect(await frames(page)).toEqual([
      { time: start, value: [76, 456] },
      { time: start + 1, value: [396, 456] },
    ]);
    expect((await hook(page)).history.labels.at(-1)).toBe('Reset to controls');
    await expect(
      panel(page).locator(`.controls-preset[data-preset="${MOVE_ID}"]`),
    ).not.toHaveAttribute('data-edited', 'true');
  });

  test('[CP-010][CP-012] hand-made keyframes get a simple view for the keyframed property only; Add animation adds one more property', async ({
    page,
  }) => {
    await importPack(page, FADE);
    await selectBadge(page);
    await mode2d(page);
    // Hand keyframes on Position: x 76 at 0 s and x 276 at 2 s.
    await seekKeep(page, 0);
    await openRight(page, 'Properties');
    await page
      .locator(
        '#animation-panel [data-property="position"] [data-action="stopwatch"]',
      )
      .click();
    await seekKeep(page, 2);
    await openInspector(page);
    const x = page.locator('#inspector-content input[aria-label="Position X"]');
    await x.fill('276');
    await x.press('Enter');
    await expect.poll(async () => (await frames(page)).length).toBe(2);
    // Controls: a simple Move view (From, To, Duration, Delay, Easing) only.
    await openRight(page, 'Code');
    expect(await groups(page)).toEqual(['move']);
    const simple = panel(page).locator('.controls-simple[data-group="move"]');
    const params = await simple
      .locator('.code-param')
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset.param),
      );
    expect(params).toEqual([
      'fromX',
      'fromY',
      'toX',
      'toY',
      'duration',
      'delay',
      'easing',
    ]);
    // Duration stretches the keyframes in one step.
    const steps = (await hook(page)).history.labels.length;
    const duration = panel(page).locator('#controls-simple-position-duration');
    await duration.fill('4');
    await duration.press('Enter');
    await expect
      .poll(async () => (await frames(page)).map((frame) => frame.time))
      .toEqual([0, 4]);
    expect((await hook(page)).history.labels.length).toBe(steps + 1);
    // To X changes the last keyframe's value.
    const toX = panel(page).locator('#controls-simple-position-toX');
    await toX.fill('500');
    await toX.press('Enter');
    await expect
      .poll(async () => (await frames(page)).at(-1)!.value)
      .toEqual([500, 456]);
    // Add animation lists the Creator presets; the fade adds Opacity only.
    await panel(page).locator('#controls-add').click();
    await panel(page)
      .locator(`.controls-add-item[data-preset="${FADE_ID}"]`)
      .click();
    await expect
      .poll(async () => (await frames(page, 'opacity')).length)
      .toBe(2);
    expect((await hook(page)).history.labels.at(-1)).toBe('Add animation');
    await expect.poll(() => groups(page)).toEqual(['opacity', 'move']);
    expect(await groups(page)).not.toContain('scale');
    expect(await groups(page)).not.toContain('rotate');
    // The hand-made Position keyframes are untouched.
    expect((await frames(page)).at(-1)!.value).toEqual([500, 456]);
    expect((await frames(page, 'opacity')).map((frame) => frame.value)).toEqual(
      [1, 0.5],
    );
  });
});
