import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// H1.2 (contract revision 8): resizing rotated objects. Fixture
// h1-rotated.json holds a shape, a text, a group, an image, a nested group
// (inside a group turned 12 degrees) and a horizontally flipped shape, each
// alone in its cell. For every angle the object is turned in the Inspector,
// a handle is dragged in ten pointer steps, and every step is sampled.
type Point = [number, number];
interface Debug {
  view: number[];
  corners: Point[] | null;
  selection: { id: number | string; point: Point; cursor: string }[] | null;
  chip: string | null;
}
const ANGLES = [0, 4, 30, 45, 90, 135, 200];
async function debug(page: Page): Promise<Debug> {
  return page.evaluate(() =>
    (
      window as unknown as { __AIVE__: { getCanvas(): Debug } }
    ).__AIVE__.getCanvas(),
  );
}
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Cosine of the angle at corner `i` (0 for a right angle). */
function cornerCos(corners: Point[], i: number) {
  const p = corners[i]!,
    a = corners[(i + 1) % 4]!,
    b = corners[(i + 3) % 4]!;
  const u = [a[0] - p[0], a[1] - p[1]],
    v = [b[0] - p[0], b[1] - p[1]];
  return (
    (u[0]! * v[0]! + u[1]! * v[1]!) /
    (Math.hypot(u[0]!, u[1]!) * Math.hypot(v[0]!, v[1]!))
  );
}
async function select(page: Page, id: string) {
  await page.locator(`.scene-row[data-layer-id="${id}"]`).click();
  await expect.poll(async () => (await debug(page)).corners).not.toBeNull();
}
async function rotate(page: Page, angle: number) {
  const field = page.locator('#inspector-rotation');
  await field.fill(String(angle));
  await field.press('Enter');
  await expect
    .poll(async () => Number(await field.inputValue()))
    .toBeCloseTo(angle, 3);
}
async function inspectorSize(page: Page) {
  return {
    w: Number(await page.locator('#inspector-w').inputValue()),
    h: Number(await page.locator('#inspector-h').inputValue()),
  };
}

/**
 * Drags handle `handle` outward in ten steps, checking the fixed side,
 * right angles and size growth at each step, then releases and undoes.
 */
async function dragHandle(
  page: Page,
  handle: number | 'right' | 'bottom',
  label: string,
  snapping = false,
) {
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  const before = await debug(page);
  const scale = Math.hypot(before.view[0]!, before.view[1]!);
  const corners = before.corners!;
  const start = before.selection!.find((item) => item.id === handle)!.point;
  const center: Point = [
    (corners[0]![0] + corners[2]![0]) / 2,
    (corners[0]![1] + corners[2]![1]) / 2,
  ];
  // Corners move along the diagonal; edges along the box's own axis.
  let direction: Point;
  if (typeof handle === 'number')
    direction = [start[0] - center[0], start[1] - center[1]];
  else {
    const axis =
      handle === 'right'
        ? [corners[1]![0] - corners[0]![0], corners[1]![1] - corners[0]![1]]
        : [corners[3]![0] - corners[0]![0], corners[3]![1] - corners[0]![1]];
    direction = [axis[0]!, axis[1]!];
  }
  const length = Math.hypot(...direction);
  direction = [direction[0] / length, direction[1] / length];
  const fixedIndex = typeof handle === 'number' ? (handle + 2) % 4 : 0;
  const fixed = corners[fixedIndex]!;
  const otherFixed =
    handle === 'right' ? corners[3]! : handle === 'bottom' ? corners[1]! : null;
  const page0 = { x: canvas.x + start[0], y: canvas.y + start[1] };
  await page.mouse.move(page0.x, page0.y);
  await page.mouse.down();
  let previous =
    typeof handle === 'number' ? dist(corners[0]!, corners[2]!) : 0;
  if (handle === 'right') previous = dist(corners[0]!, corners[1]!);
  if (handle === 'bottom') previous = dist(corners[0]!, corners[3]!);
  const across =
    handle === 'right'
      ? dist(corners[0]!, corners[3]!)
      : handle === 'bottom'
        ? dist(corners[0]!, corners[1]!)
        : 0;
  let last: Point[] = corners;
  // Ctrl disables snapping (revision 5), so the proof measures the pure rule.
  if (!snapping) await page.keyboard.down('Control');
  for (let step = 1; step <= 10; step++) {
    const pointer: Point = [
      start[0] + direction[0] * 6 * step,
      start[1] + direction[1] * 6 * step,
    ];
    await page.mouse.move(canvas.x + pointer[0], canvas.y + pointer[1]);
    const now = (await debug(page)).corners!;
    last = now;
    const at = `${label}, step ${step}`;
    expect(
      dist(now[fixedIndex]!, fixed),
      `${at}: fixed corner drift`,
    ).toBeLessThan(0.5);
    if (otherFixed)
      expect(
        dist(now[handle === 'right' ? 3 : 1]!, otherFixed),
        `${at}: fixed edge drift`,
      ).toBeLessThan(0.5);
    for (let i = 0; i < 4; i++)
      expect(
        Math.abs(cornerCos(now, i)),
        `${at}: corner ${i} square`,
      ).toBeLessThan(1e-3);
    const size =
      typeof handle === 'number'
        ? dist(now[0]!, now[2]!)
        : handle === 'right'
          ? dist(now[0]!, now[1]!)
          : dist(now[0]!, now[3]!);
    expect(size, `${at}: size grows`).toBeGreaterThan(previous);
    previous = size;
    if (typeof handle === 'number') {
      // The dragged corner lands on the pointer (it moves along the diagonal).
      expect(
        dist(now[handle]!, pointer),
        `${at}: corner follows the pointer`,
      ).toBeLessThan(1);
    } else {
      expect(
        Math.abs(
          (handle === 'right'
            ? dist(now[0]!, now[3]!)
            : dist(now[0]!, now[1]!)) - across,
        ),
        `${at}: one axis only`,
      ).toBeLessThan(0.5);
    }
    // A live size chip shows W x H while resizing.
    expect((await debug(page)).chip, `${at}: size chip`).toMatch(/^\d+ × \d+$/);
  }
  await page.mouse.up();
  if (!snapping) await page.keyboard.up('Control');
  const after = (await debug(page)).corners!;
  for (let i = 0; i < 4; i++)
    expect(
      dist(after[i]!, last[i]!),
      `${label}: no jump on release`,
    ).toBeLessThan(0.5);
  expect((await debug(page)).chip).toBeNull();
  const { w, h } = await inspectorSize(page);
  expect(
    Math.abs(w - dist(after[0]!, after[1]!) / scale),
    `${label}: Inspector W`,
  ).toBeLessThan(0.1);
  expect(
    Math.abs(h - dist(after[0]!, after[3]!) / scale),
    `${label}: Inspector H`,
  ).toBeLessThan(0.1);
  await page.locator('#undo').click();
}

test.beforeEach(async ({ page, openFixtureProject }, testInfo) => {
  await page.goto('/');
  if (!testInfo.title.includes('template'))
    await openFixtureProject('h1-rotated.json');
});

test('[CV-049] the template Front card (4 degrees in the world) resizes smoothly from every corner with snapping on', async ({
  page,
}) => {
  await select(page, 'example-front');
  for (const handle of [0, 1, 2, 3])
    await dragHandle(page, handle, `Front card, handle ${handle}`, true);
  await select(page, 'example-cards');
  for (const handle of [0, 2])
    await dragHandle(page, handle, `Card arrangement, handle ${handle}`, true);
});

const CASES: [string, string, (number | 'right' | 'bottom')[]][] = [
  ['shape', 'h1-rect', [2, 0, 'right', 'bottom']],
  ['text', 'h1-text', [2, 1]],
  ['group', 'h1-group', [2, 3]],
  ['image', 'h1-image', [2, 'right']],
  ['nested group', 'h1-nested', [2, 0]],
  ['flipped shape', 'h1-flip', [2, 'right']],
];
for (const [kind, id, handles] of CASES)
  test(`[CV-049] a rotated ${kind} resizes from its handles: the opposite side stays put, corners stay square, the size follows the pointer`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await select(page, id);
    for (const angle of ANGLES) {
      await rotate(page, angle);
      for (const handle of handles)
        await dragHandle(
          page,
          handle,
          `${kind} at ${angle}°, handle ${handle}`,
        );
    }
  });

test('[CV-049] resize cursors turn with the object and rotating shows an angle chip', async ({
  page,
}) => {
  await select(page, 'h1-rect');
  const cursorOf = async (id: number | string) =>
    (await debug(page)).selection!.find((item) => item.id === id)!.cursor;
  expect(await cursorOf('right')).toBe('ew-resize');
  await rotate(page, 90);
  expect(await cursorOf('right')).toBe('ns-resize');
  await rotate(page, 45);
  expect(await cursorOf('right')).toBe('nwse-resize');
  expect(await cursorOf(0)).toBe('ns-resize');
  // The angle chip follows a rotate drag.
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  const handle = (await debug(page)).selection!.find(
    (item) => item.id === 'rotate',
  )!.point;
  await page.mouse.move(canvas.x + handle[0], canvas.y + handle[1]);
  await page.mouse.down();
  await page.mouse.move(canvas.x + handle[0] + 40, canvas.y + handle[1] + 10, {
    steps: 5,
  });
  await expect.poll(async () => (await debug(page)).chip).toMatch(/^-?\d+°$/);
  await page.mouse.up();
  await expect.poll(async () => (await debug(page)).chip).toBeNull();
});
