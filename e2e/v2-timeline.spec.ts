import type { Locator, Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  menuAction,
  rulerBox,
  showCategory,
  toScreen,
} from './fixtures';

// V2 (Clipchamp clone spec 2, 2b, 2c, 3): the timeline without lane headers,
// one empty-space surface (click clears and seeks, drag draws a marquee),
// live centring, drag detents, the frame-range dim, the leading gap and
// duplicate / paste into a new lane above.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});
const scroll = (page: Page) =>
  page.locator('#timeline-foundation .timeline-scroll');
const clips = (page: Page) =>
  page.locator('#timeline-foundation .timeline-clip[data-action="clip"]');
const lanes = (page: Page) =>
  page.locator('#timeline-foundation .timeline-nle-row');
const selected = async (page: Page) => (await hook(page)).session.selectedIds;
const box = async (locator: Locator) => (await locator.boundingBox())!;
const timeAt = async (page: Page, x: number) => {
  const ruler = await rulerBox(page);
  const state = await hook(page);
  const left = await scroll(page).evaluate((element) => element.scrollLeft);
  return (x - ruler.x + 0 * left) / state.session.timelinePxPerSecond;
};
async function newProject(page: Page) {
  await menuAction(page, '#new-project');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
}
async function addShapes(page: Page, count: number) {
  await showCategory(page, 'Elements');
  for (let i = 0; i < count; i++) {
    const before = (await hook(page)).project.compositions[0]!.layers.length;
    await page.locator('[data-shape="rectangle"]').first().click();
    await expect
      .poll(
        async () => (await hook(page)).project.compositions[0]!.layers.length,
      )
      .toBe(before + 1);
  }
}
/** The lane group's top below the ruler, and what the spec formula wants. */
async function centring(page: Page) {
  return page.evaluate(() => {
    const scrollArea = document.querySelector<HTMLElement>(
      '#timeline-foundation .timeline-scroll',
    )!;
    const ruler = document.querySelector<HTMLElement>('.timeline-ruler-bar')!;
    const first =
      document.querySelector<HTMLElement>(
        '.timeline-ghost-lane[data-ghost="above"]',
      ) ?? document.querySelector<HTMLElement>('.timeline-nle-row')!;
    const all = [
      ...document.querySelectorAll<HTMLElement>(
        '.timeline-nle-row, .timeline-ghost-lane',
      ),
    ];
    const last = all.at(-1)!;
    const h =
      last.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
    const H = scrollArea.clientHeight - ruler.offsetHeight;
    const want = h + 46 <= H ? (H - h) / 2 : 23;
    const shell = document.querySelector<HTMLElement>('.editor-shell')!;
    const state = `${shell.className} ${getComputedStyle(shell).getPropertyValue('--timeline-height')} ${shell.dataset.timelineZone}`;
    const top =
      first.getBoundingClientRect().top -
      ruler.getBoundingClientRect().bottom +
      scrollArea.scrollTop;
    return { top, want, h, H, state };
  });
}

test('[TL-093] a click on any empty part of the lane area, the ruler, the canvas background or the stage clears the selection; on the lanes and the ruler it also seeks', async ({
  page,
}) => {
  await expect(page.locator('.timeline-row-header')).toHaveCount(0);
  await expect(page.locator('.timeline-outliner')).toHaveCount(0);
  const select = async () => {
    await clips(page)
      .first()
      .click({ position: { x: 20, y: 8 } });
    await expect.poll(() => selected(page)).not.toEqual([]);
  };
  const first = await box(lanes(page).first());
  const second = await box(lanes(page).nth(1));
  const clip = await box(clips(page).first());
  const area = await box(scroll(page));
  const places: [string, number, number, boolean][] = [
    [
      'right of a clip',
      clip.x + clip.width + 40,
      clip.y + clip.height / 2,
      true,
    ],
    [
      'between lanes',
      first.x + 300,
      (first.y + first.height + second.y) / 2,
      true,
    ],
    ['above the first lane', first.x + 300, first.y - 6, true],
  ];
  for (const [name, x, y, seeks] of places) {
    await select();
    await page.mouse.click(x, y);
    expect(await selected(page), name).toEqual([]);
    // The playhead stops at the scene's end.
    if (seeks)
      expect((await hook(page)).session.time, name).toBeCloseTo(
        Math.min(
          (await hook(page)).project.compositions[0]!.duration,
          await timeAt(page, x),
        ),
        1,
      );
  }
  // Below the last lane (scrolled to the end).
  await select();
  await scroll(page).evaluate(
    (element) => (element.scrollTop = element.scrollHeight),
  );
  const last = await box(lanes(page).last());
  await page.mouse.click(area.x + 300, last.y + last.height + 8);
  expect(await selected(page)).toEqual([]);
  // The ruler seeks and clears.
  await select();
  const ruler = await rulerBox(page);
  await page.mouse.click(
    ruler.x + 2 * (await hook(page)).session.timelinePxPerSecond,
    ruler.y + 8,
  );
  expect(await selected(page)).toEqual([]);
  expect((await hook(page)).session.time).toBeCloseTo(2, 1);
  // A click on a clip selects it and leaves the playhead.
  const time = (await hook(page)).session.time;
  await select();
  expect((await hook(page)).session.time).toBe(time);
  // The canvas background and the stage around it clear too.
  const corner = await toScreen(page, 1270, 710);
  await page.mouse.click(corner.x, corner.y);
  expect(await selected(page)).toEqual([]);
  await select();
  const stage = await box(page.locator('.canvas-stage'));
  await page.mouse.click(stage.x + 6, stage.y + stage.height - 6);
  expect(await selected(page)).toEqual([]);
});

test('[TL-094] a marquee from any empty point selects the clips it touches live; an empty marquee clears; it scrolls the lanes at the edge', async ({
  page,
}) => {
  const first = await box(clips(page).first());
  const lane = await box(lanes(page).first());
  const second = await box(lanes(page).nth(1));
  // From the space between the first two lanes, across both.
  const startX = first.x + first.width + 60;
  await page.mouse.move(startX, (lane.y + lane.height + second.y) / 2);
  await page.mouse.down();
  await page.mouse.move(startX - 140, second.y + second.height - 4, {
    steps: 8,
  });
  await expect(
    page.locator('#timeline-foundation .timeline-marquee'),
  ).toBeVisible();
  // Live: the clips are selected before the release.
  expect((await selected(page)).length).toBeGreaterThanOrEqual(1);
  await page.mouse.up();
  const picked = await selected(page);
  expect(picked.length).toBeGreaterThanOrEqual(1);
  // From the padding above the first lane.
  await page.mouse.move(startX, lane.y - 8);
  await page.mouse.down();
  await page.mouse.move(startX - 140, lane.y + lane.height - 4, { steps: 8 });
  await page.mouse.up();
  expect((await selected(page)).length).toBeGreaterThanOrEqual(1);
  // An empty marquee (past every clip's end) clears.
  const area = await box(scroll(page));
  const ruler = await rulerBox(page);
  const span = (await hook(page)).session.timelinePxPerSecond * 11;
  const empty = Math.min(ruler.x + span, area.x + area.width - 40);
  await page.mouse.move(empty, lane.y - 6);
  await page.mouse.down();
  await page.mouse.move(empty + 20, lane.y + 20, { steps: 4 });
  await page.mouse.up();
  expect(await selected(page)).toEqual([]);
  // Near the bottom edge the lanes scroll while the marquee is dragged.
  await page.mouse.move(startX, lane.y - 6);
  await page.mouse.down();
  await page.mouse.move(startX - 40, area.y + area.height - 4, { steps: 6 });
  await expect
    .poll(() => scroll(page).evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.mouse.up();
});

test('[TL-095] the lane group is centred by the spec formula on every frame of a resize drag, for 1, 3 and 14 lanes', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const check = async (label: string) => {
    const edge = await box(page.locator('.timeline > .panel-resizer'));
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    // Free heights above the default: up, further up, and back down a bit
    // (a resting panel below the default would collapse on a drag down).
    for (const dy of [-200, -240, -280, -230, -190]) {
      await page.mouse.move(edge.x + edge.width / 2, edge.y + dy, { steps: 2 });
      // Asserted during the drag, without a click.
      await expect
        .poll(
          async () => {
            const c = await centring(page);
            return Math.abs(c.top - c.want) > 2 ? JSON.stringify(c) : 0;
          },
          { message: label },
        )
        .toBe(0);
    }
    await page.mouse.up();
  };
  // 14 lanes: the example plus one shape.
  await addShapes(page, 1);
  await check('14 lanes');
  await newProject(page);
  await addShapes(page, 1);
  await check('1 lane');
  await addShapes(page, 2);
  await check('3 lanes');
});

test('[TL-096] dragging the timeline edge down: free, a snap at the default height, a short follow, then the collapsed player; never a half lane; back up with hysteresis', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const shell = page.locator('.editor-shell');
  const edge = await box(page.locator('.timeline > .panel-resizer'));
  const x = edge.x + edge.width / 2;
  await page.mouse.move(x, edge.y + edge.height / 2);
  await page.mouse.down();
  // Up to the maximum first.
  await page.mouse.move(x, 80, { steps: 6 });
  const states: string[] = [];
  const viewport = page.viewportSize()!;
  for (let y = 80; y <= viewport.height - 4; y += 8) {
    await page.mouse.move(x, y);
    const state = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('.editor-shell')!;
      const preview = document.querySelector('.preview-panel')!;
      return {
        collapsed: element.classList.contains('timeline-collapsed'),
        zone: element.dataset.timelineZone ?? 'free',
        preview: preview.getBoundingClientRect().height,
      };
    });
    states.push(
      state.collapsed
        ? 'collapsed'
        : state.zone === 'snapped'
          ? 'snapped'
          : 'free',
    );
    expect(state.preview).toBeGreaterThanOrEqual(160);
    if (!state.collapsed) {
      const c = await centring(page);
      expect(Math.abs(c.top - c.want)).toBeLessThanOrEqual(2);
    }
  }
  // Free, then a snapped stretch, then collapsed at the bottom.
  expect(states).toContain('snapped');
  expect(states.at(-1)).toBe('collapsed');
  const firstCollapsed = states.indexOf('collapsed');
  expect(states.slice(firstCollapsed).every((s) => s === 'collapsed')).toBe(
    true,
  );
  await page.mouse.up();
  await expect(shell).toHaveClass(/timeline-collapsed/);
  await expect(
    page.locator('#timeline-foundation .timeline-scroll'),
  ).toBeHidden();
  // Back up: it stays collapsed for the first 60 px, then expands.
  const handle = await box(page.locator('.timeline > .panel-resizer'));
  await page.mouse.move(x, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, handle.y - 30, { steps: 3 });
  await expect(shell).toHaveClass(/timeline-collapsed/);
  await page.mouse.move(x, handle.y - 260, { steps: 6 });
  await expect(shell).not.toHaveClass(/timeline-collapsed/);
  await page.mouse.up();
});

test('[TL-097] outside Start and End the ruler and lanes are dimmed from the default values, and live on every digit and wheel step', async ({
  page,
}) => {
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  const ruler = await rulerBox(page);
  const after = page.locator(
    '#timeline-foundation .ruler-range-dim[data-side="after"]',
  );
  const laneDim = page.locator(
    '#timeline-foundation .lanes-range-dim[data-side="after"]',
  );
  // Default: End is the scene's end (10 s): the dim starts exactly there.
  const duration = (await hook(page)).project.compositions[0]!.duration;
  await expect
    .poll(async () => (await box(after)).x - ruler.x)
    .toBeCloseTo(duration * zoom, 0);
  expect((await box(laneDim)).width).toBeGreaterThan(0);
  // Typing a digit moves the dim with no Enter or blur.
  const end = page.locator('#frame-end');
  await end.click();
  await end.fill('15');
  await expect
    .poll(async () => (await box(after)).x - ruler.x)
    .toBeCloseTo(0.5 * zoom, 0);
  await end.fill('150');
  await expect
    .poll(async () => (await box(after)).x - ruler.x)
    .toBeCloseTo(5 * zoom, 0);
  // A wheel step updates it too.
  await end.hover();
  await page.mouse.wheel(0, -100);
  await expect
    .poll(async () => (await box(after)).x - ruler.x)
    .not.toBeCloseTo(5 * zoom, 0);
  await page.keyboard.press('Escape');
});

test("[TL-098] a gap before a lane's first clip has the hatched ghost with its trash button; deleting it moves the clip to 0 in one step", async ({
  page,
}) => {
  await newProject(page);
  await addShapes(page, 1);
  const state = await hook(page);
  const clip = state.project.compositions[0]!.tracks.flatMap(
    (t) => t.clips,
  )[0]!;
  // Move the clip to start at 5 s through the Timing popover's field path:
  // drag it on the timeline.
  const element = clips(page).first();
  const at = await box(element);
  const zoom = state.session.timelinePxPerSecond;
  await page.mouse.move(at.x + 10, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + 10 + 5 * zoom, at.y + at.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await hook(page)).project.compositions[0]!.tracks.flatMap(
          (t) => t.clips,
        ).find((c) => c.id === clip.id)!.startTime,
    )
    .toBeGreaterThan(4);
  const gap = page.locator(
    '#timeline-foundation .timeline-gap[data-start="0"]',
  );
  await expect(gap).toBeVisible();
  const trash = gap.locator('[data-action="close-gap"]');
  await expect(trash).toHaveAttribute('title', /Delete this gap|gap/i);
  await trash.click();
  await expect
    .poll(
      async () =>
        (await hook(page)).project.compositions[0]!.tracks.flatMap(
          (t) => t.clips,
        ).find((c) => c.id === clip.id)!.startTime,
    )
    .toBe(0);
  expect((await hook(page)).history.labels.at(-1)).toBe('Close gap');
});

test('[TL-099] Duplicate and Copy / Paste put the copy on a new lane directly above, same start (paste at the playhead), selected, the playhead unchanged, the canvas the same', async ({
  page,
}) => {
  /** Keeps the canvas pixels in the page (they are large). */
  const pixels = () =>
    page
      .locator('#composition-canvas')
      .evaluate((canvas: HTMLCanvasElement) => {
        (window as unknown as { __before: Uint8ClampedArray }).__before = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
      });
  /** Pixels that differ by more than 8 in a channel from the kept ones,
   *  outside a canvas pixel rectangle (the original's box). */
  const changed = (skip: { x0: number; y0: number; x1: number; y1: number }) =>
    page
      .locator('#composition-canvas')
      .evaluate((canvas: HTMLCanvasElement, skip) => {
        const a = (window as unknown as { __before: Uint8ClampedArray })
          .__before;
        const b = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        const where: number[] = [];
        for (let i = 0; i < a.length; i += 4) {
          const x = (i / 4) % canvas.width,
            y = Math.floor(i / 4 / canvas.width);
          if (x >= skip.x0 && x <= skip.x1 && y >= skip.y0 && y <= skip.y1)
            continue;
          if (
            Math.abs(a[i]! - b[i]!) > 8 ||
            Math.abs(a[i + 1]! - b[i + 1]!) > 8 ||
            Math.abs(a[i + 2]! - b[i + 2]!) > 8
          ) {
            count++;
            if (where.length < 6) where.push(x, y);
          }
        }
        return count ? `${count} at ${where.join(',')}` : 0;
      }, skip);
  const order = async () =>
    [...(await hook(page)).project.compositions[0]!.tracks]
      .sort((a, b) => a.order - b.order)
      .map((t) => t.id);
  const clipOf = async (layerId: string) => {
    const state = await hook(page);
    for (const track of state.project.compositions[0]!.tracks)
      for (const clip of track.clips)
        if (clip.layerId === layerId) return { clip, trackId: track.id };
    return null;
  };
  await page
    .locator('#timeline-foundation .timeline-clip[data-id="example-badge"]')
    .first()
    .click({ position: { x: 20, y: 6 } });
  const original = (await clipOf('example-badge'))!;
  const time = (await hook(page)).session.time;
  // Deselected pixels, before.
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
  await pixels();
  await page
    .locator('#timeline-foundation .timeline-clip[data-id="example-badge"]')
    .first()
    .click({ position: { x: 20, y: 6 } });
  const lanesBefore = await order();
  await page.keyboard.press('Control+d');
  await expect
    .poll(async () => (await order()).length)
    .toBe(lanesBefore.length + 1);
  const copyId = (await selected(page))[0]!;
  expect(copyId).not.toBe('example-badge');
  const copy = (await clipOf(copyId))!;
  const lanesAfter = await order();
  expect(lanesAfter.indexOf(copy.trackId)).toBe(
    lanesAfter.indexOf(original.trackId) - 1,
  );
  expect(copy.clip.startTime).toBe(original.clip.startTime);
  expect((await clipOf('example-badge'))!.trackId).toBe(original.trackId);
  expect((await hook(page)).session.time).toBe(time);
  // An exact overlay: the canvas is the same (deselected); only the
  // anti-aliased edge pixels, drawn twice, may differ.
  await page.keyboard.press('Escape');
  await page.mouse.move(2, 2);
  // The copy is the original's exact overlay: same transform and look.
  const layerOf = async (id: string) =>
    (await hook(page)).project.compositions[0]!.layers.find(
      (layer) => layer.id === id,
    )!;
  const a = await layerOf('example-badge'),
    b = await layerOf(copyId);
  expect(b.transform).toEqual(a.transform);
  expect(b.properties).toEqual(a.properties);
  // Nothing outside the original's box changes on the canvas.
  const canvasBox = await box(page.locator('#composition-canvas'));
  const width = await page
    .locator('#composition-canvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.width);
  const ratio = width / canvasBox.width;
  const p0 = await toScreen(page, 76 - 8, 456 - 8),
    p1 = await toScreen(page, 76 + 224 + 8, 456 + 48 + 8);
  const skip = {
    x0: (p0.x - canvasBox.x) * ratio,
    y0: (p0.y - canvasBox.y) * ratio,
    x1: (p1.x - canvasBox.x) * ratio,
    y1: (p1.y - canvasBox.y) * ratio,
  };
  await page.waitForTimeout(300);
  expect(await changed(skip)).toBe(0);
  // Copy, move the playhead, Paste: a new lane above, at the playhead.
  await page
    .locator('#timeline-foundation .timeline-clip[data-id="example-badge"]')
    .first()
    .click({ position: { x: 20, y: 6 } });
  await page.keyboard.press('Control+c');
  const ruler = await rulerBox(page);
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  await page.mouse.click(ruler.x + 3 * zoom, ruler.y + 8);
  await page
    .locator('#timeline-foundation .timeline-clip[data-id="example-badge"]')
    .first()
    .click({ position: { x: 20, y: 6 } });
  const count = (await order()).length;
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await order()).length).toBe(count + 1);
  const pasted = (await clipOf((await selected(page))[0]!))!;
  expect(pasted.clip.startTime).toBeCloseTo(3, 1);
  const now = await order();
  expect(now.indexOf(pasted.trackId)).toBe(now.indexOf(original.trackId) - 1);
});

test('[TL-100] lanes have no labels; lock, hide, mute and lane moves are in the lane menu; toasts are plain sentences; the hover hairline sits at the pointer; ruler and clips scroll together', async ({
  page,
}) => {
  await expect(page.locator('.track-name')).toHaveCount(0);
  const lane = lanes(page).first();
  // The lane as seen: its row is as wide as the whole timeline.
  const area0 = await box(scroll(page));
  const laneBox = { ...(await box(lane)), x: area0.x, width: area0.width };
  const trackId = (await lane.getAttribute('data-track-id'))!;
  const track = async () =>
    (await hook(page)).project.compositions[0]!.tracks.find(
      (t) => t.id === trackId,
    )!;
  // Right-click empty lane space: the lane's own actions.
  await page.mouse.click(
    laneBox.x + laneBox.width - 30,
    laneBox.y + laneBox.height / 2,
    { button: 'right' },
  );
  const menu = page.locator('#timeline-foundation .timeline-menu');
  await expect(menu).toBeVisible();
  await menu.locator('[data-action="track-lock"]').click();
  expect((await track()).locked).toBe(true);
  await page.mouse.click(
    laneBox.x + laneBox.width - 30,
    laneBox.y + laneBox.height / 2,
    { button: 'right' },
  );
  await menu.locator('[data-action="track-lock"]').click();
  expect((await track()).locked).toBe(false);
  await page.mouse.click(
    laneBox.x + laneBox.width - 30,
    laneBox.y + laneBox.height / 2,
    { button: 'right' },
  );
  await menu.locator('[data-action="track-enable"]').click();
  expect((await track()).enabled).toBe(false);
  await page.mouse.click(
    laneBox.x + laneBox.width - 30,
    laneBox.y + laneBox.height / 2,
    { button: 'right' },
  );
  const down = menu.locator('[data-action="track-down"]');
  if (await down.isEnabled()) {
    const before = [...(await hook(page)).project.compositions[0]!.tracks]
      .sort((a, b) => a.order - b.order)
      .findIndex((t) => t.id === trackId);
    await down.click();
    const after = [...(await hook(page)).project.compositions[0]!.tracks]
      .sort((a, b) => a.order - b.order)
      .findIndex((t) => t.id === trackId);
    expect(after).toBe(before + 1);
  } else await page.keyboard.press('Escape');
  // The hover hairline is exactly at the pointer.
  const area = await box(scroll(page));
  const x = area.x + 333;
  await page.mouse.move(x, laneBox.y + laneBox.height / 2);
  const hair = page.locator('#timeline-foundation .timeline-hover-head');
  await expect(hair).toBeVisible();
  expect(Math.abs((await box(hair)).x - x)).toBeLessThanOrEqual(1);
  // Zoomed in and scrolled: ruler 0 s, the playhead at 0 and a clip starting
  // at 0 share the same x.
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: 'Timeline zoom in' }).click();
  await scroll(page).evaluate((element) => (element.scrollLeft = 37));
  await page.waitForTimeout(50);
  const zero = await page.evaluate(() => {
    const ruler = document
      .querySelector('.timeline-ruler')!
      .getBoundingClientRect().left;
    const clip = [
      ...document.querySelectorAll<HTMLElement>(
        '.timeline-clip[data-action="clip"]',
      ),
    ]
      .map((el) => el.getBoundingClientRect().left)
      .sort((a, b) => a - b)[0]!;
    return { ruler, clip };
  });
  expect(Math.abs(zero.clip - zero.ruler)).toBeLessThanOrEqual(1);
  // No toast is raw JSON.
  const texts = await page.locator('.toast-text').allTextContents();
  for (const text of texts) expect(text.trim()).not.toMatch(/^[[{]/);
});
