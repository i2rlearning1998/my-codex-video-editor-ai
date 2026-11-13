// ROUND-B Part B2: AI mode, a second layout of the same editor. Every test
// acts like a person (real mouse and keyboard); state is read only through
// the read-only test hook.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  menuAction,
  seekKeep,
  showCategory,
  toScreen,
} from './fixtures';

const ready = async (page: Page) => {
  await page.goto('/');
  await hook(page);
};
/** Opens AI mode and waits until Director has started. */
export async function openAi(page: Page) {
  await page.locator('#mode-ai').click();
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/);
  await expect(page.locator('#ai-thread .ai-msg').first()).toBeVisible();
}
const layerNamed = async (page: Page, name: string) =>
  (await hook(page)).project.compositions[0]!.layers.find(
    (layer) => layer.name === name,
  )!;
const visibleBox = async (page: Page, selector: string) => {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} is shown`).not.toBeNull();
  return box!;
};

test('[RDB-006] Editor | AI switch: the top bar button and the palette command change the layout; the selection, playhead and open scene stay and nothing is added to history', async ({
  page,
}) => {
  await ready(page);
  // Select the headline in Editor mode and move the playhead.
  const at = await toScreen(page, 200, 250);
  await page.mouse.click(at.x, at.y);
  const selected = (await hook(page)).session.selectedIds;
  expect(selected).toHaveLength(1);
  await seekKeep(page, 3);
  const before = await hook(page);
  await openAi(page);
  let now = await hook(page);
  expect(now.session.layout).toBe('ai');
  expect(now.session.selectedIds).toEqual(selected);
  expect(now.session.time).toBeCloseTo(before.session.time, 3);
  expect(now.session.compositionId).toBe(before.session.compositionId);
  expect(now.history.labels).toEqual(before.history.labels);
  await expect(page.locator('#mode-ai')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // The selection is a chip in the message box.
  await expect(page.locator('#ai-chips [data-chip="layer"]')).toHaveCount(1);
  // Back with the Editor side of the switch.
  await page.locator('#mode-switch [data-mode="editor"]').click();
  await expect(page.locator('.editor-shell')).not.toHaveClass(/ai-layout/);
  now = await hook(page);
  expect(now.session.layout).toBe('editor');
  expect(now.session.selectedIds).toEqual(selected);
  expect(now.history.labels).toEqual(before.history.labels);
  // The registered command (the palette).
  await page.keyboard.press('Control+k');
  await page.keyboard.type('AI mode');
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/);
  expect((await hook(page)).session.layout).toBe('ai');
  // A reload stays in AI mode on the same video (a saved one: an edit first).
  await page.locator('#ai-ctl-text').fill('Saved before the reload');
  await page.locator('#ai-ctl-text').blur();
  await expect(page.locator('#save-status-text')).toHaveText(/Saved/);
  const videoId = (await hook(page)).project.id;
  await page.reload();
  await hook(page);
  expect((await hook(page)).project.id).toBe(videoId);
  await hook(page);
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/);
});

test('[RDB-007] AI mode layout: the Director column, the stage, the scene ribbon with a slim timeline, the drawer and the quick strip are shown; the manual rails, inspector, toolbars and timeline are not; at 1024 px the drawer is an overlay', async ({
  page,
}) => {
  await ready(page);
  await openAi(page);
  const dir = await visibleBox(page, '#ai-director');
  const stage = await visibleBox(page, '#canvas-stage');
  const bottom = await visibleBox(page, '#ai-bottom');
  const drawer = await visibleBox(page, '#ai-drawer');
  // Left, centre (largest), right; the ribbon under the stage.
  expect(dir.x + dir.width).toBeLessThanOrEqual(stage.x + 1);
  expect(stage.x + stage.width).toBeLessThanOrEqual(drawer.x + 1);
  expect(bottom.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
  expect(stage.width).toBeGreaterThan(dir.width);
  expect(stage.width).toBeGreaterThan(drawer.width);
  for (const id of [
    '#ai-orb-state',
    '#ai-thread',
    '#ai-input',
    '#ai-attach',
    '#ai-voice',
    '#ai-send',
    '#ai-ribbon .ai-scene',
    '#ai-play',
    '#ai-track .ai-clip',
    '#ai-quick-look',
    '#ai-quick-voice',
    '#ai-quick-music',
    '#ai-quick-captions',
    '#ai-quick-format',
    '#ai-credits',
    '#ai-back',
    '#undo',
    '#redo',
    '#export',
  ])
    await expect(page.locator(id).first(), id).toBeVisible();
  for (const tab of ['controls', 'plan', 'assets', 'memory'])
    await expect(page.locator(`[data-ai-tab="${tab}"]`)).toBeVisible();
  for (const hidden of [
    '#rail-left',
    '#library-panel',
    '#inspector-panel',
    '#rail-right',
    '.timeline',
    '#canvas-footer',
    '#context-toolbar',
    '#selection-actions',
    '#ask-director',
  ])
    await expect(page.locator(hidden).first(), hidden).toBeHidden();
  // The drawer closes and the stage grows.
  await page.locator('#ai-drawer-close').click();
  await expect(page.locator('#ai-drawer')).toBeHidden();
  await expect
    .poll(async () => (await visibleBox(page, '#canvas-stage')).width)
    .toBeGreaterThan(stage.width + 100);
  await page.locator('#ai-drawer-toggle').click();
  await expect(page.locator('#ai-drawer')).toBeVisible();
  // No sideways scroll at any of the four widths; narrow: the drawer overlays.
  for (const width of [1920, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const [scroll, client] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(scroll, `${width}: no sideways scroll`).toBeLessThanOrEqual(client);
    await expect(page.locator('#ai-director')).toBeVisible();
    await expect(page.locator('#composition-canvas')).toBeVisible();
    await expect(page.locator('#mode-ai')).toBeVisible();
  }
  await page.locator('#ai-drawer-toggle').click();
  await expect(page.locator('#ai-drawer')).toBeVisible();
  const narrowStage = await visibleBox(page, '#canvas-stage');
  const overlay = await visibleBox(page, '#ai-drawer');
  // It lies over the stage instead of taking a column.
  expect(overlay.x).toBeLessThan(narrowStage.x + narrowStage.width);
});

test('[RDB-008] the canvas in AI mode is select-only: a click selects, a drag moves nothing, Delete and Duplicate keys do nothing, while Undo, Redo, Space and Escape still work', async ({
  page,
}) => {
  await ready(page);
  await openAi(page);
  const start = await hook(page);
  const at = await toScreen(page, 200, 250);
  await page.mouse.click(at.x, at.y);
  const id = (await hook(page)).session.selectedIds[0]!;
  expect(id).toBeTruthy();
  // The bubble names the layer; AI mode draws its own outline, no handles.
  await expect(page.locator('#ai-bubble')).toBeVisible();
  await expect(page.locator('#ai-outline polygon.selected')).toHaveCount(1);
  const layerBefore = (await hook(page)).project.compositions[0]!.layers.find(
    (l) => l.id === id,
  )!;
  // A drag does not move it.
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 120, at.y + 60, { steps: 6 });
  await page.mouse.up();
  // Edit keys are off.
  await page
    .locator('#ai-hit')
    .click({ position: { x: 5, y: 5 }, force: true });
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+d');
  await page.keyboard.press('ArrowRight');
  let now = await hook(page);
  expect(now.history.labels).toEqual(start.history.labels);
  expect(now.project.compositions[0]!.layers.find((l) => l.id === id)).toEqual(
    layerBefore,
  );
  expect(now.project.compositions[0]!.layers).toHaveLength(
    start.project.compositions[0]!.layers.length,
  );
  // Space plays and pauses.
  await page.keyboard.press('Space');
  await expect.poll(async () => (await hook(page)).session.playing).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await hook(page)).session.playing).toBe(false);
  // Escape clears the selection.
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(0);
  // Undo and Redo work: an edit made in the Controls tab is undone.
  await page.mouse.click(at.x, at.y);
  await page.locator('#ai-ctl-text').fill('Hello AI mode');
  await page.locator('#ai-ctl-text').blur();
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(start.history.labels.length + 1);
  await page
    .locator('#ai-hit')
    .click({ position: { x: 5, y: 5 }, force: true });
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(start.history.labels.length);
  await page.keyboard.press('Control+y');
  now = await hook(page);
  expect(now.history.labels.length).toBe(start.history.labels.length + 1);
});

test('[RDB-009] Controls tab: text content previews on the canvas while typing and commits one undo step; text colour, fill colour and show/hide each are one step; a locked layer shows no controls', async ({
  page,
}) => {
  await ready(page);
  await openAi(page);
  const base = (await hook(page)).history.labels.length;
  await expect(page.locator('#ai-controls-none')).toBeVisible();
  const at = await toScreen(page, 200, 250);
  await page.mouse.click(at.x, at.y);
  const id = (await hook(page)).session.selectedIds[0]!;
  const text = page.locator('#ai-ctl-text');
  await expect(text).toBeVisible();
  // Typing previews: the project is unchanged until the field is left.
  const shot = async () =>
    page.locator('#composition-canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 97) sum += d[i]!;
      return sum;
    });
  const pixelsBefore = await shot();
  await text.fill('X');
  await expect.poll(shot).not.toBe(pixelsBefore);
  expect((await hook(page)).history.labels.length).toBe(base);
  await text.blur();
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(base + 1);
  const layer = () =>
    hook(page).then((h) =>
      h.project.compositions[0]!.layers.find((l) => l.id === id)!,
    );
  expect((await layer()).properties.text!.value).toBe('X');
  // Text colour: one step.
  await page.locator('[data-control="fill"] [data-colour="#e5484d"]').click();
  await expect
    .poll(async () => (await layer()).properties.fill!.value)
    .toBe('#e5484d');
  expect((await hook(page)).history.labels.length).toBe(base + 2);
  // Show / hide: the clip is switched off, one step.
  await page.locator('#ai-ctl-show').click();
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(base + 3);
  const clip = (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (t) => t.clips,
  ).find((c) => c.layerId === id)!;
  expect(clip.enabled).toBe(false);
});

const PULSE = readFileSync('tests/fixtures/code/pulse-block.js', 'utf8');
test('[RDB-009] Controls tab: a code animation shows its own controls; dragging a number control previews live and commits once on release, one undo step', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_FREECODE__?: string }).__AIVE_E2E_FREECODE__ =
      'fake';
  });
  await ready(page);
  // A code animation, added in Editor mode.
  await showCategory(page, 'Media');
  await showCategory(page, 'AI');
  await page.locator('#ai-import').click();
  const dialog = page.locator('.code-import-dialog');
  await dialog.locator('#ai-import-source').fill(PULSE);
  await expect(dialog.locator('#code-thumb')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await dialog.locator('#ai-import-add').click();
  await expect(dialog).toBeHidden();
  const code = () =>
    hook(page).then((h) =>
      h.project.compositions.flatMap((s) => s.layers).find((l) => !!l.code)!,
    );
  const before = (await code()).code!.bakeKey;
  await openAi(page);
  // It is still selected: its own controls are in the Controls tab.
  await expect(page.locator('#ai-own-controls')).toBeVisible();
  const steps = (await hook(page)).history.labels.length;
  const slider = page.locator('#ai-own-controls #code-setting-radius-slider');
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, {
    steps: 6,
  });
  // Nothing is committed while dragging.
  expect((await hook(page)).history.labels.length).toBe(steps);
  await page.mouse.up();
  await expect
    .poll(async () => (await hook(page)).history.labels.length)
    .toBe(steps + 1);
  expect((await hook(page)).history.labels.at(-1)).toBe('Animation settings');
  expect((await code()).code!.bakeKey).not.toBe(before);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await code()).code!.bakeKey).toBe(before);
});

test('[RDB-010] scene ribbon: a click opens a scene, dragging a card reorders in one undo step, and the card menu duplicates, deletes after a confirmation, and asks Director about the scene', async ({
  page,
}) => {
  await ready(page);
  // Two more scenes, made in Editor mode.
  for (let i = 0; i < 2; i++) {
    const empty = await toScreen(page, 1240, 700);
    await page.mouse.click(empty.x, empty.y, { button: 'right' });
    await page
      .locator('#canvas-context-menu [data-action="add-scene"]')
      .click();
  }
  await expect
    .poll(async () => (await hook(page)).project.compositions.length)
    .toBe(3);
  await openAi(page);
  const cards = page.locator('#ai-ribbon .ai-scene');
  await expect(cards).toHaveCount(3);
  const ids = (await hook(page)).project.compositions.map((s) => s.id);
  // Real thumbnails and lengths.
  await expect(cards.first().locator('img')).toHaveAttribute(
    'src',
    /^data:image/,
  );
  await expect(cards.first().locator('.ai-len')).toHaveText(/\d s/);
  // Click opens.
  await cards.nth(0).click();
  await expect
    .poll(async () => (await hook(page)).session.compositionId)
    .toBe(ids[0]);
  await expect(cards.nth(0)).toHaveAttribute('aria-current', 'true');
  // Drag the first card behind the last.
  const steps = (await hook(page)).history.labels.length;
  const from = (await cards.nth(0).boundingBox())!;
  const to = (await cards.nth(2).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 30);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + 30, {
    steps: 3,
  });
  await page.mouse.move(to.x + to.width - 4, to.y + 30, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await hook(page)).project.compositions.map((s) => s.id))
    .toEqual([ids[1], ids[2], ids[0]]);
  expect((await hook(page)).history.labels.length).toBe(steps + 1);
  expect((await hook(page)).history.labels.at(-1)).toBe('Reorder scenes');
  // Menu: Duplicate.
  await cards.nth(0).hover();
  await cards.nth(0).locator('.ai-scene-menu').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(cards).toHaveCount(4);
  // Menu: Delete asks first; Cancel keeps it.
  await cards.nth(0).hover();
  await cards.nth(0).locator('.ai-scene-menu').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.locator('.modal-dialog [data-role="cancel"]').click();
  await expect(cards).toHaveCount(4);
  await cards.nth(0).hover();
  await cards.nth(0).locator('.ai-scene-menu').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(cards).toHaveCount(3);
  // Menu: Ask Director about this scene puts a scene chip in the message box.
  await cards.nth(1).hover();
  await cards.nth(1).locator('.ai-scene-menu').click();
  await page
    .getByRole('menuitem', { name: 'Ask Director about this scene' })
    .click();
  await expect(page.locator('#ai-chips [data-chip="scene"]')).toBeVisible();
  await expect(page.locator('#ai-input')).toBeFocused();
});

test('[RDB-011] quick strip: Format, Look, Voice, Music and Captions each become a Director proposal that previews on the canvas and changes nothing until Apply; Apply is one undo step', async ({
  page,
}) => {
  await ready(page);
  await openAi(page);
  const before = await hook(page);
  const steps = before.history.labels.length;
  const size = () =>
    hook(page).then((h) => {
      const s = h.project.compositions[0]!;
      return [s.width, s.height];
    });
  // Format: 9:16.
  await page.locator('#ai-quick-format').click();
  await page.getByRole('menuitemradio', { name: '9:16' }).click();
  const card = page.locator('[data-card="proposal"][data-state="open"]');
  await expect(card).toBeVisible();
  // Not applied yet: the project is as it was.
  expect(await size()).toEqual([1280, 720]);
  expect((await hook(page)).history.labels.length).toBe(steps);
  // Discard changes nothing.
  await card.locator('[data-act="discard"]').click();
  await expect(card).toHaveCount(0);
  expect(await size()).toEqual([1280, 720]);
  // Again, and Apply: one step.
  await page.locator('#ai-quick-format').click();
  await page.getByRole('menuitemradio', { name: '9:16' }).click();
  await card.locator('[data-act="apply"]').click();
  await expect.poll(size).toEqual([1080, 1920]);
  expect((await hook(page)).history.labels.length).toBe(steps + 1);
  await page.locator('#undo').click();
  await expect.poll(size).toEqual([1280, 720]);
  // Look: the project's looks are listed and one becomes a proposal.
  await page.locator('#ai-quick-look').click();
  const looks = page.locator('#ai-quick-look-pop [role="menuitemradio"]');
  expect(await looks.count()).toBeGreaterThan(0);
  const background = () =>
    hook(page).then((h) => h.project.compositions[0]!.backgroundColor);
  const was = await background();
  await looks.last().click();
  await expect(card).toBeVisible();
  expect(await background()).toBe(was);
  await card.locator('[data-act="apply"]').click();
  await expect(card).toHaveCount(0);
  // Voice, Music and Captions say plainly when the video has none.
  for (const [button, words] of [
    ['#ai-quick-voice', 'no voice'],
    ['#ai-quick-music', 'no music'],
    ['#ai-quick-captions', 'no captions'],
  ] as const) {
    await page.locator(button).click();
    await expect(page.locator(`${button}-pop`)).toContainText(words);
    await page.keyboard.press('Escape');
    await expect(page.locator(`${button}-pop`)).toHaveCount(0);
  }
});

test('[RDB-012] Export opens from AI mode; the editor chat dock is gone; Ask Director in Editor mode (top bar and canvas menu) opens AI mode with the selection carried over', async ({
  page,
}) => {
  await ready(page);
  // No dock and no dock toggle any more.
  await expect(page.locator('#chat-toggle')).toHaveCount(0);
  await expect(page.locator('#chat-dock')).toHaveCount(0);
  // Top bar button.
  const at = await toScreen(page, 200, 250);
  await page.mouse.click(at.x, at.y);
  const selected = (await hook(page)).session.selectedIds;
  await page.locator('#ask-director').click();
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/);
  await expect(page.locator('#ai-thread .ai-msg').first()).toBeVisible();
  expect((await hook(page)).session.selectedIds).toEqual(selected);
  await expect(page.locator('#ai-chips [data-chip="layer"]')).toHaveCount(1);
  // Export from AI mode.
  await page.locator('#export').click();
  await expect(page.locator('.modal-dialog #export-png')).toBeVisible();
  await page.locator('.modal-dialog .modal-close').click();
  await expect(page.locator('.modal-dialog')).toHaveCount(0);
  // Back to the editor; the canvas menu entry.
  await page.locator('#mode-switch [data-mode="editor"]').click();
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page
    .locator('#canvas-context-menu [data-action="ask-director"]')
    .click();
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/);
  expect((await hook(page)).session.selectedIds).toEqual(selected);
  // Also from the main menu's palette command.
  await page.locator('#mode-switch [data-mode="editor"]').click();
  await menuAction(page, '#open-palette');
  await page.keyboard.type('Ask Director');
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/);
});

test('[RDB-013] the slim timeline is read-only: a clip click selects its layer, a click on empty time seeks, Play plays; nothing is added to history', async ({
  page,
}) => {
  await ready(page);
  await openAi(page);
  const steps = (await hook(page)).history.labels.length;
  const clip = page.locator('#ai-track .ai-clip').first();
  const layerId = await clip.getAttribute('data-layer');
  await clip.click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([layerId]);
  await expect(clip).toHaveAttribute('aria-pressed', 'true');
  // Seek: a press on the track background.
  const box = (await page.locator('#ai-track').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + 1);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeGreaterThan(3);
  await expect(page.locator('#ai-time')).toContainText('0:0');
  await page.locator('#ai-play').click();
  await expect.poll(async () => (await hook(page)).session.playing).toBe(true);
  await page.locator('#ai-play').click();
  await expect.poll(async () => (await hook(page)).session.playing).toBe(false);
  expect((await hook(page)).history.labels.length).toBe(steps);
  // A drag on a clip trims or moves nothing.
  const first = (await clip.boundingBox())!;
  const before = (await hook(page)).project.compositions[0]!.tracks;
  await page.mouse.move(first.x + 4, first.y + 3);
  await page.mouse.down();
  await page.mouse.move(first.x + 80, first.y + 3, { steps: 4 });
  await page.mouse.up();
  expect((await hook(page)).project.compositions[0]!.tracks).toEqual(before);
  void layerNamed;
});
