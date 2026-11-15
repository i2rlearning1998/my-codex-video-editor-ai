// ROUND-C1 Part G: the Editor guard's collector. The same steps run on the
// Round A editor (to record e2e/editor-guard.golden.json, see
// e2e/editor-guard.record.ts) and on the current editor (e2e/editor-guard.spec.ts),
// so the two can be compared box by box and label by label. It acts like a
// person (real clicks and keys) and reads the page only; it imports nothing
// from the app, so it runs unchanged on both trees.
import type { Page } from '@playwright/test';

export const SIZES: readonly (readonly [number, number])[] = [
  [1920, 940],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [390, 844],
];
export const ELEMENTS = [
  '.topbar',
  '#rail-left',
  '.library',
  '.preview-panel',
  '.inspector',
  '#rail-right',
  '.timeline',
  '.statusbar',
  '#composition-canvas',
] as const;
export const CATEGORIES = [
  'Templates',
  'Elements',
  'Text',
  'Media',
  'Draw',
  'Scene',
  'Record',
  'Audio',
  'AI',
  'MyTemplates',
  'Theme',
] as const;

export type Box = [number, number, number, number] | null;
export interface Shot {
  layout: string;
  boxes: Record<string, Box>;
}
export interface Golden {
  recordedFrom: string;
  sizes: Record<string, Record<string, Shot | 'skipped'>>;
  topbarControls: Record<string, Record<string, Box>>;
  lists: Record<string, string[]>;
}

/** Undoes the e2e fixture's test-only start settings: the real first load. */
export async function realStart(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.__AIVE_E2E_START__;
    delete w.__AIVE_E2E_RIGHT__;
    delete w.__AIVE_E2E_LIBRARY__;
  });
}

export async function ready(page: Page) {
  await page.waitForFunction(() => '__AIVE__' in window);
  await page.locator('#composition-canvas').waitFor({ state: 'visible' });
  await settle(page);
}

const read = (page: Page) =>
  page.evaluate(
    (selectors) => {
      const shell = document.querySelector<HTMLElement>('.editor-shell');
      const boxes: Record<string, [number, number, number, number] | null> = {};
      for (const selector of selectors) {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) {
          boxes[selector] = null;
          continue;
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const shown =
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          !element.closest('[hidden]');
        boxes[selector] = shown
          ? [
              Math.round(rect.x),
              Math.round(rect.y),
              Math.round(rect.width),
              Math.round(rect.height),
            ]
          : null;
      }
      return { layout: shell?.dataset.layout ?? '', boxes };
    },
    ELEMENTS as unknown as string[],
  );

/** Waits until the layout stops moving (panel animations end). */
export async function settle(page: Page): Promise<Shot> {
  let last = JSON.stringify(await read(page));
  let same = 0;
  for (let i = 0; i < 60 && same < 3; i++) {
    await page.waitForTimeout(80);
    const now = JSON.stringify(await read(page));
    same = now === last ? same + 1 : 0;
    last = now;
  }
  return JSON.parse(last) as Shot;
}

const visible = async (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);

async function clickIf(page: Page, selector: string): Promise<boolean> {
  if (!(await visible(page, selector))) return false;
  // A control covered by another (a phone's bottom sheet) is not reachable.
  return page
    .locator(selector)
    .first()
    .click({ timeout: 3000 })
    .then(
      () => true,
      () => false,
    );
}

export async function category(page: Page, name: string): Promise<boolean> {
  const button = `#rail-left [data-category="${name}"]`;
  if (await clickIf(page, button)) return true;
  if (!(await clickIf(page, '#rail-more'))) return false;
  const entry = `.rail-more-menu [data-more-category="${name}"]`;
  if (await clickIf(page, entry)) return true;
  await page.keyboard.press('Escape');
  return false;
}

/** Leaves any open popover, palette, menu or draw palette. */
async function calm(page: Page) {
  for (let i = 0; i < 2; i++) await page.keyboard.press('Escape');
  // The main menu closes from its own button.
  if (
    (await page.locator('#menu-trigger').getAttribute('aria-expanded')) ===
    'true'
  )
    await page.locator('#menu-trigger').click();
}

export async function openFixture(page: Page, file: string) {
  await page.locator('#menu-trigger').click();
  await page.locator('#import').setInputFiles(file);
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await page.locator('.modal-dialog').waitFor({ state: 'detached' });
  await settle(page);
}

/** A point on the canvas, in screen pixels, from composition units. */
async function canvasPoint(page: Page, fx: number, fy: number) {
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function selectSomething(
  page: Page,
): Promise<{ x: number; y: number } | null> {
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.3, 0.4],
    [0.6, 0.3],
    [0.5, 0.7],
  ] as const) {
    const at = await canvasPoint(page, fx, fy);
    await page.mouse.click(at.x, at.y);
    const count = await page.evaluate(
      () =>
        (
          window as unknown as {
            __AIVE__: { getSession(): { selectedIds: string[] } };
          }
        ).__AIVE__.getSession().selectedIds.length,
    );
    if (count > 0) return at;
  }
  return null;
}

/**
 * Every state of the brief at one window size, in a fixed order. `fixture`
 * is a multi-scene project file; `example` loads the built-in example.
 */
export async function statesAt(
  page: Page,
  size: readonly [number, number],
  fixture: string,
): Promise<Record<string, Shot | 'skipped'>> {
  const out: Record<string, Shot | 'skipped'> = {};
  await page.setViewportSize({ width: size[0], height: size[1] });
  await page.goto('/');
  await ready(page);
  out.fresh = await settle(page);
  for (const name of CATEGORIES) {
    const ok = await category(page, name);
    out[`category:${name}`] = ok ? await settle(page) : 'skipped';
    if (name === 'Draw' && ok) {
      // The Draw rail item toggles its palette; close it the same way.
      await category(page, 'Draw');
      await calm(page);
    }
  }
  await category(page, 'Media');
  await settle(page);
  if (await clickIf(page, '[data-panel="left"]')) {
    out.leftCollapsed = await settle(page);
    await category(page, 'Media');
    out.leftReopened = await settle(page);
  } else out.leftCollapsed = 'skipped';
  if (await clickIf(page, '[data-action="collapse-timeline"]')) {
    out.timelineCollapsed = await settle(page);
    await clickIf(page, '[data-action="collapse-timeline"]');
    out.timelineExpanded = await settle(page);
  } else out.timelineCollapsed = 'skipped';
  if (await clickIf(page, '#mode-switch [data-mode="animation2d"]')) {
    out.animation2d = await settle(page);
    await clickIf(page, '#mode-switch [data-mode="editor"]');
    out.animationBack = await settle(page);
  } else out.animation2d = 'skipped';
  // Several scenes, then a layer selected and the right panel.
  await openFixture(page, fixture);
  out.scenes = await settle(page);
  if (await selectSomething(page)) {
    out.selected = await settle(page);
    if (await clickIf(page, '#rail-right [data-section]')) {
      out.rightOpen = await settle(page);
      if (await clickIf(page, '#right-panel-collapse'))
        out.rightCollapsed = await settle(page);
      else out.rightCollapsed = 'skipped';
    } else out.rightOpen = 'skipped';
  } else out.selected = 'skipped';
  await calm(page);
  return out;
}

/** The boxes of the top bar's own controls (for the shift report). */
export async function topbarControls(page: Page) {
  return page.evaluate(() => {
    const out: Record<string, [number, number, number, number] | null> = {};
    for (const element of document.querySelectorAll<HTMLElement>(
      '.topbar [id], .topbar [data-mode]',
    )) {
      const key = element.id || `mode:${element.dataset.mode}`;
      const rect = element.getBoundingClientRect();
      out[key] =
        rect.width > 0 && rect.height > 0
          ? [
              Math.round(rect.x),
              Math.round(rect.y),
              Math.round(rect.width),
              Math.round(rect.height),
            ]
          : null;
    }
    return out;
  });
}

/** Labels (id and text) of the shown controls under `root`. */
async function labels(page: Page, root: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const out: string[] = [];
    for (const host of document.querySelectorAll<HTMLElement>(selector)) {
      for (const element of host.querySelectorAll<HTMLElement>(
        'button, [role="tab"], [role="menuitem"], [role="option"], [role="radio"], h1, h2, h3, h4, label, input, select, textarea, p',
      )) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (getComputedStyle(element).visibility === 'hidden') continue;
        const tag = element.tagName.toLowerCase();
        // Dynamic text that is not a control label (times, counts).
        if (tag === 'p' && !element.closest('#shortcut-sheet')) continue;
        const id =
          element.id ||
          element.dataset.action ||
          element.dataset.category ||
          element.dataset.section ||
          element.dataset.mode ||
          '';
        const text = (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
            ? element.placeholder || element.getAttribute('aria-label') || ''
            : element.getAttribute('aria-label') || element.textContent || ''
        )
          .replace(/\s+/g, ' ')
          .trim();
        out.push(`${tag}#${id}|${text}`);
      }
    }
    return out;
  }, root);
}

const LIST_WAIT = async (page: Page, root: string) => {
  let last = '';
  let list: string[] = [];
  for (let i = 0; i < 40; i++) {
    list = await labels(page, root);
    const now = JSON.stringify(list);
    if (now === last) break;
    last = now;
    await page.waitForTimeout(150);
  }
  return list;
};

/** The label lists of the brief, at 1920 x 940. */
export async function listsOf(
  page: Page,
  fixture: string,
): Promise<{
  lists: Record<string, string[]>;
  controls: Record<string, [number, number, number, number] | null>;
}> {
  const lists: Record<string, string[]> = {};
  await page.setViewportSize({ width: 1920, height: 940 });
  await page.goto('/');
  await ready(page);
  const controls = await topbarControls(page);
  lists.topbar = await LIST_WAIT(page, '.topbar');
  await page.locator('#menu-trigger').click();
  lists.menu = await LIST_WAIT(page, '#app-menu');
  await calm(page);
  for (const name of CATEGORIES) {
    if (name === 'Draw') {
      await category(page, 'Draw');
      lists[`panel:Draw`] = await LIST_WAIT(page, '.draw-palette');
      await category(page, 'Draw');
      await calm(page);
      continue;
    }
    await category(page, name);
    await settle(page);
    lists[`panel:${name}`] = await LIST_WAIT(page, '#library-panel');
  }
  await page.keyboard.press('Control+k');
  lists.palette = await LIST_WAIT(page, '#command-palette');
  await calm(page);
  await page.keyboard.press('Control+/');
  lists.shortcuts = await LIST_WAIT(page, '#shortcut-sheet');
  await calm(page);
  lists.timelineToolbar = await LIST_WAIT(page, '.timeline-controls');
  await openFixture(page, fixture);
  // The canvas menu with nothing selected.
  await calm(page);
  const empty = await canvasPoint(page, 0.02, 0.02);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  lists.canvasMenuEmpty = await LIST_WAIT(page, '#canvas-context-menu');
  await calm(page);
  const at = await selectSomething(page);
  if (at) {
    lists.contextToolbar = await LIST_WAIT(page, '#context-toolbar');
    lists.rightTabs = await LIST_WAIT(page, '#rail-right');
    await page.mouse.click(at.x, at.y, { button: 'right' });
    lists.canvasMenuLayer = await LIST_WAIT(page, '#canvas-context-menu');
    await calm(page);
  }
  return { lists, controls };
}
