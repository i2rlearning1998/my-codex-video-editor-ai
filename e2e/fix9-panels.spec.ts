import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  showCategory,
  settleBuild,
  addOwnMedia,
  HONEY_MEDIA,
} from './fixtures';

// FIX9: panels never overlap and every panel scrolls to its end, at the
// window size and library width the person really uses.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { __AIVE_E2E_LIBRARY__?: string }).__AIVE_E2E_LIBRARY__;
    Object.defineProperty(window, '__AIVE_E2E_LIBRARY__', {
      get: () => undefined,
      set: () => undefined,
      configurable: true,
    });
  });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

async function addLayers(page: Page, count: number) {
  await page.locator('#composition-canvas').click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < count; i++) await page.keyboard.press('r');
}

test('[FIX9-001] a scene with 70 layers keeps its heading, search box and list apart (no overlap)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 773 });
  await showCategory(page, 'Scene');
  await addLayers(page, 70);
  const r = await page.evaluate(() => {
    const box = (s: string) => {
      const e = document.querySelector(s) as HTMLElement | null;
      const b = e!.getBoundingClientRect();
      return {
        top: b.top,
        bottom: b.bottom,
        scroll: e!.scrollHeight,
        h: b.height,
      };
    };
    return {
      heading: box('#scene-heading'),
      search: box('#scene-heading .outliner-search'),
      list: box('#scene-list'),
    };
  });
  // The search box sits fully inside the heading and the list starts below it.
  expect(r.search.top).toBeGreaterThanOrEqual(r.heading.top - 0.5);
  expect(r.search.bottom).toBeLessThanOrEqual(r.heading.bottom + 0.5);
  expect(r.list.top).toBeGreaterThanOrEqual(r.heading.bottom - 0.5);
  expect(r.heading.scroll).toBeLessThanOrEqual(r.heading.h + 1);
});

/** Opens a rail category, through the More menu when the rail hides it. */
async function openCategory(page: Page, name: string) {
  const button = page.locator(`#rail-left [data-category="${name}"]`);
  if (await button.isVisible()) return showCategory(page, name);
  await page.locator('#rail-more').click();
  await page.locator(`.rail-more-menu [data-more-category="${name}"]`).click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** Every left-rail category. */
async function categories(page: Page) {
  return page.$$eval('#rail-left [data-category]', (buttons) =>
    buttons.map((b) => b.getAttribute('data-category')!),
  );
}

for (const height of [773, 900]) {
  test(`[FIX9-003] every left panel scrolls down to its last item (window ${height} px high, with an AI video built and a scene saved)`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1600, height });
    await page.addInitScript(() => {
      (window as { __AIVE_E2E_SPEECH__?: boolean }).__AIVE_E2E_SPEECH__ = true;
    });
    await page.reload();
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
    // Fill the AI and My Templates panels the way a real project does.
    await addOwnMedia(page, HONEY_MEDIA);
    await openCategory(page, 'AI');
    await page.locator('#library-ai #ai-import').click();
    await page
      .locator('#ai-import-source')
      .fill(readFileSync('tests/fixtures/plans/honey-en.json', 'utf8'));
    await page.locator('[data-action="build-video"]').click();
    await settleBuild(page);
    await page.locator('.plan-build #plan-cancel').click();
    await showCategory(page, 'Scene');
    const canvas = page.locator('#composition-canvas');
    const box = (await canvas.boundingBox())!;
    await canvas.click({
      button: 'right',
      position: { x: 4, y: box.height - 4 },
    });
    await page
      .locator('#canvas-context-menu [data-action="save-scene-to-mine"]')
      .click();
    await addLayers(page, 70);
    for (const name of await categories(page)) {
      await openCategory(page, name);
      await page.waitForTimeout(250);
      const verdict = await page.evaluate(async (label) => {
        const panel = document.querySelector('#library-panel') as HTMLElement;
        const panelBox = panel.getBoundingClientRect();
        const visible = (e: Element) => {
          const b = e.getBoundingClientRect();
          const s = getComputedStyle(e);
          return (
            b.width > 0 &&
            b.height > 0 &&
            s.visibility !== 'hidden' &&
            s.display !== 'none' &&
            s.position !== 'fixed' &&
            !(e as HTMLElement).closest('[hidden]')
          );
        };
        const all = [...panel.querySelectorAll('*')].filter(visible);
        const scrollers = all.filter((e) => {
          const o = getComputedStyle(e).overflowY;
          return (
            (o === 'auto' || o === 'scroll') &&
            e.scrollHeight > e.clientHeight + 1
          );
        }) as HTMLElement[];
        // Content that sits below the panel's own bottom edge, before scrolling.
        const below = (e: Element) =>
          e.getBoundingClientRect().bottom > panelBox.bottom + 2;
        const clipped = all.filter(
          (e) =>
            below(e) && !all.some((o) => o !== e && e.contains(o) && below(o)),
        );
        return {
          label,
          scrollers: scrollers.length,
          clipped: clipped.length,
          panelH: panelBox.height,
        };
      }, name);
      if (verdict.clipped > 0 || verdict.scrollers > 0) {
        // Something is taller than the window: the wheel must move it.
        const box = (await page.locator('#library-panel').boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 6000);
        await page.waitForTimeout(200);
        const moved = await page.evaluate(() => {
          const panel = document.querySelector('#library-panel') as HTMLElement;
          return [...panel.querySelectorAll('*')].some(
            (e) => (e as HTMLElement).scrollTop > 0,
          );
        });
        expect(moved, `${name}: the panel did not scroll`).toBe(true);
      }
      // After scrolling, nothing of the panel is left cut off below its edge
      // unless a scroller still has room.
      const left = await page.evaluate(() => {
        const panel = document.querySelector('#library-panel') as HTMLElement;
        const bottom = panel.getBoundingClientRect().bottom;
        const stuck = [...panel.querySelectorAll('*')].filter((e) => {
          const b = e.getBoundingClientRect();
          const s = getComputedStyle(e);
          if (!b.width || !b.height || s.position === 'fixed') return false;
          if ((e as HTMLElement).closest('[hidden]')) return false;
          return b.bottom > bottom + 2;
        });
        // Only count an item if no scroller above it can still move down.
        return stuck.filter((e) => {
          let node: HTMLElement | null = e.parentElement;
          while (node && node !== panel.parentElement) {
            const o = getComputedStyle(node).overflowY;
            if (
              (o === 'auto' || o === 'scroll') &&
              node.scrollTop + node.clientHeight < node.scrollHeight - 2
            )
              return false;
            node = node.parentElement;
          }
          return true;
        }).length;
      });
      expect(left, `${name}: content stays cut off below the panel`).toBe(0);
    }
  });
}

test('[FIX9-006] Theme lives only on the left: each theme is listed once and the right side has no Theme tab or panel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await showCategory(page, 'Theme');
  await expect(
    page.locator('#library-extras-Theme [data-kind="theme"]').first(),
  ).toBeVisible();
  const names = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '#library-theme .theme-name, #library-extras-Theme [data-kind="theme"]',
      ),
    ].map((e) =>
      (e.getAttribute('title') ?? e.textContent ?? '').trim().toLowerCase(),
    ),
  );
  expect(names.length).toBeGreaterThanOrEqual(8);
  expect(new Set(names).size, names.join(', ')).toBe(names.length);
  await expect(page.locator('#rail-right [data-section="Theme"]')).toBeHidden();
  await expect(page.locator('#right-theme')).toHaveCount(0);
  await page.screenshot({ path: 'reports/fix9/theme-panel.png' });
});

test('[FIX9-007] Draw is a Canva-style panel: no stray shape from canvas clicks, real line and sticky thumbnails, a Text styles flyout that adds text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await showCategory(page, 'Draw');
  const palette = page.locator('#draw-palette');
  const flyout = page.locator('#draw-flyout');
  const count = async () => {
    const state = await hook(page);
    return state.project.compositions.find(
      (item) => item.id === state.session.compositionId,
    )!.layers.length;
  };
  const before = await count();
  const canvas = page.locator('#composition-canvas');
  const box = (await canvas.boundingBox())!;
  for (const tool of ['shape', 'line', 'sticky', 'text'] as const) {
    await palette.locator(`[data-palette-tool="${tool}"]`).click();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 160, { steps: 5 });
    await page.mouse.up();
    expect(await count(), `canvas click with ${tool}`).toBe(before);
  }
  // Lines: every thumbnail really draws a visible line.
  await palette.locator('[data-palette-tool="line"]').click();
  const lines = flyout.locator('.draw-tile');
  await expect(lines).toHaveCount(5);
  for (let i = 0; i < 5; i++)
    expect(
      await lines
        .nth(i)
        .locator('line')
        .first()
        .evaluate((el) => getComputedStyle(el).stroke),
      `line tile ${i}`,
    ).not.toMatch(/none|transparent|rgba\(0, 0, 0, 0\)/);
  await page.screenshot({ path: 'reports/fix9/draw-lines.png' });
  // Sticky notes: paper with a folded corner and writing, not a flat swatch.
  await palette.locator('[data-palette-tool="sticky"]').click();
  await expect(flyout.locator('.draw-tile svg path').first()).toBeVisible();
  expect(
    await flyout.locator('.draw-tile:first-child svg path').count(),
  ).toBeGreaterThan(2);
  await page.screenshot({ path: 'reports/fix9/draw-sticky.png' });
  // Text styles: three default styles at least; one click adds a text layer.
  await palette.locator('[data-palette-tool="text"]').click();
  await expect(flyout.locator('.draw-text-tile').nth(2)).toBeVisible();
  await page.screenshot({ path: 'reports/fix9/draw-text.png' });
  await flyout.locator('.draw-text-tile').first().click();
  await expect.poll(count).toBe(before + 1);
});
