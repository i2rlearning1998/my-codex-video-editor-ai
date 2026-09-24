import type { Page } from '@playwright/test';
import { test, expect, hook, toScreen, artboard } from './fixtures';

// W2-B proof debt: Claimed Wave 2 items proven the way a user does them.
// Example project (default load) and nle-example.json at 80 px/s, 30 fps.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

const clipEl = (page: Page, id: string) =>
  page.locator(`.timeline-clip[data-clip-id="${id}"]`);
async function clip(page: Page, id: string) {
  return (await hook(page)).project.compositions[0]!.tracks.flatMap((track) =>
    track.clips.map((item) => ({ ...item, track: track.id })),
  ).find((item) => item.id === id)!;
}
async function layer(page: Page, id: string) {
  const visit = (layers: readonly any[]): any =>
    layers.reduce(
      (found, item) => found ?? (item.id === id ? item : visit(item.children)),
      undefined,
    );
  return visit((await hook(page)).project.compositions[0]!.layers);
}
async function rulerX(page: Page, seconds: number) {
  const box = (await page.locator('.timeline-ruler').boundingBox())!;
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  return { x: box.x + seconds * zoom, y: box.y + 8 };
}
async function seek(page: Page, seconds: number) {
  const point = await rulerX(page, seconds);
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}
async function pixelIsBackground(page: Page, x: number, y: number) {
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
async function canvasClick(
  page: Page,
  x: number,
  y: number,
  modifiers: ('Shift' | 'Control')[] = [],
) {
  const point = await toScreen(page, x, y);
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.click(point.x, point.y);
  for (const key of modifiers) await page.keyboard.up(key);
}
async function drag(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
}

test.describe('timeline', () => {
  test.beforeEach(async ({ openFixtureProject }) => {
    await openFixtureProject('nle-example.json');
  });

  test('[TL-009] clicking or dragging the ruler moves the playhead and the canvas shows that time live', async ({
    page,
  }) => {
    // layer-b (600..1000 × 100..325) is only on screen from 3 s to 5 s.
    await seek(page, 1);
    expect(await pixelIsBackground(page, 900, 300)).toBe(true);
    await seek(page, 3.5);
    await expect.poll(() => pixelIsBackground(page, 900, 300)).toBe(false);
    const from = await rulerX(page, 3.5);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 2.5 * 80, from.y, { steps: 10 });
    // Still dragging: time and canvas already follow the pointer.
    await expect
      .poll(async () => (await hook(page)).session.time)
      .toBeCloseTo(1, 1);
    await expect.poll(() => pixelIsBackground(page, 900, 300)).toBe(true);
    await page.mouse.up();
  });

  test('[TL-012] zoom-in and zoom-out buttons change the horizontal time scale', async ({
    page,
  }) => {
    const width = async () =>
      (await clipEl(page, 'clip-c').boundingBox())!.width;
    expect(await width()).toBeCloseTo(3 * 80, 0);
    await page.getByRole('button', { name: 'Timeline zoom in' }).click();
    expect((await hook(page)).session.timelinePxPerSecond).toBe(100);
    expect(await width()).toBeCloseTo(3 * 100, 0);
    await page.getByRole('button', { name: 'Timeline zoom out' }).click();
    await page.getByRole('button', { name: 'Timeline zoom out' }).click();
    expect((await hook(page)).session.timelinePxPerSecond).toBe(64);
    expect(await width()).toBeCloseTo(3 * 64, 0);
  });

  test('[TL-016] dragging a clip within a track and across tracks is one undo step each', async ({
    page,
  }) => {
    const before = (await hook(page)).project;
    const c = (await clipEl(page, 'clip-c').boundingBox())!;
    await drag(page, { x: c.x + 30, y: c.y + 10 }, 80, 0);
    expect((await clip(page, 'clip-c')).startTime).toBe(2);
    expect((await hook(page)).history.labels).toEqual(['Move clip']);
    await page.locator('#undo').click();
    expect((await hook(page)).project).toEqual(before);
    await drag(page, { x: c.x + 30, y: c.y + 10 }, 0, 34);
    expect((await clip(page, 'clip-c')).track).toBe('video-3');
    expect((await hook(page)).history.labels).toEqual(['Move clip']);
    await page.locator('#undo').click();
    expect((await hook(page)).project).toEqual(before);
  });

  test('[TL-023] Ctrl+D and the Duplicate button create an independent copy', async ({
    page,
  }) => {
    const layerIds = async () =>
      (await hook(page)).project.compositions[0]!.layers.map((item) => item.id);
    await clipEl(page, 'clip-c').click({ position: { x: 30, y: 10 } });
    await page.keyboard.press('Control+d');
    const video2 = async () =>
      (await hook(page)).project.compositions[0]!.tracks[1]!.clips;
    expect(
      (await video2()).map((item) => [item.startTime, item.duration]),
    ).toEqual([
      [1, 3],
      [4, 3],
    ]);
    const copy = (await video2()).find((item) => item.id !== 'clip-c')!;
    expect(copy.layerId).not.toBe('layer-c');
    expect(await layerIds()).toContain(copy.layerId);
    // Independent: deleting the original leaves the copy and its layer intact.
    await clipEl(page, 'clip-c').click({ position: { x: 30, y: 10 } });
    await page.keyboard.press('Delete');
    expect((await video2()).map((item) => item.id)).toEqual([copy.id]);
    expect(await layerIds()).toContain(copy.layerId);
    await page.locator('#undo').click();
    await page.locator('#undo').click();
    await clipEl(page, 'clip-c').click({ position: { x: 30, y: 10 } });
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    expect(await video2()).toHaveLength(2);
  });

  test('[TL-028] clip moves land on the frame grid; snapping to the playhead shows a line', async ({
    page,
  }) => {
    // 7 px at 80 px/s is 2.6 frames: the move lands on a whole frame (3 = 0.1 s).
    const c = (await clipEl(page, 'clip-c').boundingBox())!;
    await drag(page, { x: c.x + 30, y: c.y + 10 }, 7, 0);
    const start = (await clip(page, 'clip-c')).startTime;
    expect(start).toBeCloseTo(1.1, 9);
    expect(Math.abs(start * 30 - Math.round(start * 30))).toBeLessThan(1e-6);
    await page.locator('#undo').click();
    // Near the playhead the start snaps to it and the guide line shows there.
    await seek(page, 2.3);
    const playhead = (await hook(page)).session.time;
    await page.mouse.move(c.x + 30, c.y + 10);
    await page.mouse.down();
    await page.mouse.move(c.x + 30 + 100, c.y + 10, { steps: 10 });
    const guide = page.locator('.timeline-snap');
    await expect(guide).toBeVisible();
    expect(Number(await guide.getAttribute('data-time'))).toBeCloseTo(
      playhead,
      9,
    );
    await page.mouse.up();
    expect((await clip(page, 'clip-c')).startTime).toBeCloseTo(playhead, 9);
  });

  test('[TL-035] the Marker button adds a marker at the playhead', async ({
    page,
  }) => {
    await seek(page, 1.5);
    await page.getByRole('button', { name: '+ Marker' }).click();
    const markers = (await hook(page)).project.compositions[0]!.markers;
    expect(markers.map((marker) => marker.time)).toEqual([1.5]);
    await expect(page.locator('.timeline-marker')).toHaveCount(1);
    expect((await hook(page)).history.labels).toEqual(['Marker']);
  });

  test('[PB-002] playback follows the wall clock even when frames are dropped', async ({
    page,
  }) => {
    await page
      .getByRole('button', { name: 'Play or pause', exact: true })
      .click();
    await expect
      .poll(async () => (await hook(page)).session.playing)
      .toBe(true);
    // Block the page for 700 ms: no animation frames can run meanwhile.
    await page.evaluate(() => {
      const until = performance.now() + 700;
      while (performance.now() < until) {
        /* busy */
      }
    });
    await expect
      .poll(async () => (await hook(page)).session.time, { timeout: 1000 })
      .toBeGreaterThanOrEqual(0.65);
    await page
      .getByRole('button', { name: 'Stop playback', exact: true })
      .click();
  });
});

test('[TL-014] wheel, Shift+wheel and trackpad scroll horizontally; vertical scroll keeps headers aligned', async ({
  page,
}) => {
  // The example opens with seven tracks, taller than the timeline panel.
  const scroll = page.locator('.timeline-scroll');
  const box = (await scroll.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const header = page.locator('.timeline-track-header').first();
  const headerX = (await header.boundingBox())!.x;
  const left = () => scroll.evaluate((el) => el.scrollLeft);
  await page.mouse.wheel(300, 0); // trackpad / horizontal wheel
  await expect.poll(left).toBeGreaterThan(0);
  const afterTrackpad = await left();
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 300); // Shift+wheel
  await page.keyboard.up('Shift');
  await expect.poll(left).toBeGreaterThan(afterTrackpad);
  expect((await header.boundingBox())!.x).toBeCloseTo(headerX, 0);
  await page.mouse.wheel(0, 120); // plain vertical wheel
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  const rows = page.locator('.timeline-nle-row');
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    const head = (await row.locator('.timeline-track-header').boundingBox())!;
    const lane = (await row.locator('.timeline-track').boundingBox())!;
    expect(head.y).toBeCloseTo(lane.y, 0);
    expect(head.x).toBeCloseTo(headerX, 0);
  }
});

test.describe('canvas', () => {
  test('[CV-002] Shift or Ctrl click toggles layers in the multi-selection', async ({
    page,
  }) => {
    await canvasClick(page, 300, 250); // headline
    await canvasClick(page, 300, 600, ['Shift']); // supporting line
    expect((await hook(page)).session.selectedIds).toEqual([
      'example-headline',
      'example-subtitle',
    ]);
    await canvasClick(page, 300, 250, ['Control']);
    expect((await hook(page)).session.selectedIds).toEqual([
      'example-subtitle',
    ]);
    expect((await hook(page)).history.canUndo).toBe(false);
  });

  test('[CV-003] a marquee drag on empty canvas selects the layers it touches', async ({
    page,
  }) => {
    const from = await toScreen(page, 1270, 712);
    const to = await toScreen(page, 1150, 640);
    await drag(page, from, to.x - from.x, to.y - from.y);
    expect((await hook(page)).session.selectedIds).toEqual(['example-edition']);
  });

  test('[CV-006] arrow keys nudge the selection by 1 px and Shift+arrow by 10 px', async ({
    page,
  }) => {
    await canvasClick(page, 300, 250);
    const [x, y] = (await layer(page, 'example-headline')).transform.position
      .value;
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    expect(
      (await layer(page, 'example-headline')).transform.position.value,
    ).toEqual([x + 1, y + 10]);
    expect((await hook(page)).history.labels).toHaveLength(2);
  });

  test('[CV-008] an edge handle resizes on one axis only', async ({ page }) => {
    await page.locator('#scene-list [data-layer-id="example-badge"]').click();
    const before = await layer(page, 'example-badge');
    const edge = await toScreen(page, 76 + 224, 456 + 24);
    await drag(page, edge, 40, 15);
    const after = await layer(page, 'example-badge');
    const size = (item: any) => [
      item.properties.width.value * item.transform.scale.value[0],
      item.properties.height.value * item.transform.scale.value[1],
    ];
    expect(size(after)[0]).toBeGreaterThan(224);
    expect(size(after)[1]).toBeCloseTo(48, 6);
    expect(after.transform.position.value).toEqual(
      before.transform.position.value,
    );
    expect((await hook(page)).history.labels).toHaveLength(1);
  });

  test('[CV-008] Alt+edge and Alt+corner drags resize from the center', async ({
    page,
  }, testInfo) => {
    await page.locator('#scene-list [data-layer-id="example-badge"]').click();
    const before = await layer(page, 'example-badge');
    const box = (item: any) => {
      const [x, y] = item.transform.position.value;
      const w = item.properties.width.value * item.transform.scale.value[0];
      const h = item.properties.height.value * item.transform.scale.value[1];
      return { cx: x + w / 2, cy: y + h / 2, w, h };
    };
    const start = box(before);
    // Right edge with Alt: grows on both sides, the center and height stay.
    const edge = await toScreen(page, 76 + 224, 456 + 24);
    await page.keyboard.down('Alt');
    await drag(page, edge, 40, 0);
    await page.keyboard.up('Alt');
    const wide = box(await layer(page, 'example-badge'));
    expect(wide.w).toBeGreaterThan(start.w);
    expect(wide.h).toBeCloseTo(start.h, 6);
    expect(wide.cx).toBeCloseTo(start.cx, 6);
    expect(wide.cy).toBeCloseTo(start.cy, 6);
    expect(
      (await layer(page, 'example-badge')).transform.position.value[0],
    ).toBeLessThan(76);
    await page.screenshot({ path: testInfo.outputPath('alt-center.png') });
    // A plain edge drag still keeps the opposite edge (unchanged behaviour).
    await page.locator('#undo').click();
    await drag(page, edge, 40, 0);
    expect(
      (await layer(page, 'example-badge')).transform.position.value,
    ).toEqual(before.transform.position.value);
    await page.locator('#undo').click();
    // Bottom-right corner with Alt: proportional, about the same center.
    const corner = await toScreen(page, 76 + 224, 456 + 48);
    await page.keyboard.down('Alt');
    await drag(page, corner, 30, 30);
    await page.keyboard.up('Alt');
    const big = box(await layer(page, 'example-badge'));
    expect(big.w / big.h).toBeCloseTo(start.w / start.h, 6);
    expect(big.w).toBeGreaterThan(start.w);
    expect(big.cx).toBeCloseTo(start.cx, 6);
    expect(big.cy).toBeCloseTo(start.cy, 6);
    // One gesture is one undo step.
    expect((await hook(page)).history.labels).toHaveLength(1);
  });

  test('[CV-009] the rotation handle rotates around the visual center', async ({
    page,
  }) => {
    await page.locator('#scene-list [data-layer-id="example-badge"]').click();
    const center = (item: any) => {
      const angle = (item.transform.rotation.value * Math.PI) / 180;
      const w =
        (item.properties.width.value * item.transform.scale.value[0]) / 2;
      const h =
        (item.properties.height.value * item.transform.scale.value[1]) / 2;
      const [x, y] = item.transform.position.value;
      return [
        x + w * Math.cos(angle) - h * Math.sin(angle),
        y + w * Math.sin(angle) + h * Math.cos(angle),
      ];
    };
    const before = center(await layer(page, 'example-badge'));
    const top = await toScreen(page, 76 + 112, 456);
    const middle = await toScreen(page, 76 + 112, 456 + 24);
    // The handle sits 34 screen px above the top edge; swing it to the right.
    await drag(
      page,
      { x: top.x, y: top.y - 34 },
      middle.y - top.y + 34,
      middle.y - top.y + 34,
    );
    const after = await layer(page, 'example-badge');
    expect(Math.abs(after.transform.rotation.value)).toBeGreaterThan(10);
    const moved = center(after);
    expect(moved[0]).toBeCloseTo(before[0]!, 3);
    expect(moved[1]).toBeCloseTo(before[1]!, 3);
  });

  test('[CV-016] Fit, plus and minus change the canvas view scale', async ({
    page,
  }) => {
    const fit = (await artboard(page)).scale;
    // Measured zoomed out: a zoomed-in artboard overflows the visible canvas.
    await page.locator('[data-canvas-zoom="out"]').click();
    expect((await hook(page)).session.canvasZoom).toBeCloseTo(0.8, 6);
    expect((await artboard(page)).scale).toBeCloseTo(fit * 0.8, 2);
    await page.locator('[data-canvas-zoom="in"]').click();
    await page.locator('[data-canvas-zoom="in"]').click();
    expect((await hook(page)).session.canvasZoom).toBeCloseTo(1.25, 6);
    await page.locator('[data-canvas-zoom="fit"]').click();
    expect((await hook(page)).session.canvasZoom).toBe(1);
    expect((await artboard(page)).scale).toBeCloseTo(fit, 3);
    expect((await hook(page)).history.canUndo).toBe(false);
  });
});

test.describe('layers and inspector', () => {
  test('[LYR-001] the layer list, canvas and timeline share one selection', async ({
    page,
  }) => {
    const row = (id: string) =>
      page.locator(`#scene-list [data-layer-id="${id}"]`);
    await row('example-headline').click();
    expect((await hook(page)).session.selectedIds).toEqual([
      'example-headline',
    ]);
    await expect(
      page.locator('.timeline-clip[data-id="example-headline"]'),
    ).toHaveAttribute('aria-pressed', 'true');
    await canvasClick(page, 300, 600); // supporting line on the canvas
    await expect(row('example-subtitle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(row('example-headline')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('[LYR-002] the layer list shows layers and groups in stacking order, topmost first', async ({
    page,
  }) => {
    const order: string[] = [];
    // Front-first (owner decision): later layers paint on top, so each sibling
    // level lists in reverse array order, children under their group.
    const visit = (layers: readonly any[]) =>
      [...layers].reverse().forEach((item) => {
        order.push(item.id);
        visit(item.children);
      });
    visit((await hook(page)).project.compositions[0]!.layers);
    await expect(page.locator('#scene-list [data-layer-id]')).toHaveCount(
      order.length,
    );
    expect(
      await page
        .locator('#scene-list [data-layer-id]')
        .evaluateAll((rows) =>
          rows.map((row) => (row as HTMLElement).dataset.layerId),
        ),
    ).toEqual(order);
    expect(order[0]).toBe('example-edition'); // painted last = frontmost
    const indent = async (id: string) =>
      parseFloat(
        await page
          .locator(`#scene-list [data-layer-id="${id}"]`)
          .evaluate((el) => (el as HTMLElement).style.paddingLeft),
      );
    expect(await indent('example-front')).toBeGreaterThan(
      await indent('example-cards'),
    );
  });

  test('[INS-009] the keyframe diamond toggles a keyframe for its property', async ({
    page,
  }) => {
    await page
      .locator('#scene-list [data-layer-id="example-headline"]')
      .click();
    await page.getByRole('button', { name: 'Add Position X keyframe' }).click();
    let property = (await layer(page, 'example-headline')).transform.position;
    expect(property.keyframes.map((frame: any) => frame.time)).toEqual([0]);
    expect(property.animated).toBe(true);
    await page
      .getByRole('button', { name: 'Remove Position X keyframe' })
      .click();
    property = (await layer(page, 'example-headline')).transform.position;
    expect(property.keyframes).toEqual([]);
    expect((await hook(page)).history.labels).toHaveLength(2);
  });

  test('[INS-010] the Timing section shows the selected clip start time and duration', async ({
    page,
    openFixtureProject,
  }) => {
    await openFixtureProject('nle-example.json');
    await clipEl(page, 'clip-b').click({ position: { x: 30, y: 10 } });
    await page.locator('[data-subtab="Timing"]').click();
    await expect(
      page.getByRole('spinbutton', { name: 'Start time' }),
    ).toHaveValue('3');
    await expect(
      page.getByRole('spinbutton', { name: 'Duration' }),
    ).toHaveValue('2');
  });

  test('[INS-010] regression: timing values are display-rounded after a frame nudge, stored exactly', async ({
    page,
    openFixtureProject,
  }) => {
    await openFixtureProject('nle-example.json');
    await clipEl(page, 'clip-b').click({ position: { x: 30, y: 10 } });
    await page.keyboard.press('Alt+ArrowLeft'); // one frame: 3 − 1/30 s
    await page.locator('[data-subtab="Timing"]').click();
    await expect(
      page.getByRole('spinbutton', { name: 'Start time' }),
    ).toHaveValue('2.967');
    expect((await clip(page, 'clip-b')).startTime).toBe(3 - 1 / 30);
    // Leaving the field untouched commits nothing, so the exact value survives.
    await page.getByRole('spinbutton', { name: 'Start time' }).focus();
    await page.keyboard.press('Tab');
    expect((await clip(page, 'clip-b')).startTime).toBe(3 - 1 / 30);
    expect((await hook(page)).history.labels).toEqual(['Move clip']);
  });
});
