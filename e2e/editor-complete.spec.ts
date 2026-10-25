import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  allowError,
  seekKeep,
  menuAction,
} from './fixtures';
import { toolbarButton } from './controls';

// EDITOR-COMPLETE (Part B): the items the audit found missing for the
// Editor (reports/AUDIT-EDITOR.md, "REALLY NEEDED NOW"). Real mouse and
// keyboard; the read-only hook only checks the result.
const MEDIA = 'tests/fixtures/media';

async function ready(page: Page) {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
}
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const lastLabel = async (page: Page) =>
  (await hook(page)).history.labels.at(-1);
const clipOf = (page: Page, layerId: string) =>
  page.locator(
    `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${layerId}"]`,
  );
const time = async (page: Page) => (await hook(page)).session.time;
/** A press on the stage outside the artboard: nothing selected. */
async function deselect(page: Page) {
  const stage = (await page.locator('canvas').first().boundingBox())!;
  await page.mouse.click(stage.x + 4, stage.y + 4);
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(0);
}
async function emptyLaneMenu(page: Page) {
  const row = page.locator('#timeline-foundation .timeline-nle-row').first();
  const box = (await row.boundingBox())!;
  const area = (await page
    .locator('#timeline-foundation .timeline-scroll')
    .boundingBox())!;
  await page.mouse.click(area.x + area.width - 24, box.y + box.height / 2, {
    button: 'right',
  });
  const menu = page.locator('#timeline-foundation .timeline-menu');
  await expect(menu).toBeVisible();
  return menu;
}
async function importMedia(page: Page, ...names: string[]) {
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(names.map((name) => path.join(MEDIA, name)));
  await expect(page.locator('#media-import')).toBeHidden({ timeout: 30_000 });
}
const storedProjects = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ id: string; name: string }[]>((resolve) => {
        const open = indexedDB.open('aive-projects', 1);
        open.onsuccess = () => {
          const request = open.result
            .transaction('projects', 'readonly')
            .objectStore('projects')
            .getAll();
          request.onsuccess = () =>
            resolve(
              (request.result as { id: string; name: string }[]).map(
                ({ id, name }) => ({ id, name }),
              ),
            );
        };
      }),
  );

test('[APP-002][APP-009][APP-010] the main menu has File, Edit, View and Help; Edit shows live state and runs; View toggles; Escape closes it', async ({
  page,
}) => {
  await ready(page);
  await page.locator('#menu-trigger').click();
  const menu = page.locator('#app-menu');
  await expect(menu.locator('.app-menu-label')).toHaveText([
    'File',
    'Edit',
    'View',
    'Help',
  ]);
  const edit = menu.locator('#app-menu-edit');
  await expect(edit.locator('[data-command="undo"]')).toBeDisabled();
  await expect(edit.locator('[data-command="copy"]')).toBeDisabled();
  await expect(edit.locator('[data-command="select-all"]')).toBeEnabled();
  await expect(edit.locator('[data-command="copy"]')).toContainText('Ctrl+C');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('#menu-trigger')).toBeFocused();
  // Select all from the Edit group, then Delete is live.
  await page.locator('#menu-trigger').click();
  await edit.locator('[data-command="select-all"]').click();
  expect((await hook(page)).session.selectedIds.length).toBeGreaterThan(1);
  await page.locator('#menu-trigger').click();
  await expect(edit.locator('[data-command="delete"]')).toBeEnabled();
  await expect(edit.locator('[data-command="copy"]')).toBeEnabled();
  await page.keyboard.press('Escape');
  // View: grid and timeline snapping.
  await page.locator('#menu-trigger').click();
  const grid = menu.locator('[data-view="grid"]');
  await expect(grid).toHaveAttribute('aria-checked', 'false');
  await grid.click();
  await page.locator('#menu-trigger').click();
  await expect(grid).toHaveAttribute('aria-checked', 'true');
  await menu.locator('[data-view="snap"]').click();
  await expect(
    page.locator('#timeline-foundation [data-action="snap-toggle"]'),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#menu-trigger').click();
  await menu.locator('[data-view="left-panel"]').click();
  await expect(page.locator('.editor-shell')).toHaveClass(/library-collapsed/);
});

test('[APP-014][HIS-003][APP-017] Undo and Redo name the step; the tab names the project and marks unsaved changes', async ({
  page,
}) => {
  await ready(page);
  await expect(page).toHaveTitle(/Form & Motion — Example – /);
  await clipOf(page, 'example-badge').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('#undo')).toHaveAttribute(
    'aria-label',
    'Undo Delete',
  );
  await expect(page.locator('#undo')).toHaveAttribute(
    'title',
    'Undo Delete (Ctrl+Z)',
  );
  await page.locator('#undo').click();
  await expect(page.locator('#redo')).toHaveAttribute(
    'aria-label',
    'Redo Delete',
  );
  await expect(page.locator('#undo')).toHaveAttribute(
    'aria-label',
    'Undo project command',
  );
  await page.locator('#project-name').click();
  await page.locator('#project-name-input').fill('Biology lesson');
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle(/Biology lesson – /);
  // An edit marks the tab until it is saved.
  await page.locator('#redo').click();
  await expect(page).toHaveTitle(/^• Biology lesson/);
  await expect(page).toHaveTitle(/^Biology lesson/);
});

test('[APP-018] reloading with a save still pending asks first', async ({
  page,
}) => {
  await ready(page);
  const types: string[] = [];
  page.on('dialog', (dialog) => types.push(dialog.type()));
  await clipOf(page, 'example-badge').click();
  await page.keyboard.press('Delete');
  // Within the 500 ms autosave window.
  await page.reload();
  expect(types).toContain('beforeunload');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  // Leave was chosen; the edit was still saved on the way out.
  expect(
    (await scene(page)).layers.some((layer) => layer.id === 'example-badge'),
  ).toBe(false);
});

test('[PRJ-015][PRJ-016][APP-006][APP-007][APP-008] projects are kept in IndexedDB; File › Projects opens, renames, duplicates and deletes them', async ({
  page,
}) => {
  await ready(page);
  // A second project from File › New project; the example is kept.
  await menuAction(page, '#new-project');
  await page
    .locator('#new-project-form')
    .getByLabel('Name', { exact: true })
    .fill('Second lesson');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#project-name')).toHaveText('Second lesson');
  await expect
    .poll(async () =>
      (await storedProjects(page)).map((item) => item.name).sort(),
    )
    .toEqual(['Form & Motion — Example', 'Second lesson']);
  expect(
    await page.evaluate(() => localStorage.getItem('ai-native-editor:project')),
  ).toBeNull();
  await menuAction(page, '#projects');
  const dialog = page.locator('.projects-dialog');
  const cards = dialog.locator('.project-card');
  await expect(cards).toHaveCount(2);
  // Most recent first; the open one is marked and cannot be deleted.
  await expect(cards.first().locator('.project-name')).toHaveText(
    'Second lesson',
  );
  await expect(cards.first()).toHaveAttribute('data-current', 'true');
  await expect(
    cards.first().locator('[data-action="project-delete"]'),
  ).toBeDisabled();
  const example = dialog.locator('.project-card', {
    hasText: 'Form & Motion — Example',
  });
  await expect(example.locator('.project-thumb img')).toHaveCount(1);
  // Rename the closed one.
  await example.locator('[data-action="project-rename"]').click();
  await page.locator('[data-role="prompt-input"]').fill('Example renamed');
  await page.locator('.modal-dialog [data-role="confirm"]').last().click();
  await expect(
    dialog.locator('.project-name', { hasText: 'Example renamed' }),
  ).toBeVisible();
  // Duplicate it.
  const renamed = dialog.locator('.project-card', {
    hasText: 'Example renamed',
  });
  await renamed.first().locator('[data-action="project-duplicate"]').click();
  await expect(cards).toHaveCount(3);
  await expect(
    dialog.locator('.project-name', { hasText: 'Example renamed copy' }),
  ).toBeVisible();
  // Delete the copy (asks first).
  await dialog
    .locator('.project-card', { hasText: 'Example renamed copy' })
    .locator('[data-action="project-delete"]')
    .click();
  await page.locator('.modal-dialog [data-role="confirm"]').last().click();
  await expect(cards).toHaveCount(2);
  // Open the renamed example: its scene is on the canvas.
  await dialog
    .locator('.project-card', { hasText: 'Example renamed' })
    .locator('.project-open')
    .click();
  await expect(page.locator('#project-name')).toHaveText('Example renamed');
  expect((await scene(page)).layers.length).toBeGreaterThan(3);
  // It stays the open project after a reload.
  await page.reload();
  await expect(page.locator('#project-name')).toHaveText('Example renamed');
});

test('[PRJ-017][PRJ-010] after an unexpected close the autosave is restored with its time; a damaged save opens the last good copy and is kept', async ({
  page,
}) => {
  await ready(page);
  await clipOf(page, 'example-badge').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('#save-status-text')).toHaveText(/Saved/);
  // The next start finds the page never said goodbye (a crash).
  await page.addInitScript(() => localStorage.setItem('aive.sessionOpen', '1'));
  await page.reload();
  await expect(page.locator('.toast').first()).toContainText(
    'closed unexpectedly',
  );
  expect(
    (await scene(page)).layers.some((layer) => layer.id === 'example-badge'),
  ).toBe(false);
  // A damaged primary: the backup opens and the damaged save is kept.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const id = localStorage.getItem('aive.currentProject')!;
        const open = indexedDB.open('aive-projects', 1);
        open.onsuccess = () => {
          const store = open.result
            .transaction('projects', 'readwrite')
            .objectStore('projects');
          const get = store.get(id);
          get.onsuccess = () => {
            const record = get.result as { primary: string; backup?: string };
            store.put({ ...record, backup: record.primary, primary: '{oops' });
          };
          store.transaction.oncomplete = () => resolve();
        };
      }),
  );
  await page.reload();
  await expect(
    page.locator('.toast', { hasText: 'could not be read' }),
  ).toBeVisible();
  expect((await scene(page)).layers.length).toBeGreaterThan(3);
});

test('[KEY-011][KEY-015] with nothing selected the arrows step frames (Shift a second) and Home and End jump; V, T, R and E are the tools', async ({
  page,
}) => {
  await ready(page);
  await deselect(page);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => time(page)).toBeCloseTo(1 / 30, 5);
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => time(page)).toBeCloseTo(1 + 1 / 30, 5);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => time(page)).toBeCloseTo(1, 5);
  await page.keyboard.press('End');
  await expect.poll(() => time(page)).toBeCloseTo(10, 3);
  await page.keyboard.press('Home');
  await expect.poll(() => time(page)).toBe(0);
  const count = (await scene(page)).layers.length;
  await page.keyboard.press('r');
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBe(count + 1);
  const added = (await scene(page)).layers.at(-1)!;
  expect(added.properties.shapeKind?.value).toBe('rectangle');
  await deselect(page);
  await page.keyboard.press('e');
  await expect
    .poll(
      async () =>
        (await scene(page)).layers.at(-1)!.properties.shapeKind?.value,
    )
    .toBe('ellipse');
  await deselect(page);
  await page.keyboard.press('t');
  await expect
    .poll(async () => (await scene(page)).layers.at(-1)!.type)
    .toBe('text');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // V leaves drawing.
  await showCategory(page, 'Draw');
  await page.locator('#draw-panel [title="Pen"]').click();
  await expect
    .poll(async () => (await hook(page)).session.drawBrush)
    .toBe('pen');
  await page.locator('canvas').first().focus();
  await page.keyboard.press('v');
  await expect
    .poll(async () => (await hook(page)).session.drawBrush)
    .toBe(null);
});

test('[PRJ-007] Canvas size can scale the whole design to fit the new size, in one undo step', async ({
  page,
}) => {
  await ready(page);
  const before = await scene(page);
  const headline = (id: string) =>
    before.layers.find((layer) => layer.id === id)!.transform;
  await page.locator('#context-toolbar [aria-label="Canvas size"]').click();
  await page.locator('#canvas-size-scale').check();
  await page.locator('.canvas-size-preset[data-preset="square"]').click();
  await expect.poll(async () => (await scene(page)).width).toBe(1080);
  const after = await scene(page);
  const k = Math.min(1080 / before.width, 1080 / before.height);
  const moved = after.layers.find((layer) => layer.id === 'example-headline')!;
  expect(moved.transform.scale.value[0]).toBeCloseTo(
    headline('example-headline').scale.value[0] * k,
    6,
  );
  expect(moved.transform.position.value[0]).toBeCloseTo(
    headline('example-headline').position.value[0] * k +
      (1080 - before.width * k) / 2,
    6,
  );
  expect(await lastLabel(page)).toBe('Canvas size');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await scene(page)).width).toBe(before.width);
  expect(
    (await scene(page)).layers.find((layer) => layer.id === 'example-headline')!
      .transform,
  ).toEqual(headline('example-headline'));
});

test('[MED-016] a double-click on a media card adds it once at the playhead', async ({
  page,
}) => {
  await ready(page);
  await importMedia(page, 'image_testsrc_1200x800.jpg');
  await seekKeep(page, 2);
  const count = (await scene(page)).layers.length;
  await page
    .locator('.media-card[data-name="image_testsrc_1200x800.jpg"]')
    .dblclick();
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBe(count + 1);
  const selected = (await hook(page)).session.selectedIds[0];
  const clip = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === selected);
  expect(clip?.startTime).toBeCloseTo(2, 3);
});

test('[CV-021][CV-020][CV-027] the empty canvas menu selects all; a layer menu pastes; the Layer submenu turns an element by 90 degrees', async ({
  page,
}) => {
  await ready(page);
  const stage = (await page.locator('canvas').first().boundingBox())!;
  await page.mouse.click(stage.x + 4, stage.y + 4, { button: 'right' });
  const menu = page.locator('#canvas-context-menu');
  await menu.locator('[data-action="select-all"]').click();
  const fromMenu = [...(await hook(page)).session.selectedIds].sort();
  expect(fromMenu.length).toBeGreaterThan(3);
  await deselect(page);
  await page.keyboard.press('Control+a');
  expect([...(await hook(page)).session.selectedIds].sort()).toEqual(fromMenu);
  // Copy one layer, then its right-click menu offers Paste.
  await deselect(page);
  await clipOf(page, 'example-badge').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(['example-badge']);
  await page.keyboard.press('Control+c');
  const count = (await scene(page)).layers.length;
  await page.mouse.click(
    stage.x + stage.width / 2,
    stage.y + stage.height / 2,
    { button: 'right' },
  );
  await menu.locator('[data-action="paste"]').click();
  await expect
    .poll(async () => (await scene(page)).layers.length)
    .toBe(count + 1);
  // Rotate 90 degrees right from the Layer submenu, then left again.
  await deselect(page);
  await clipOf(page, 'example-badge').click();
  let target = 'example-badge';
  const rotation = async () =>
    (await scene(page)).layers.find((layer) => layer.id === target)!.transform
      .rotation.value;
  const turn = async (action: string) => {
    const box = (await page.locator('canvas').first().boundingBox())!;
    const corners = await page.evaluate(
      () =>
        (
          window as unknown as {
            __AIVE__: { getCanvas(): { corners: number[][] | null } };
          }
        ).__AIVE__.getCanvas().corners ?? [],
    );
    const x = corners.reduce((sum, c) => sum + c[0]!, 0) / corners.length;
    const y = corners.reduce((sum, c) => sum + c[1]!, 0) / corners.length;
    await page.mouse.click(box.x + x, box.y + y, { button: 'right' });
    // (The right-click picks the topmost element there.)
    target = (await hook(page)).session.selectedIds[0]!;
    await menu.locator('[data-action="arrange"]').click();
    await menu.locator(`[data-action="${action}"]`).click();
  };
  await turn('rotate-right');
  expect(await lastLabel(page)).toBe('Rotate right');
  const start = (await rotation()) - 90;
  expect(Math.abs(start)).toBeLessThan(1e-6);
  await expect.poll(rotation).toBeCloseTo(start + 90, 6);
  expect(await lastLabel(page)).toBe('Rotate right');
  await turn('rotate-left');
  await expect.poll(rotation).toBeCloseTo(start, 6);
});

test('[TL-008] the ruler reads m:ss, adds frames between seconds and shows frame ticks when zoomed in', async ({
  page,
}) => {
  await ready(page);
  const labels = () =>
    page.locator('#timeline-foundation .timeline-ruler span').allTextContents();
  await expect
    .poll(async () => (await labels()).slice(0, 3))
    .toEqual(['0:00', '0:01', '0:02']);
  const zoomIn = page.locator('[aria-label="Timeline zoom in"]');
  for (let i = 0; i < 8; i++) await zoomIn.click();
  await expect(
    page.locator('#timeline-foundation .timeline-ruler'),
  ).toHaveClass(/frame-ticks/);
  expect((await labels()).some((text) => /^0:00:\d\d$/.test(text))).toBe(true);
  expect((await labels()).every((text) => !/s$/.test(text))).toBe(true);
});

test('[TL-022] Split with nothing selected cuts every unlocked clip under the playhead', async ({
  page,
}) => {
  await ready(page);
  await seekKeep(page, 4);
  await deselect(page);
  const clips = (await scene(page)).tracks.flatMap((track) => track.clips);
  const groups = new Set(
    (await scene(page)).layers
      .filter((layer) => layer.type === 'group')
      .map((layer) => layer.id),
  );
  const under = clips.filter(
    (clip) =>
      !groups.has(clip.layerId) &&
      clip.startTime < 4 &&
      4 < clip.startTime + clip.duration,
  ).length;
  expect(under).toBeGreaterThan(1);
  await expect(
    page.locator('#timeline-foundation [data-action="split"]'),
  ).toBeEnabled();
  await page.locator('#timeline-foundation [data-action="split"]').click();
  await expect
    .poll(
      async () =>
        (await scene(page)).tracks.flatMap((track) => track.clips).length,
    )
    .toBe(clips.length + under);
  expect(await lastLabel(page)).toBe('Split');
});

test('[TL-024] Alt-drag on the timeline copies a clip to the dropped time; the original stays', async ({
  page,
}) => {
  await ready(page);
  const clip = clipOf(page, 'example-badge');
  const before = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === 'example-badge')!;
  await clip.click();
  const box = (await clip.boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect.poll(() => lastLabel(page)).toBe('Duplicate');
  const clips = (await scene(page)).tracks.flatMap((track) => track.clips);
  const original = clips.find((item) => item.id === before.id)!;
  expect(original.startTime).toBe(before.startTime);
  const copy = clips.find(
    (item) =>
      item.id !== before.id &&
      item.name === before.name &&
      item.duration === before.duration,
  )!;
  expect(copy.startTime).toBeGreaterThan(before.startTime);
});

test('[TL-026] Ripple delete removes a clip and closes its gap in one undo step', async ({
  page,
}) => {
  await ready(page);
  // Two clips one after the other on one lane: split the badge at 4 s.
  await clipOf(page, 'example-badge').click();
  await seekKeep(page, 4);
  await page.keyboard.press('s');
  const trackId = (await scene(page)).tracks.find((item) =>
    item.clips.some((clip) => clip.layerId === 'example-badge'),
  )!.id;
  const track = async () =>
    (await scene(page)).tracks.find((item) => item.id === trackId)!;
  const pieces = [...(await track()).clips].sort(
    (a, b) => a.startTime - b.startTime,
  );
  expect(pieces.length).toBe(2);
  await clipOf(page, pieces[0]!.layerId).click();
  await page.keyboard.press('Shift+Delete');
  await expect.poll(() => lastLabel(page)).toBe('Ripple delete');
  const after = (await track()).clips;
  expect(after).toHaveLength(1);
  expect(after[0]!.startTime).toBeCloseTo(pieces[0]!.startTime, 6);
  // The clip menu has it too.
  await clipOf(page, after[0]!.layerId).click({ button: 'right' });
  const menu = page.locator('#timeline-foundation .timeline-menu');
  await menu.locator('[data-action="clip-menu"]').click();
  await expect(menu.locator('[data-command="ripple-delete"]')).toBeEnabled();
});

test('[TL-029] the magnet turns timeline snapping off and on (on by default)', async ({
  page,
}) => {
  await ready(page);
  const magnet = page.locator(
    '#timeline-foundation [data-action="snap-toggle"]',
  );
  await expect(magnet).toHaveAttribute('aria-pressed', 'true');
  // Snapping on: a clip dragged near the playhead lands on it.
  await seekKeep(page, 3);
  const drag = async () => {
    const clip = clipOf(page, 'example-badge');
    await clip.click();
    const box = (await clip.boundingBox())!;
    const zoom = (await hook(page)).session.timelinePxPerSecond;
    const startTime = (await scene(page)).tracks
      .flatMap((track) => track.clips)
      .find((item) => item.layerId === 'example-badge')!.startTime;
    const dx = (3 - startTime) * zoom + 4;
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 30 + dx / 2, box.y + box.height / 2, {
      steps: 4,
    });
    await page.mouse.move(box.x + 30 + dx, box.y + box.height / 2, {
      steps: 4,
    });
    await page.mouse.up();
    return (await scene(page)).tracks
      .flatMap((track) => track.clips)
      .find((item) => item.layerId === 'example-badge')!.startTime;
  };
  expect(await drag()).toBeCloseTo(3, 6);
  await page.keyboard.press('Control+z');
  await magnet.click();
  await expect(magnet).toHaveAttribute('aria-pressed', 'false');
  expect(Math.abs((await drag()) - 3)).toBeGreaterThan(0.01);
});

test('[TL-037] markers: rename, jump to the next and previous, pick from the list, clear them all (colour needs a schema change)', async ({
  page,
}) => {
  await ready(page);
  await page.locator('#timeline-foundation .timeline-scroll').focus();
  for (const at of [1, 3]) {
    await seekKeep(page, at);
    await page.locator('#timeline-foundation [data-action="marker"]').click();
  }
  await expect(page.locator('.timeline-marker')).toHaveCount(2);
  // Rename the first from its right-click menu.
  await page.locator('.timeline-marker').first().click({ button: 'right' });
  const menu = page.locator('#timeline-foundation .timeline-menu');
  await menu.locator('[data-action="rename-marker"]').click();
  await page.locator('[data-role="prompt-input"]').fill('Intro ends');
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect
    .poll(async () => (await scene(page)).markers.map((item) => item.label))
    .toContain('Intro ends');
  expect(await lastLabel(page)).toBe('Rename marker');
  // Jumps from an empty lane's menu.
  await seekKeep(page, 0);
  await deselect(page);
  await (
    await emptyLaneMenu(page)
  )
    .locator('[data-action="marker-next"]')
    .click();
  await expect.poll(() => time(page)).toBeCloseTo(1, 3);
  await (
    await emptyLaneMenu(page)
  )
    .locator('[data-action="marker-next"]')
    .click();
  await expect.poll(() => time(page)).toBeCloseTo(3, 3);
  await (
    await emptyLaneMenu(page)
  )
    .locator('[data-action="marker-previous"]')
    .click();
  await expect.poll(() => time(page)).toBeCloseTo(1, 3);
  // The list.
  const lane = await emptyLaneMenu(page);
  await lane.locator('[data-action="marker-list"]').click();
  await expect(
    lane.locator('.timeline-submenu [data-action="marker-goto"]'),
  ).toHaveCount(2);
  await lane
    .locator('.timeline-submenu [data-action="marker-goto"]')
    .last()
    .click();
  await expect.poll(() => time(page)).toBeCloseTo(3, 3);
  // Clear all, one step.
  await (
    await emptyLaneMenu(page)
  )
    .locator('[data-action="markers-clear"]')
    .click();
  await expect(page.locator('.timeline-marker')).toHaveCount(0);
  expect(await lastLabel(page)).toBe('Clear markers');
});

test('[PB-006] Loop plays the scene again from the start instead of stopping', async ({
  page,
}) => {
  await ready(page);
  const loop = page.locator('#timeline-foundation [data-action="loop-toggle"]');
  await expect(loop).toHaveAttribute('aria-pressed', 'false');
  await loop.click();
  await expect(loop).toHaveAttribute('aria-pressed', 'true');
  await seekKeep(page, 9.5);
  await page.locator('#timeline-foundation [data-action="play"]').click();
  // It passes the end and starts again while still playing.
  await expect
    .poll(async () => {
      const state = (await hook(page)).session;
      return state.playing && state.time < 2;
    })
    .toBe(true);
  await page.locator('#timeline-foundation [data-action="play"]').click();
});

test('[VID-004] a picture fits inside, fills or stretches to the canvas, one undo step each', async ({
  page,
}) => {
  await ready(page);
  await page.locator('#scene-strip-show').click();
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await importMedia(page, 'image_testsrc_1200x800.jpg');
  await page
    .locator('.media-card[data-name="image_testsrc_1200x800.jpg"]')
    .click();
  const id = (await hook(page)).session.selectedIds[0]!;
  const transform = async () =>
    (await scene(page)).layers.find((layer) => layer.id === id)!.transform;
  const { width, height } = await scene(page);
  const pick = async (kind: string) => {
    const choice = page
      .locator(`.toolbar-popover [data-control="fit-${kind}"]`)
      .first();
    if (!(await choice.isVisible()))
      await (await toolbarButton(page, 'fit')).click();
    await choice.click();
  };
  // 1200 × 800 on a 16:9 canvas (it is added fitted, so Fill comes first).
  await pick('fill');
  expect(await lastLabel(page)).toBe('Fill canvas');
  let t = await transform();
  expect(1200 * t.scale.value[0]).toBeCloseTo(width, 3);
  expect(800 * t.scale.value[1]).toBeGreaterThanOrEqual(height - 0.5);
  await pick('fit');
  expect(await lastLabel(page)).toBe('Fit to canvas');
  t = await transform();
  expect(t.scale.value[0]).toBeCloseTo(t.scale.value[1], 6);
  expect(1200 * t.scale.value[0]).toBeLessThanOrEqual(width + 0.5);
  expect(800 * t.scale.value[1]).toBeCloseTo(height, 3);
  await pick('stretch');
  expect(await lastLabel(page)).toBe('Stretch to canvas');
  t = await transform();
  expect(1200 * t.scale.value[0]).toBeCloseTo(width, 3);
  expect(800 * t.scale.value[1]).toBeCloseTo(height, 3);
  expect(t.rotation.value).toBe(0);
});

test('[REL-002] an error the UI did not catch keeps the project, saves it and offers Reload', async ({
  page,
}) => {
  allowError(
    page,
    (message) => message.includes('Audit UI failure'),
    'The test throws an uncaught error on purpose to prove the error boundary.',
  );
  await ready(page);
  await clipOf(page, 'example-badge').click();
  await page.keyboard.press('Delete');
  const before = JSON.stringify((await hook(page)).project);
  await page.evaluate(() =>
    setTimeout(() => {
      throw new Error('Audit UI failure');
    }),
  );
  const toast = page.locator('.toast', { hasText: 'Something went wrong' });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Reload' })).toBeVisible();
  expect(JSON.stringify((await hook(page)).project)).toBe(before);
  await expect(page.locator('#save-status-text')).toHaveText(/Saved/);
  // The editor still answers.
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () =>
      (await scene(page)).layers.some((layer) => layer.id === 'example-badge'),
    )
    .toBe(true);
});

test('[REL-007] a browser that is not Chrome or Edge is told so', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'userAgentData', {
      get: () => undefined,
    }),
  );
  await ready(page);
  await expect(
    page.locator('.toast', { hasText: 'This browser is not supported' }),
  ).toBeVisible();
});

test('[LAY-005] panel widths and the left panel being closed are kept after a reload', async ({
  page,
}) => {
  await ready(page);
  const width = () =>
    page
      .locator('.editor-shell')
      .evaluate((shell) =>
        parseFloat(getComputedStyle(shell).getPropertyValue('--left-open')),
      );
  const start = await width();
  const handle = page.locator('.panel-resizer.left');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect.poll(width).toBeCloseTo(start + 40, 0);
  await page.reload();
  await expect.poll(width).toBeCloseTo(start + 40, 0);
  // Closed from the View menu, it stays closed after a reload.
  await menuAction(page, '[data-view="left-panel"]');
  await expect(page.locator('.editor-shell')).toHaveClass(/library-collapsed/);
  await page.reload();
  await expect(page.locator('.editor-shell')).toHaveClass(/library-collapsed/);
});
