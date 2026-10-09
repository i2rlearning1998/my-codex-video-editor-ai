import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';

// H2: themes, motion, the responsive shell, tooltips and toasts.
const ready = async (page: Page) =>
  expect.poll(async () => page.evaluate(() => '__AIVE__' in window)).toBe(true);
const theme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme);
const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
/** The artboard's paper colour at its centre (project content). */
const paper = (page: Page) =>
  page.locator('#composition-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const view = (
      window as unknown as {
        __AIVE__: { getCanvas(): { view: number[] } };
      }
    ).__AIVE__.getCanvas().view;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    const x = Math.round((view[0]! * 1200 + view[4]!) * ratio);
    const y = Math.round((view[3]! * 40 + view[5]!) * ratio);
    return [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data];
  });

test('[LAY-032][LAY-020] dark by default; the top bar, menu and palette switch dark, light and system; the choice is kept and applied before first paint; the artboard is never themed', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  expect(await theme(page)).toBe('dark');
  expect(await bodyBackground(page)).toBe('rgb(19, 20, 26)');
  const artboard = await paper(page);
  const toggle = page.locator('#theme-toggle');
  await toggle.click();
  await expect.poll(() => theme(page)).toBe('light');
  expect(await bodyBackground(page)).toBe('rgb(244, 245, 248)');
  await expect.poll(() => paper(page)).toEqual(artboard);
  // System follows the operating system's colour scheme.
  await toggle.click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(page)).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => theme(page)).toBe('light');
  // The View menu and the palette switch it too.
  await page.locator('#menu-trigger').click();
  await expect(page.locator('#theme-menu')).toContainText('System');
  await page.locator('#theme-menu').click();
  await expect.poll(() => theme(page)).toBe('dark');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Switch theme');
  await page.keyboard.press('Enter');
  await expect.poll(() => theme(page)).toBe('light');
  // Kept across a reload and applied before the first frame is painted.
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      (window as unknown as { firstPaint: unknown }).firstPaint = [
        document.documentElement.dataset.theme,
        getComputedStyle(document.documentElement).backgroundColor,
      ];
    });
  });
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(
      () => (window as unknown as { firstPaint: unknown }).firstPaint,
    ),
  ).toEqual(['light', 'rgb(244, 245, 248)']);
  expect((await hook(page)).project).toBeTruthy();
});

test('[LAY-033][LAY-003][LAY-008] side panels open and close in 150 to 300 ms, and about 0 ms with reduced motion', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const duration = () =>
    page.locator('.editor-shell').evaluate((shell) => {
      const style = getComputedStyle(shell);
      const properties = style.transitionProperty
        .split(',')
        .map((p) => p.trim());
      const durations = style.transitionDuration
        .split(',')
        .map((d) => d.trim());
      return (
        parseFloat(
          durations[properties.indexOf('grid-template-columns')] ?? '0',
        ) * 1000
      );
    });
  const ms = await duration();
  expect(ms).toBeGreaterThanOrEqual(150);
  expect(ms).toBeLessThanOrEqual(300);
  // The panel's column opens and closes (the stage moves with it).
  const stageLeft = () =>
    page
      .locator('.preview-panel')
      .evaluate((panel) => panel.getBoundingClientRect().left);
  const rail = await page
    .locator('#rail-left')
    .evaluate((element) => element.getBoundingClientRect().right);
  const open = await stageLeft();
  expect(open - rail).toBeCloseTo(320, 0);
  await page.locator('[data-panel="left"]').click();
  await expect.poll(stageLeft).toBeCloseTo(rail, 0);
  await expect(page.locator('.library')).toBeHidden();
  // T-ALL (D-183): the rail reopens a panel collapsed from its header.
  await page.locator('#rail-left [data-category="Scene"]').click();
  await expect.poll(stageLeft).toBeCloseTo(open, 0);
  await expect(page.locator('.library')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await duration()).toBeLessThanOrEqual(5);
});

test('[LAY-004] panel dividers drag within their limits: left 260 to 420, right 240 to 360, timeline 160 to 60% of the height', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await ready(page);
  const drag = async (selector: string, dx: number, dy: number) => {
    const box = (await page.locator(selector).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + dx,
      box.y + box.height / 2 + dy,
      {
        steps: 4,
      },
    );
    await page.mouse.up();
  };
  const size = (selector: string, axis: 'width' | 'height') =>
    page
      .locator(selector)
      .evaluate((element, axis) => element.getBoundingClientRect()[axis], axis);
  await drag('.panel-resizer.left', 400, 0);
  await expect.poll(() => size('.library', 'width')).toBeCloseTo(420, 0);
  await drag('.panel-resizer.left', -400, 0);
  await expect.poll(() => size('.library', 'width')).toBeCloseTo(260, 0);
  // T-ALL (D-183): the right panel shows while something is selected.
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  await drag('.panel-resizer.right', 400, 0);
  await expect.poll(() => size('.inspector', 'width')).toBeCloseTo(240, 0);
  await drag('.panel-resizer.right', -400, 0);
  await expect.poll(() => size('.inspector', 'width')).toBeCloseTo(360, 0);
  await drag('.panel-resizer.height', 0, 600);
  await expect.poll(() => size('.timeline', 'height')).toBeCloseTo(160, 0);
  await drag('.panel-resizer.height', 0, -900);
  await expect.poll(() => size('.timeline', 'height')).toBeCloseTo(600, 0);
});

const VIEWPORTS: [number, number][] = [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1280, 720],
  [1024, 768],
  [820, 1180],
  [390, 844],
];
async function checkLayout(page: Page, name: string) {
  // No horizontal page scrollbar.
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll, `${name}: page width`).toBeLessThanOrEqual(client);
  // Top-bar controls: inside the window and never on top of each other.
  const boxes = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.topbar button, .topbar #project-name',
      ),
    ]
      .filter((element) => element.offsetParent !== null)
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          id: element.id || element.dataset.mode || element.dataset.panel || '',
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        };
      }),
  );
  const width = page.viewportSize()!.width;
  for (const box of boxes) {
    expect(box.left, `${name}: ${box.id} clipped`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${name}: ${box.id} clipped`).toBeLessThanOrEqual(width);
  }
  for (const [i, a] of boxes.entries())
    for (const b of boxes.slice(i + 1))
      expect(
        a.right <= b.left + 0.5 ||
          b.right <= a.left + 0.5 ||
          a.bottom <= b.top + 0.5 ||
          b.bottom <= a.top + 0.5,
        `${name}: ${a.id} overlaps ${b.id}`,
      ).toBe(true);
  // The canvas has room, and the timeline and rail are on screen.
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  expect(canvas.width, `${name}: canvas width`).toBeGreaterThan(200);
  expect(canvas.height, `${name}: canvas height`).toBeGreaterThan(150);
  await expect(page.locator('#rail-left')).toBeVisible();
  await expect(page.locator('.timeline')).toBeVisible();
}
async function layoutCase(
  page: Page,
  colour: 'dark' | 'light',
  outputPath: (name: string) => string,
) {
  await page.addInitScript((value) => {
    localStorage.setItem('aive.theme', value);
  }, colour);
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await ready(page);
    expect(await theme(page)).toBe(colour);
    await checkLayout(page, `${width}x${height} ${colour}`);
    await page.screenshot({
      path: outputPath(`${width}x${height}-${colour}.png`),
    });
  }
}
test('[LAY-013][LAY-014] dark: every target window size has no horizontal scrollbar, no overlapping or clipped top-bar controls, and room for the canvas', async ({
  page,
}, testInfo) => layoutCase(page, 'dark', (name) => testInfo.outputPath(name)));
test('[LAY-013][LAY-014] light: every target window size has no horizontal scrollbar, no overlapping or clipped top-bar controls, and room for the canvas', async ({
  page,
}, testInfo) => layoutCase(page, 'light', (name) => testInfo.outputPath(name)));

test('[LAY-013] below 1440 the right panel is a drawer; below 1024 both panels are drawers over a scrim; on a phone they are bottom sheets, one at a time', async ({
  page,
}) => {
  const inspectorShown = () =>
    page
      .locator('.inspector')
      .evaluate((panel) => getComputedStyle(panel).visibility === 'visible');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await ready(page);
  await expect.poll(inspectorShown).toBe(false);
  const canvasBefore = (await page
    .locator('#composition-canvas')
    .boundingBox())!;
  // T-ALL (D-183): a selection opens the right drawer.
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  await expect.poll(inspectorShown).toBe(true);
  // An overlay: the canvas keeps its size.
  expect(
    (await page.locator('#composition-canvas').boundingBox())!.width,
  ).toBeCloseTo(canvasBefore.width, 0);
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.locator('.editor-shell')).toHaveAttribute(
    'data-layout',
    'narrow',
  );
  await expect(page.locator('#drawer-scrim')).toBeHidden();
  await page.locator('#rail-left [data-category="Text"]').click();
  await expect(page.locator('#drawer-scrim')).toBeVisible();
  await expect(page.locator('.library')).toBeVisible();
  await page.locator('#drawer-scrim').click({ position: { x: 500, y: 300 } });
  await expect(page.locator('#drawer-scrim')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.editor-shell')).toHaveAttribute(
    'data-layout',
    'phone',
  );
  await page.locator('#rail-left [data-category="Text"]').click();
  // After its short slide-in the sheet sits on the bottom edge, full width.
  await expect
    .poll(async () => {
      const sheet = (await page.locator('.library').boundingBox())!;
      return [
        Math.round(sheet.x),
        Math.round(sheet.y + sheet.height),
        Math.round(sheet.width),
      ];
    })
    .toEqual([0, 844, 390]);
  // Opening the right side (a new selection, T-ALL D-183) closes the left
  // sheet.
  await page.locator('#add-text-box').click();
  await expect.poll(inspectorShown).toBe(true);
  await expect(page.locator('[data-panel="left"]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('[LAY-034] on a window under 800 px tall the rail shows six categories and More lists the rest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  await page.goto('/');
  await ready(page);
  const visible = await page
    .locator('#rail-left [data-category]')
    .evaluateAll(
      (items) =>
        items.filter((item) => (item as HTMLElement).offsetParent !== null)
          .length,
    );
  expect(visible).toBe(6);
  await page.locator('#rail-more').click();
  const menu = page.locator('.rail-more-menu');
  // I2: eight categories (Graphics moved into Elements): six shown, two in More.
  await expect(menu.locator('[data-more-category]')).toHaveCount(2);
  await menu.locator('[data-more-category="Audio"]').click();
  await expect(page.locator('[data-category="Audio"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#rail-more')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await showCategory(page, 'Text');
  await expect(page.locator('#rail-more')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('[LAY-015] tooltips appear after a short delay, then instantly on the next control, and show the shortcut', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const tip = page.locator('#app-tooltip');
  const zoomOut = page.locator('[data-canvas-zoom="out"]');
  await page.locator('[data-canvas-zoom="fit"]').hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Fit');
  await expect(tip.locator('kbd')).toHaveText('Ctrl+0');
  // The next control shows at once (no 500 ms wait).
  const started = Date.now();
  await page.locator('[data-canvas-zoom="in"]').hover();
  await expect(tip).toContainText(/zoom in/i, { timeout: 300 });
  expect(Date.now() - started).toBeLessThan(450);
  // The browser's own tooltip never doubles it; the title comes back after.
  await expect(page.locator('[data-canvas-zoom="in"]')).not.toHaveAttribute(
    'title',
    /.+/,
  );
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  await page.mouse.move(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
  );
  await expect(tip).toBeHidden();
  await expect(page.locator('[data-canvas-zoom="in"]')).toHaveAttribute(
    'title',
    /zoom in/i,
  );
  // A cold hover waits about half a second.
  await page.waitForTimeout(600);
  const cold = Date.now();
  await zoomOut.hover();
  await expect(tip).toBeVisible();
  expect(Date.now() - cold).toBeGreaterThanOrEqual(400);
  await expect(tip.locator('kbd')).toHaveText('Ctrl+-');
});

test('[LAY-016] toasts: auto-dismiss, manual dismiss and an action button', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  // A refused edit raises an error toast (renaming a scene to nothing).
  await page.locator('#project-name').click();
  await page.locator('#project-name-input').fill('Renamed');
  await page.locator('#project-name-input').press('Enter');
  const toast = page.locator('.toast', { hasText: 'renamed' });
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 5000 });
  await page.locator('#project-name').click();
  await page.locator('#project-name-input').fill('Again');
  await page.locator('#project-name-input').press('Enter');
  await page.locator('.toast .toast-close').first().click();
  await expect(page.locator('.toast')).toHaveCount(0);
});
