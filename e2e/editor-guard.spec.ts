// ROUND-C1 Part G: the Editor guard (permanent). The Editor is exactly Round
// A's editor: e2e/editor-guard.golden.json was recorded on
// origin/claude/round-a-panel by e2e/editor-guard.record.ts with the same
// steps (e2e/editor-guard-collect.ts). Boxes must match within 2 px; label
// lists must be equal. The golden is never edited or refreshed to pass.
//
// The ONLY allowed differences (owner decision 2026-11-15):
//   1. the new "Editor | AI" toggle (#layout-switch: #layout-editor, #mode-ai)
//      and the `ai-mode` palette command (its palette row and its row in the
//      shortcut list);
//   2. the removed editor chat button (#chat-toggle): chat lives in AI mode;
//   3. the horizontal shift of top bar controls caused by the toggle's
//      width (reported per control, not failed).
// Everything else, including the whole AI, My Templates and Theme rail
// categories and their panels, must be the same as Round A.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, artboard, toScreen } from './fixtures';
import {
  SIZES,
  category,
  listsOf,
  openFixture,
  ready,
  realStart,
  settle,
  statesAt,
  topbarControls,
  type Box,
  type Golden,
  type Shot,
} from './editor-guard-collect';
import { builtVideo } from './round-b-helpers';

const golden = JSON.parse(
  readFileSync(path.resolve('e2e/editor-guard.golden.json'), 'utf8'),
) as Golden;
const FIXTURE = path.resolve('tests/fixtures/projects/two-scenes.json');
const TOLERANCE = 2;

const AI_LABEL = 'Switch between Editor and AI mode';
const allowedNew = (list: string, entry: string) =>
  (list === 'topbar' && /^button#(layout-editor|mode-ai)\|/.test(entry)) ||
  (list === 'palette' && entry.startsWith('button#palette-ai-mode|')) ||
  (list === 'shortcuts' && entry.startsWith(`p#|${AI_LABEL}:`));
const allowedGone = (list: string, entry: string) =>
  list === 'topbar' && entry.startsWith('button#chat-toggle|');

function shotDiffs(where: string, actual: Shot, want: Shot | 'skipped') {
  const out: string[] = [];
  if (want === 'skipped') return out;
  if (actual.layout !== want.layout)
    out.push(
      `${where}: data-layout "${actual.layout}" (Round A "${want.layout}")`,
    );
  for (const [selector, box] of Object.entries(want.boxes)) {
    const now: Box = actual.boxes[selector] ?? null;
    if (!box || !now) {
      if (box !== now)
        out.push(
          `${where} ${selector}: ${JSON.stringify(now)} (Round A ${JSON.stringify(box)})`,
        );
      continue;
    }
    if (box.some((value, i) => Math.abs(value - now[i]!) > TOLERANCE))
      out.push(
        `${where} ${selector}: ${JSON.stringify(now)} (Round A ${JSON.stringify(box)})`,
      );
  }
  return out;
}
function listDiffs(name: string, actual: string[], want: string[]) {
  const a = actual.filter((entry) => !allowedNew(name, entry));
  const w = want.filter((entry) => !allowedGone(name, entry));
  const out: string[] = [];
  for (const entry of w)
    if (!a.includes(entry)) out.push(`${name}: missing ${entry}`);
  for (const entry of a)
    if (!w.includes(entry)) out.push(`${name}: new ${entry}`);
  if (!out.length && JSON.stringify(a) !== JSON.stringify(w))
    out.push(`${name}: same entries in another order`);
  return out;
}
const sizeKey = (size: readonly [number, number]) => `${size[0]}x${size[1]}`;
const fresh = (key: string) => golden.sizes[key]!.fresh!;

async function toAi(page: Page) {
  await page.locator('#mode-ai').click();
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/);
  await expect(page.locator('#ai-thread .ai-msg').first()).toBeVisible({
    timeout: 30_000,
  });
}
async function toEditor(page: Page) {
  await page.locator('#layout-editor').click();
  await expect(page.locator('.editor-shell')).not.toHaveClass(/ai-layout/);
}
/** After a return the Editor equals Round A's fresh editor at this size. */
async function sameAsFresh(page: Page, where: string, key: string) {
  const shot = await settle(page);
  expect(shotDiffs(where, shot, fresh(key)), where).toEqual([]);
}

test('[RDC1-100] the Editor equals Round A: every panel box at five sizes and every state, and every menu, palette, panel, toolbar and shortcut list item by item', async ({
  page,
}, testInfo) => {
  test.setTimeout(900_000);
  await realStart(page);
  const diffs: string[] = [];
  const shifts: string[] = [];
  const toggles: string[] = [];
  for (const size of SIZES) {
    const key = sizeKey(size);
    const states = await statesAt(page, size, FIXTURE);
    for (const [state, want] of Object.entries(golden.sizes[key]!)) {
      const now = states[state];
      if (!now || now === 'skipped') {
        if (want !== 'skipped') diffs.push(`${key} ${state}: not reached`);
        continue;
      }
      diffs.push(...shotDiffs(`${key} ${state}`, now, want));
    }
    await page.goto('/');
    await ready(page);
    const controls = await topbarControls(page);
    // The toggle fits beside the mode switch and inside the window from
    // 1024 px up, without squeezing the existing controls.
    if (size[0] >= 1024) {
      const toggle = controls['layout-switch'];
      const modes = controls['mode-switch'];
      if (!toggle || !modes)
        diffs.push(`${key}: toggle or mode switch not shown`);
      else {
        if (toggle[0] < modes[0] + modes[2])
          diffs.push(`${key}: the toggle overlaps the mode switch`);
        if (toggle[0] + toggle[2] > size[0])
          diffs.push(`${key}: the toggle is outside the window`);
        const undo = controls.undo;
        if (undo && toggle[0] + toggle[2] > undo[0])
          diffs.push(`${key}: the toggle overlaps the actions on the right`);
        const status = controls['save-status-text'];
        if (status && status[0] + status[2] > modes[0])
          diffs.push(`${key}: the project title runs under the mode switch`);
      }
      toggles.push(`${key}: ${JSON.stringify(toggle)}`);
    }
    for (const [id, box] of Object.entries(golden.topbarControls[key]!)) {
      if (id === 'chat-toggle') continue;
      const now = controls[id] ?? null;
      if (!box || !now) {
        if (box !== now)
          diffs.push(
            `${key} top bar ${id}: ${JSON.stringify(now)} (Round A ${JSON.stringify(box)})`,
          );
        continue;
      }
      const dx = now[0] - box[0];
      if (
        Math.abs(now[1] - box[1]) > TOLERANCE ||
        Math.abs(now[3] - box[3]) > TOLERANCE ||
        now[2] < box[2] - TOLERANCE
      )
        diffs.push(
          `${key} top bar ${id}: ${JSON.stringify(now)} (Round A ${JSON.stringify(box)})`,
        );
      else if (Math.abs(dx) > TOLERANCE)
        shifts.push(`${key} ${id}: ${dx > 0 ? '+' : ''}${dx} px`);
    }
  }
  const { lists } = await listsOf(page, FIXTURE);
  for (const [name, want] of Object.entries(golden.lists))
    diffs.push(...listDiffs(name, lists[name] ?? [], want));
  for (const name of Object.keys(lists))
    if (!(name in golden.lists)) diffs.push(`list ${name}: not in Round A`);
  testInfo.annotations.push({
    type: 'top-bar-shifts',
    description: shifts.join('; ') || 'none',
  });
  console.log(`EDITOR-GUARD toggle boxes: ${toggles.join('; ')}`);
  console.log(`EDITOR-GUARD top bar shifts: ${shifts.join('; ') || 'none'}`);
  expect(diffs).toEqual([]);
});

test('[RDC1-101] after every return from AI mode the Editor equals Round A: Editor to AI to Editor, a resize while in AI, a reload while in AI, five round trips, and 390 and 700 px keep their own layout', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await realStart(page);
  for (const size of SIZES) {
    if (size[0] < 1024) continue;
    await page.setViewportSize({ width: size[0], height: size[1] });
    await page.goto('/');
    await ready(page);
    await toAi(page);
    await toEditor(page);
    await sameAsFresh(page, `${sizeKey(size)} after AI`, sizeKey(size));
  }
  // A resize while in AI mode, then back: the Editor equals the same
  // resizes done without AI mode (Round A keeps a panel's width while the
  // layout stays the same, so a fresh page is not the reference here).
  const resizes: (readonly [number, number])[][] = [
    [[1280, 800]],
    [
      [1024, 768],
      [1440, 900],
    ],
    [[1440, 900]],
  ];
  for (const steps of resizes) {
    const run = async (viaAi: boolean) => {
      await page.setViewportSize({ width: 1920, height: 940 });
      await page.goto('/');
      await ready(page);
      if (viaAi) await toAi(page);
      for (const [width, height] of steps) {
        await page.setViewportSize({ width, height });
        await settle(page);
      }
      if (viaAi) await toEditor(page);
      return settle(page);
    };
    const plain = await run(false);
    const via = await run(true);
    const label = `1920 then ${steps.map((step) => step[0]).join(', ')} in AI`;
    expect(shotDiffs(label, via, plain), label).toEqual([]);
  }
  // A reload while in AI mode (on a saved video), then back.
  await page.setViewportSize({ width: 1920, height: 940 });
  await openFixture(page, FIXTURE);
  await toAi(page);
  await page.reload();
  await ready(page);
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/);
  await toEditor(page);
  await sameAsFresh(page, '1920x940 after a reload in AI', '1920x940');
  // Five round trips in a row.
  for (let i = 0; i < 5; i++) {
    await toAi(page);
    await toEditor(page);
  }
  await sameAsFresh(page, '1920x940 after five round trips', '1920x940');
  // Small windows keep the workspace's own data-layout value.
  for (const [width, height] of [
    [390, 844],
    [700, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await ready(page);
    const before = await settle(page);
    await page.evaluate(() => {
      // The toggle may be off screen on a phone; the palette command is the
      // same registered command.
      (document.querySelector('#mode-ai') as HTMLButtonElement | null)?.click();
    });
    await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/);
    expect(
      await page.locator('.editor-shell').getAttribute('data-layout'),
    ).toBe(before.layout);
    await page.evaluate(() =>
      (
        document.querySelector('#layout-editor') as HTMLButtonElement | null
      )?.click(),
    );
    await expect(page.locator('.editor-shell')).not.toHaveClass(/ai-layout/);
    const after = await settle(page);
    expect(after, `${width} px after AI`).toEqual(before);
    if (width === 390)
      expect(shotDiffs('390 after AI', after, fresh('390x844'))).toEqual([]);
  }
});

test('[RDC1-101] a Video built in AI mode (opened from Home with ?ai=1), then back to the Editor: the Editor equals Round A', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await realStart(page);
  await builtVideo(page);
  // (Home opens the new Video with ?ai=1; the editor drops it after use.)
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/);
  await toEditor(page);
  await sameAsFresh(page, '1920x940 after a build in AI', '1920x940');
});

async function selectedLayer(page: Page) {
  // The fixture's "Intro" layer (composition 100..500, 100..325, shown from
  // 0 s), through the artboard on screen.
  const at = await toScreen(page, 300, 212);
  await page.mouse.click(at.x, at.y);
  const ids = (await hook(page)).session.selectedIds;
  if (!ids.length) throw new Error('no layer under the test point');
  return { at, id: ids[0]! };
}
const layerPos = async (page: Page, id: string) => {
  const layer = (await hook(page)).project.compositions
    .flatMap((scene) => scene.layers)
    .find((item) => item.id === id)!;
  return [...layer.transform.position.value];
};

/** The Editor's own actions; returns what each one did. */
async function editorActions(page: Page) {
  const done: Record<string, unknown> = {};
  // After the panels stop moving, from the scene's start each time (a seek
  // of the last round moves it).
  await settle(page);
  const ruler0 = (await page.locator('.timeline-ruler').first().boundingBox())!;
  await page.mouse.click(ruler0.x + 20, ruler0.y + ruler0.height / 2);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeLessThan(0.5);
  // The canvas view is the same as in a fresh editor.
  const board = await artboard(page);
  done.artboard = [
    Math.round(board.x),
    Math.round(board.y),
    Math.round(board.scale * 1000),
  ];
  const { at, id } = await selectedLayer(page);
  done.select = true;
  const before = await layerPos(page, id);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 30, at.y + 20, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => layerPos(page, id)).not.toEqual(before);
  done.drag = true;
  await page.keyboard.press('Control+z');
  await expect.poll(() => layerPos(page, id)).toEqual(before);
  done.undo = true;
  const count = async () =>
    (await hook(page)).project.compositions.flatMap((scene) => scene.layers)
      .length;
  const layers = await count();
  await page.locator('#composition-canvas').focus();
  await page.keyboard.press('Control+d');
  await expect.poll(count).toBe(layers + 1);
  await page.keyboard.press('Control+z');
  await expect.poll(count).toBe(layers);
  done.shortcut = true;
  await page.keyboard.press('Space');
  await expect.poll(async () => (await hook(page)).session.playing).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await hook(page)).session.playing).toBe(false);
  // Paused by the key, not by reaching the end of the 5 s scene.
  done.play = (await hook(page)).session.time < 4.5;
  // Back to the start with a ruler click (playback may have reached the end).
  const start = (await page.locator('.timeline-ruler').first().boundingBox())!;
  await page.mouse.click(start.x + 20, start.y + start.height / 2);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeLessThan(0.5);
  const again = await selectedLayer(page);
  await page.mouse.click(again.at.x, again.at.y, { button: 'right' });
  await expect(page.locator('#canvas-context-menu')).toBeVisible();
  done.menu = await page.locator('#canvas-context-menu [data-action]').count();
  await page.keyboard.press('Escape');
  const ruler = (await page.locator('.timeline-ruler').first().boundingBox())!;
  await page.mouse.click(
    ruler.x + ruler.width * 0.4,
    ruler.y + ruler.height / 2,
  );
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeGreaterThan(0);
  done.seek = true;
  return done;
}

test("[RDC1-102] after every return from AI mode the Editor's own actions work as in a fresh editor: select, drag, undo, a shortcut, play and pause, seek, the canvas menu", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await realStart(page);
  await page.goto('/');
  await ready(page);
  await openFixture(page, FIXTURE);
  await category(page, 'Media');
  const freshResult = await editorActions(page);
  expect(freshResult).toMatchObject({
    select: true,
    drag: true,
    undo: true,
    shortcut: true,
    play: true,
    seek: true,
  });
  expect(freshResult.menu).toBeGreaterThan(5);
  await page.keyboard.press('Escape');
  for (let i = 0; i < 3; i++) {
    await toAi(page);
    await toEditor(page);
    expect(await editorActions(page), `return ${i + 1}`).toEqual(freshResult);
    await page.keyboard.press('Escape');
  }
});

test('[RDC1-103] Review video plan opens in the AI category from every caller; Back returns to the AI list; another category closes it', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await realStart(page);
  await builtVideo(page);
  const review = page.locator('[data-deep-panel="plan-review"]');
  const aiCategory = page.locator('#rail-left [data-category="AI"]');
  // 1. From AI mode's Built card (the AI host).
  await page.locator('#ai-build-review').click();
  await expect(page.locator('.editor-shell')).not.toHaveClass(/ai-layout/);
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect(aiCategory).toHaveAttribute('aria-pressed', 'true');
  // Back returns to the AI category's list.
  await review.locator('[data-action="side-panel-back"]').click();
  await expect(review).toBeHidden();
  await expect(aiCategory).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#library-panel')).toBeVisible();
  // 2. From the palette while another category is open.
  await category(page, 'Scene');
  await expect(
    page.locator('#rail-left [data-category="Scene"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Review video plan');
  await page.keyboard.press('Enter');
  await expect(review).toBeVisible();
  await expect(aiCategory).toHaveAttribute('aria-pressed', 'true');
  // It does not follow a switch to another category.
  await category(page, 'Text');
  await expect(review).toBeHidden();
  await expect(
    page.locator('#rail-left [data-category="Text"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  // 3. From the main menu with the left panel closed.
  await page.locator('[data-panel="left"]').first().click();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Review video plan');
  await page.keyboard.press('Enter');
  await expect(review).toBeVisible();
  await expect(aiCategory).toHaveAttribute('aria-pressed', 'true');
});
