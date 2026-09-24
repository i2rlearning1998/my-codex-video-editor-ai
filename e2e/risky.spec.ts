import type { Page } from '@playwright/test';
import { test, expect, hook, toScreen, rulerBox } from './fixtures';

// W2-C: browser proof for the "risky" Claimed Wave 2 items.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

const clipEl = (page: Page, id: string) =>
  page.locator(`.timeline-clip[data-clip-id="${id}"]`);
async function layer(page: Page, id: string): Promise<any> {
  const visit = (layers: readonly any[]): any =>
    layers.reduce(
      (found, item) => found ?? (item.id === id ? item : visit(item.children)),
      undefined,
    );
  return JSON.parse(
    JSON.stringify(visit((await hook(page)).project.compositions[0]!.layers)),
  );
}
async function clipRow(page: Page, id: string) {
  const project = (await hook(page)).project;
  for (const composition of project.compositions)
    for (const track of composition.tracks)
      for (const clip of track.clips)
        if (clip.id === id)
          return { ...JSON.parse(JSON.stringify(clip)), trackId: track.id };
  return undefined;
}
async function isBackground(page: Page, x: number, y: number) {
  const point = await toScreen(page, x, y);
  const rgb = await page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, { px, py }) => {
      const box = canvas.getBoundingClientRect();
      const scale = canvas.width / box.width;
      return [
        ...canvas
          .getContext('2d')!
          .getImageData(
            Math.round((px - box.x) * scale),
            Math.round((py - box.y) * scale),
            1,
            1,
          ).data,
      ];
    },
    { px: point.x, py: point.y },
  );
  return (
    Math.abs(rgb[0]! - 240) < 6 &&
    Math.abs(rgb[1]! - 238) < 6 &&
    Math.abs(rgb[2]! - 231) < 6
  );
}
async function drag(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.mouse.up();
}
async function seek(page: Page, seconds: number) {
  const box = await rulerBox(page);
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  await page.mouse.click(box.x + seconds * zoom, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}
const field = (page: Page, name: string) =>
  page.getByRole('spinbutton', { name, exact: true });
async function setField(page: Page, name: string, value: string) {
  await field(page, name).fill(value);
  await field(page, name).press('Enter');
}

test('[HIS-002] canvas, inspector and timeline edits all undo back to the start and redo to the end', async ({
  page,
}) => {
  const initial = (await hook(page)).project;
  // Canvas gesture.
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  const badge = await toScreen(page, 150, 480);
  await drag(page, badge, 40, 20);
  // Inspector edit.
  await setField(page, 'Rotation (degrees)', '10');
  // Timeline edits: nudge, trim, marker, track lock and speed.
  await page
    .locator('.timeline-clip[data-id="example-kicker"]')
    .click({ position: { x: 30, y: 10 } });
  await page.keyboard.press('Alt+ArrowRight');
  await page.keyboard.press('Home');
  await seek(page, 4);
  await page
    .locator('.timeline-clip[data-id="example-kicker"]')
    .click({ position: { x: 30, y: 10 } });
  await page.keyboard.press(']');
  await page.getByRole('button', { name: '+ Marker' }).click();
  await page
    .locator('.timeline-track-header [data-action="track-lock"]')
    .last()
    .click();
  await page.locator('.timeline-clip[data-id="example-headline"]').click({
    button: 'right',
    position: { x: 30, y: 10 },
  });
  await page
    .locator('.timeline-menu')
    .getByRole('menuitem', { name: 'Speed ›' })
    .click();
  await page
    .locator('.timeline-menu')
    .getByRole('menuitemradio', { name: '2×' })
    .click();
  const final = (await hook(page)).project;
  const steps = (await hook(page)).history.labels.length;
  expect(steps).toBe(7);
  for (let i = 0; i < steps; i++) await page.locator('#undo').click();
  await expect(page.locator('#undo')).toBeDisabled();
  const undone = (await hook(page)).project;
  expect({ ...undone, metadata: initial.metadata }).toEqual(initial);
  for (let i = 0; i < steps; i++) await page.locator('#redo').click();
  const redone = (await hook(page)).project;
  expect({ ...redone, metadata: final.metadata }).toEqual(final);
});

test('[HIS-004] history keeps the latest 100 steps and stays responsive over a long session', async ({
  page,
}) => {
  const canvasPoint = await toScreen(page, 300, 250);
  await page.mouse.click(canvasPoint.x, canvasPoint.y); // headline, canvas focused
  const start = (await layer(page, 'example-headline')).transform.position
    .value[0];
  for (let i = 0; i < 120; i++) await page.keyboard.press('ArrowRight');
  expect(
    (await layer(page, 'example-headline')).transform.position.value[0],
  ).toBe(start + 120);
  let undos = 0;
  while ((await hook(page)).history.canUndo && undos < 200) {
    await page.keyboard.press('Control+z');
    undos++;
  }
  // Bounded: only the latest 100 steps are kept; the oldest 20 are gone for good.
  expect(undos).toBe(100);
  expect(
    (await layer(page, 'example-headline')).transform.position.value[0],
  ).toBe(start + 20);
  // Still responsive: redo works after the long session.
  await page.keyboard.press('Control+Shift+z');
  expect(
    (await layer(page, 'example-headline')).transform.position.value[0],
  ).toBe(start + 21);
});

test.describe('NLE fixture', () => {
  test.beforeEach(async ({ openFixtureProject }) => {
    await openFixtureProject('nle-example.json');
  });

  test('[TL-017] multi-selected clips move together in time and keep their relative offsets', async ({
    page,
  }) => {
    await clipEl(page, 'clip-a').click({ position: { x: 30, y: 10 } });
    await clipEl(page, 'clip-c').click({
      position: { x: 30, y: 10 },
      modifiers: ['Shift'],
    });
    const a = (await clipEl(page, 'clip-a').boundingBox())!;
    await drag(page, { x: a.x + 30, y: a.y + 10 }, 40, 0);
    const clipA = await clipRow(page, 'clip-a');
    const clipC = await clipRow(page, 'clip-c');
    expect([clipA.trackId, clipA.startTime]).toEqual(['video-1', 0.5]);
    expect([clipC.trackId, clipC.startTime]).toEqual(['video-2', 1.5]);
    expect((await hook(page)).history.labels).toEqual(['Move clip']);
  });

  test('[TL-017] multi-selected clips dragged to another track keep their track offsets', async ({
    page,
  }, testInfo) => {
    const selectBoth = async () => {
      await page.keyboard.press('Escape');
      await clipEl(page, 'clip-a').click({ position: { x: 30, y: 10 } });
      await clipEl(page, 'clip-c').click({
        position: { x: 30, y: 10 },
        modifiers: ['Shift'],
      });
      expect((await hook(page)).session.selectedIds).toHaveLength(2);
    };
    await selectBoth();
    const a = (await clipEl(page, 'clip-a').boundingBox())!;
    // Drag clip-a (Video 1) down one track while holding: both ghosts show.
    await page.mouse.move(a.x + 30, a.y + 10);
    await page.mouse.down();
    await page.mouse.move(a.x + 30, a.y + 10 + 34, { steps: 8 });
    await expect(page.locator('.timeline-clip-ghost')).toHaveCount(2);
    await expect(
      page.locator('[data-track-id="video-3"] .timeline-clip-ghost'),
    ).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('two-ghosts.png') });
    await page.mouse.up();
    // clip-c (Video 2) goes to Video 3: the one-track offset is kept.
    expect((await clipRow(page, 'clip-a')).trackId).toBe('video-2');
    expect((await clipRow(page, 'clip-c')).trackId).toBe('video-3');
    expect((await hook(page)).history.labels).toEqual(['Move clip']);
    await page.locator('#undo').click();
    expect((await clipRow(page, 'clip-a')).trackId).toBe('video-1');
    expect((await clipRow(page, 'clip-c')).trackId).toBe('video-2');
    // Two tracks down would push clip-c past the last track: no track change.
    await selectBoth();
    await drag(page, { x: a.x + 30, y: a.y + 10 }, 0, 68);
    expect((await clipRow(page, 'clip-a')).trackId).toBe('video-1');
    expect((await clipRow(page, 'clip-c')).trackId).toBe('video-2');
  });

  test('[CV-031] layers are drawn only inside their active time range', async ({
    page,
  }) => {
    // layer-b (600..1000 × 100..325) belongs to clip-b, active on [3, 5).
    await seek(page, 2.9);
    expect(await isBackground(page, 900, 300)).toBe(true);
    await page.keyboard.press('ArrowDown'); // next cut: exactly 3 s
    expect((await hook(page)).session.time).toBe(3);
    await expect.poll(() => isBackground(page, 900, 300)).toBe(false);
    await seek(page, 4.9);
    expect(await isBackground(page, 900, 300)).toBe(false);
    await page.keyboard.press('End'); // 5 s: the end is exclusive
    expect((await hook(page)).session.time).toBe(5);
    await expect.poll(() => isBackground(page, 900, 300)).toBe(true);
  });
});

test('[INS-002] editing Position X in the inspector moves the layer on the canvas in one undo step', async ({
  page,
}) => {
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  expect(await isBackground(page, 90, 470)).toBe(false);
  await setField(page, 'Position X', '400');
  expect((await layer(page, 'example-badge')).transform.position.value[0]).toBe(
    400,
  );
  await expect.poll(() => isBackground(page, 90, 470)).toBe(true);
  expect(await isBackground(page, 420, 470)).toBe(false);
  expect((await hook(page)).history.labels).toHaveLength(1);
  await page.locator('#undo').click();
  expect((await layer(page, 'example-badge')).transform.position.value[0]).toBe(
    76,
  );
});

test('[INS-003] Position Y, scale, rotation and opacity fields edit the layer and follow canvas gestures', async ({
  page,
}) => {
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  // Each field is checked right after its own edit: rotation and scale pivot
  // around the visual centre, which legitimately moves the stored position.
  const transform = async () => (await layer(page, 'example-badge')).transform;
  await setField(page, 'Position Y', '300');
  expect((await transform()).position.value[1]).toBe(300);
  await setField(page, 'Scale X', '1.5');
  expect((await transform()).scale.value[0]).toBe(1.5);
  await setField(page, 'Rotation (degrees)', '15');
  expect((await transform()).rotation.value).toBe(15);
  await setField(page, 'Opacity', '0.5');
  expect((await transform()).opacity.value).toBe(0.5);
  expect((await hook(page)).history.labels).toHaveLength(4);
  // A canvas drag shows up in the fields.
  await setField(page, 'Rotation (degrees)', '0');
  const from = await toScreen(page, 150, 330);
  await drag(page, from, 60, 0);
  const moved = (await layer(page, 'example-badge')).transform.position.value;
  expect(moved[0]).toBeGreaterThan(76);
  await expect(field(page, 'Position X')).toHaveValue(
    String(Math.round(moved[0] * 1000) / 1000),
  );
});

test('[PRJ-012] switching the active composition shows its canvas and timeline and resets selection', async ({
  page,
  openFixtureProject,
}) => {
  await openFixtureProject('two-scenes.json');
  await clipEl(page, 'clip-a').click({ position: { x: 30, y: 10 } });
  expect((await hook(page)).session.selectedIds).toEqual(['layer-a']);
  await page.locator('#composition').selectOption('scene-2');
  const session = (await hook(page)).session;
  expect(session.compositionId).toBe('scene-2');
  expect(session.selectedIds).toEqual([]);
  expect(session.time).toBe(0);
  await expect(clipEl(page, 'scene2-clip')).toBeVisible();
  await expect(clipEl(page, 'clip-a')).toHaveCount(0);
  // Scene 2's card (800..1200 × 400..625) is drawn; scene 1's clip-a is not.
  await expect.poll(() => isBackground(page, 1000, 500)).toBe(false);
  expect(await isBackground(page, 300, 200)).toBe(true);
  expect((await hook(page)).history.canUndo).toBe(false);
  await page
    .locator('#composition')
    .selectOption({ label: 'Main composition' });
  await expect(clipEl(page, 'clip-a')).toBeVisible();
  await expect.poll(() => isBackground(page, 1000, 500)).toBe(true);
});

test('[CV-011] text-width grips change the text box width and reflow without changing font size', async ({
  page,
}) => {
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  const before = await layer(page, 'example-headline');
  const grip = await toScreen(page, 76 + 730, 165 + 115);
  await drag(page, grip, -250, 0);
  const after = await layer(page, 'example-headline');
  expect(after.properties.width.value).toBeLessThan(
    before.properties.width.value,
  );
  expect(after.properties.fontSize.value).toBe(
    before.properties.fontSize.value,
  );
  expect(after.transform.scale.value).toEqual(before.transform.scale.value);
  expect(after.properties.textWrap?.value).toBe(true);
  expect((await hook(page)).history.labels).toHaveLength(1);
});

test('[CV-022] clicking inside a group selects the group; double-click selects the child; Esc exits', async ({
  page,
}, testInfo) => {
  const selected = async () => (await hook(page)).session.selectedIds;
  // The lime front card sits inside "Card arrangement" > "Front card".
  const card = await toScreen(page, 960, 300);
  await page.mouse.click(card.x, card.y);
  expect(await selected()).toEqual(['example-cards']);
  // Double-click enters one level at a time and selects the child under the pointer.
  await page.mouse.dblclick(card.x, card.y);
  expect(await selected()).toEqual(['example-front']);
  await page.mouse.dblclick(card.x, card.y);
  const leaf = (await selected())[0]!;
  expect(['example-paper', 'example-card-title']).toContain(leaf);
  await page.screenshot({ path: testInfo.outputPath('group-isolation.png') });
  // Esc steps back out one level at a time, then clears the selection.
  await page.keyboard.press('Escape');
  expect(await selected()).toEqual(['example-front']);
  await page.keyboard.press('Escape');
  expect(await selected()).toEqual(['example-cards']);
  await page.keyboard.press('Escape');
  expect(await selected()).toEqual([]);
  // A drag after a single click moves the whole group as one undo step.
  const before = (await layer(page, 'example-cards')).transform.position.value;
  await drag(page, card, 40, 0);
  const after = (await layer(page, 'example-cards')).transform.position.value;
  expect(after[0]).toBeGreaterThan(before[0]);
  expect((await hook(page)).history.labels).toHaveLength(1);
  // Clicking a layer outside the entered group leaves isolation.
  await page.mouse.dblclick(card.x + 40, card.y);
  expect(await selected()).toEqual(['example-front']);
  const headline = await toScreen(page, 300, 250);
  await page.mouse.click(headline.x, headline.y);
  expect(await selected()).toEqual(['example-headline']);
  await page.mouse.click(card.x + 40, card.y);
  expect(await selected()).toEqual(['example-cards']);
});
