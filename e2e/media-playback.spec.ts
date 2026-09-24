import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, hook, artboard } from './fixtures';

// W4-B: decoded video and images on the canvas and in playback.
// frame-code.json: 1280x720 composition at 30 fps, background #f0eee7. Video 1 holds
// clip-code (1..4 s, source 0.5..3.5 s) of video_frame_code_320x180_4s.webm at scale 4
// from (0, 0). Each source frame shows its number in binary: blocks 0-6 (40 px wide,
// y 40..140) are white when their bit is set, block 7 is always grey.
const MEDIA = 'tests/fixtures/media';
const CODE = 'video_frame_code_320x180_4s.webm';
const fixture = (name: string) => path.resolve(MEDIA, name);

interface Transform {
  position: [number, number];
  rotation: number;
  scale: [number, number];
}
const FULL: Transform = { position: [0, 0], rotation: 0, scale: [4, 4] };

async function importFiles(page: Page, names: string[]) {
  await page.locator('[data-category="Media"]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(names.map(fixture));
  await expect(page.locator('#media-import')).toBeHidden();
}
/** Composition point → canvas device pixel RGB, for several points at once. */
async function pixels(page: Page, points: [number, number][]) {
  const board = await boardOf(page);
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, { points, board }) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = canvas.width / rect.width;
      const context = canvas.getContext('2d')!;
      return points.map(([x, y]) => {
        const px = Math.round((board.x + x * board.scale - rect.x) * ratio);
        const py = Math.round((board.y + y * board.scale - rect.y) * ratio);
        const [r, g, b] = context.getImageData(px, py, 1, 1).data;
        return [r!, g!, b!] as [number, number, number];
      });
    },
    { points, board },
  );
}
let cachedBoard: { x: number; y: number; scale: number } | null = null;
async function boardOf(page: Page) {
  if (!cachedBoard)
    throw new Error('Measure the artboard at a time with no video');
  void page;
  return cachedBoard;
}
/** Local frame-code point → composition point under a layer transform. */
function place(t: Transform, x: number, y: number): [number, number] {
  const angle = (t.rotation * Math.PI) / 180;
  const sx = t.scale[0] * x,
    sy = t.scale[1] * y;
  return [
    t.position[0] + Math.cos(angle) * sx - Math.sin(angle) * sy,
    t.position[1] + Math.sin(angle) * sx + Math.cos(angle) * sy,
  ];
}
/** Decodes the frame number drawn by a frame-code layer, or null if not drawn. */
async function readCode(page: Page, t: Transform = FULL) {
  const points = [...Array(8).keys()].map((block) =>
    place(t, block * 40 + 20, 90),
  );
  const colours = await pixels(page, points);
  const grey = colours[7]!;
  if (!grey.every((value) => value > 90 && value < 170)) return null;
  return colours
    .slice(0, 7)
    .reduce((code, [r], bit) => code + (r > 128 ? 1 << bit : 0), 0);
}
/** Source frame shown at composition frame k for clip-code (source = t - 0.5). */
const expected = (k: number) => k - 15;

async function seek(page: Page, seconds: number) {
  const box = (await page.locator('.timeline-ruler').boundingBox())!;
  await page.mouse.click(box.x + seconds * 80, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}
const frameNow = async (page: Page) =>
  Math.round((await hook(page)).session.time * 30);
const clipEl = (page: Page, id: string) =>
  page.locator(`.timeline-clip[data-clip-id="${id}"]`);
async function clipMenu(page: Page, id: string, item: string, radio?: string) {
  await clipEl(page, id).click({ button: 'right', position: { x: 20, y: 10 } });
  const menu = page.locator('.timeline-menu');
  if (radio) {
    await menu.getByRole('menuitem', { name: item }).click();
    await menu.getByRole('menuitemradio', { name: radio }).click();
  } else
    await menu
      .locator('[role^="menuitem"]')
      .filter({ hasText: new RegExp(`^${item}$`) })
      .click();
}
const clipRow = async (page: Page, id: string) =>
  (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((clip) => clip.id === id)!;

test.beforeEach(async ({ page, openFixtureProject }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await openFixtureProject('frame-code.json');
  // At 0 s the video is inactive, so the whole artboard is visible to measure.
  cachedBoard = await artboard(page);
  // A fresh browser has no bytes: importing the same file restores them (D-052).
  await importFiles(page, [CODE]);
  // The filmstrip arrives in the background and redraws the timeline; wait for it
  // so later clip measurements are not taken from a replaced element.
  await expect(
    clipEl(page, 'clip-code').locator('.clip-filmstrip-tile').first(),
  ).toBeVisible();
});

test('[VID-001] seeking, frame steps, split and trim show the exact source frame', async ({
  page,
}, testInfo) => {
  await seek(page, 1.5);
  await expect.poll(() => readCode(page)).toBe(expected(45));
  await page.screenshot({ path: testInfo.outputPath('frame-code.png') });
  // Frame steps in the timeline: one frame, then ten.
  for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowRight');
  expect(await frameNow(page)).toBe(48);
  await expect.poll(() => readCode(page)).toBe(expected(48));
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => readCode(page)).toBe(expected(58));
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => readCode(page)).toBe(expected(57));
  // First and last frames of the clip.
  await seek(page, 1);
  await expect.poll(() => readCode(page)).toBe(expected(30));
  await seek(page, 3.9);
  for (let step = 0; step < 2; step++) await page.keyboard.press('ArrowRight');
  expect(await frameNow(page)).toBe(119);
  await expect.poll(() => readCode(page)).toBe(expected(119));
  // Split at 2 s: the two halves continue frame by frame.
  await clipEl(page, 'clip-code').click({ position: { x: 20, y: 10 } });
  await seek(page, 2);
  await page.keyboard.press('s');
  await expect.poll(() => readCode(page)).toBe(expected(60));
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => readCode(page)).toBe(expected(59));
  // Trim the start to the playhead at 1.5 s: the new first frame is the new in point.
  await seek(page, 1.5);
  await clipEl(page, 'clip-code').click({ position: { x: 45, y: 10 } });
  await page.keyboard.press('[');
  const trimmed = await clipRow(page, 'clip-code');
  expect([trimmed.startTime, trimmed.sourceIn]).toEqual([1.5, 1]);
  await expect.poll(() => readCode(page)).toBe(30);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => readCode(page)).toBe(null);
});

test('[PB-009] playback keeps real time and tracks the clock; paused shows the exact frame; a stalled decoder shows Buffering', async ({
  page,
}) => {
  await seek(page, 1);
  await expect.poll(() => readCode(page)).toBe(expected(30));
  const started = Date.now();
  await page.locator('[data-action="play"]').click();
  const samples: [number, number | null][] = [];
  await expect
    .poll(
      async () => {
        const frame = await frameNow(page);
        samples.push([frame, await readCode(page)]);
        return frame;
      },
      { intervals: [50] },
    )
    .toBeGreaterThanOrEqual(90);
  const elapsed = (Date.now() - started) / 1000;
  await page.locator('[data-action="play"]').click();
  // About two seconds of timeline in about two seconds of wall time.
  expect(elapsed).toBeGreaterThan(1.6);
  expect(elapsed).toBeLessThan(3.5);
  // While playing, the drawn frame follows the clock (within a few frames).
  const drawn = samples.filter(([, code]) => code !== null);
  expect(drawn.length).toBeGreaterThan(3);
  for (const [frame, code] of drawn)
    expect(Math.abs(code! - expected(frame))).toBeLessThanOrEqual(4);
  // Paused: the exact frame for the paused time.
  const paused = await frameNow(page);
  await expect.poll(() => readCode(page)).toBe(expected(paused));
  // A decoder with no current frame shows the buffering indicator while playing.
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      'readyState',
    )!;
    const flags = window as unknown as { __stall: boolean };
    flags.__stall = true;
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get() {
        return flags.__stall ? 1 : descriptor.get!.call(this);
      },
    });
  });
  await seek(page, 1.2);
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('#buffering-indicator')).toBeVisible();
  await expect(page.locator('#buffering-indicator')).toHaveText('Buffering…');
  await page.evaluate(() => {
    (window as unknown as { __stall: boolean }).__stall = false;
  });
  await expect(page.locator('#buffering-indicator')).toBeHidden();
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('#buffering-indicator')).toBeHidden();
});

test('[VID-010] a 2x clip shows every second source frame, paused and playing', async ({
  page,
}) => {
  await clipMenu(page, 'clip-code', 'Speed ›', '2×');
  expect((await clipRow(page, 'clip-code')).duration).toBe(1.5);
  // Source = 0.5 + 2 (t - 1): frame k shows 15 + 2 (k - 30).
  await seek(page, 1.5);
  await expect.poll(() => readCode(page)).toBe(45);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => readCode(page)).toBe(47);
  await seek(page, 1);
  await page.locator('[data-action="play"]').click();
  const samples: [number, number | null][] = [];
  await expect
    .poll(
      async () => {
        const frame = await frameNow(page);
        samples.push([frame, await readCode(page)]);
        return frame;
      },
      { intervals: [50] },
    )
    .toBeGreaterThanOrEqual(66);
  await page.locator('[data-action="play"]').click();
  const drawn = samples.filter(([frame, code]) => code !== null && frame < 74);
  expect(drawn.length).toBeGreaterThan(2);
  for (const [frame, code] of drawn)
    expect(Math.abs(code! - (15 + 2 * (frame - 30)))).toBeLessThanOrEqual(8);
});

test('[VID-011] a reversed clip shows descending source frames', async ({
  page,
}) => {
  await clipMenu(page, 'clip-code', 'Reverse');
  // Source = 3.5 - (t - 1): frame k shows 134 - k.
  await seek(page, 1);
  await expect.poll(() => readCode(page)).toBe(104);
  await seek(page, 1.5);
  await expect.poll(() => readCode(page)).toBe(89);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => readCode(page)).toBe(88);
  await page.locator('[data-action="play"]').click();
  await expect
    .poll(() => frameNow(page), { intervals: [50] })
    .toBeGreaterThanOrEqual(75);
  await page.locator('[data-action="play"]').click();
  const frame = await frameNow(page);
  await expect.poll(() => readCode(page)).toBe(134 - frame);
});

test('[VID-012] a frozen clip holds the frame under the playhead for its whole length', async ({
  page,
}) => {
  await seek(page, 2);
  await clipEl(page, 'clip-code').click({ position: { x: 20, y: 10 } });
  await seek(page, 2);
  await clipMenu(page, 'clip-code', 'Freeze frame');
  for (const time of [1, 1.5, 3.5]) {
    await seek(page, time);
    await expect.poll(() => readCode(page)).toBe(expected(60));
  }
  await seek(page, 1);
  await page.locator('[data-action="play"]').click();
  await expect
    .poll(() => frameNow(page), { intervals: [50] })
    .toBeGreaterThanOrEqual(60);
  expect(await readCode(page)).toBe(expected(60));
  await page.locator('[data-action="play"]').click();
});

test('[VID-002] a video on an overlay track moves, scales and rotates on the canvas and keeps playing its frames', async ({
  page,
}, testInfo) => {
  // Move the clip onto the overlay track (Video 2), keeping its time.
  const clip = (await clipEl(page, 'clip-code').boundingBox())!;
  await page.mouse.move(clip.x + 20, clip.y + 10);
  await page.mouse.down();
  await page.mouse.move(clip.x + 20, clip.y + 10 + 34, { steps: 8 });
  await page.mouse.up();
  expect(
    (await hook(page)).project.compositions[0]!.tracks.find(
      (track) => track.id === 'video-2',
    )!.clips[0]!.id,
  ).toBe('clip-code');
  await seek(page, 1.5);
  // Make it a picture in picture: scale 1 via the inspector, then drag on the canvas.
  await page.locator('[data-category="Scene"]').click();
  await page.locator('#scene-list [data-layer-id="layer-code"]').click();
  for (const [field, value] of [
    ['Scale X', '1'],
    ['Scale Y', '1'],
  ] as const) {
    const input = page.getByRole('spinbutton', { name: field, exact: true });
    await input.fill(value);
    await input.press('Enter');
  }
  const board = cachedBoard!;
  const body = {
    x: board.x + 160 * board.scale,
    y: board.y + 90 * board.scale,
  };
  await page.mouse.move(body.x, body.y);
  await page.mouse.down();
  await page.mouse.move(
    body.x + 400 * board.scale,
    body.y + 200 * board.scale,
    {
      steps: 8,
    },
  );
  await page.mouse.up();
  // Scale up from the bottom-right corner handle (proportional).
  const corner = {
    x: board.x + 720 * board.scale,
    y: board.y + 380 * board.scale,
  };
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(
    corner.x + 160 * board.scale,
    corner.y + 90 * board.scale,
    {
      steps: 8,
    },
  );
  await page.mouse.up();
  const input = page.getByRole('spinbutton', {
    name: 'Rotation (degrees)',
    exact: true,
  });
  await input.fill('15');
  await input.press('Enter');
  const layer = (await hook(page)).project.compositions[0]!.layers.find(
    (item) => item.id === 'layer-code',
  )!;
  const transform: Transform = {
    position: layer.transform.position.value as [number, number],
    rotation: layer.transform.rotation.value as number,
    scale: layer.transform.scale.value as [number, number],
  };
  expect(transform.scale[0]).toBeGreaterThan(1.2);
  expect(transform.rotation).toBe(15);
  await expect.poll(() => readCode(page, transform)).toBe(expected(45));
  await page.screenshot({
    path: testInfo.outputPath('picture-in-picture.png'),
  });
  await page.keyboard.press('Escape');
  await page.locator('.timeline-scroll').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => readCode(page, transform)).toBe(expected(46));
});

test('[VID-005] a dropped image lasts 5 s and can be trimmed longer', async ({
  page,
}) => {
  await importFiles(page, ['image_testsrc_1200x800.jpg']);
  await page
    .locator('.media-card[data-name="image_testsrc_1200x800.jpg"]')
    .dragTo(page.locator('.timeline-track[data-track-id="video-2"]'), {
      targetPosition: { x: 40, y: 12 },
    });
  const clip = (await hook(page)).project.compositions[0]!.tracks.find(
    (track) => track.id === 'video-2',
  )!.clips[0]!;
  expect(clip.duration).toBe(5);
  const element = clipEl(page, clip.id);
  await element.click({ position: { x: 40, y: 10 } });
  const grip = element.locator('[data-trim="right"]');
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  expect((await clipRow(page, clip.id)).duration).toBeCloseTo(7, 1);
});

test('[MED-023] an EXIF-rotated photo imports and draws upright', async ({
  page,
}) => {
  const name = 'image_exif_orientation6_1600x1200.jpg';
  await importFiles(page, [name]);
  const asset = (await hook(page)).project.assets.find(
    (item) => item.name === name,
  )!;
  expect([asset.width, asset.height]).toEqual([1200, 1600]);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const board = cachedBoard!;
  await page.locator(`.media-card[data-name="${name}"]`).dragTo(canvas, {
    targetPosition: {
      x: board.x + 640 * board.scale - box.x,
      y: board.y + 360 * board.scale - box.y,
    },
  });
  const layer = (await hook(page)).project.compositions[0]!.layers.find(
    (item) => item.assetId === asset.id,
  )!;
  const t: Transform = {
    position: layer.transform.position.value as [number, number],
    rotation: 0,
    scale: layer.transform.scale.value as [number, number],
  };
  // Upright: the stored top-left red block now sits top-right, the rest is blue.
  await expect
    .poll(async () => {
      const [topRight, topLeft] = await pixels(page, [
        place(t, 1200 * 0.9, 1600 * 0.05),
        place(t, 1200 * 0.1, 1600 * 0.05),
      ]);
      return [
        topRight![0] > 180 && topRight![2] < 80,
        topLeft![2] > 180 && topLeft![0] < 80,
      ];
    })
    .toEqual([true, true]);
});

test('[MED-024] PNG and WebM transparency shows the composition behind', async ({
  page,
}, testInfo) => {
  const png = 'image_alpha_logo_512.png',
    webm = 'video_alpha_circle_vp9.webm';
  await importFiles(page, [png, webm]);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const board = cachedBoard!;
  const drop = async (name: string, x: number, y: number) => {
    await page.locator(`.media-card[data-name="${name}"]`).dragTo(canvas, {
      targetPosition: {
        x: board.x + x * board.scale - box.x,
        y: board.y + y * board.scale - box.y,
      },
    });
    const asset = (await hook(page)).project.assets.find(
      (item) => item.name === name,
    )!;
    const layer = (await hook(page)).project.compositions[0]!.layers.find(
      (item) => item.assetId === asset.id,
    )!;
    return {
      position: layer.transform.position.value as [number, number],
      rotation: 0,
      scale: layer.transform.scale.value as [number, number],
    } satisfies Transform;
  };
  const logo = await drop(png, 320, 360);
  const circle = await drop(webm, 960, 360);
  const near = (rgb: number[], target: number[], tolerance = 30) =>
    rgb.every((value, index) => Math.abs(value - target[index]!) <= tolerance);
  await expect
    .poll(async () => {
      const [logoCorner, logoCentre, circleCorner, circleCentre] = await pixels(
        page,
        [
          place(logo, 20, 20),
          place(logo, 256, 256),
          place(circle, 12, 12),
          place(circle, 160, 160),
        ],
      );
      return [
        near(logoCorner!, [240, 238, 231]),
        near(logoCentre!, [79, 70, 229]),
        near(circleCorner!, [240, 238, 231]),
        near(circleCentre!, [255, 0, 0], 60),
      ];
    })
    .toEqual([true, true, true, true]);
  await page.screenshot({ path: testInfo.outputPath('alpha.png') });
});

test('[TL-046] video clips show a filmstrip and image clips their thumbnail', async ({
  page,
}, testInfo) => {
  const tiles = clipEl(page, 'clip-code').locator('.clip-filmstrip-tile');
  // 3 s at 80 px/s is 240 px: five 48 px tiles.
  await expect(tiles).toHaveCount(5);
  const frames = await tiles.evaluateAll((items) =>
    items.map((item) => (item as HTMLElement).dataset.frame),
  );
  // Tile i starts at source 0.5 + 0.6 i of a 4 s video: sprite frame floor(1.5 + 1.8 i).
  expect(frames).toEqual(['1', '3', '5', '6', '8']);
  expect(
    await tiles
      .first()
      .evaluate((item) => getComputedStyle(item).backgroundImage),
  ).toMatch(/^url\("blob:/);
  await importFiles(page, ['image_testsrc_1200x800.jpg']);
  await page
    .locator('.media-card[data-name="image_testsrc_1200x800.jpg"]')
    .dragTo(page.locator('.timeline-track[data-track-id="video-2"]'), {
      targetPosition: { x: 40, y: 12 },
    });
  const image = (await hook(page)).project.compositions[0]!.tracks.find(
    (track) => track.id === 'video-2',
  )!.clips[0]!;
  const imageTiles = clipEl(page, image.id).locator('.clip-filmstrip-tile');
  await expect(imageTiles.first()).toBeVisible();
  expect(await imageTiles.count()).toBeGreaterThan(5);
  expect(await imageTiles.first().getAttribute('data-frame')).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('filmstrip.png') });
});
