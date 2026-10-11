import type { Page } from '@playwright/test';
import {
  test,
  expect,
  showCategory,
  showSceneStrip,
  toScreen,
} from './fixtures';

// T7: readable sizes everywhere (text at least 12.5 px, icons on controls
// 20 px, controls at least 32 px to hit) in both themes, and the placeholder
// wordmark from src/brand/brand.ts in the top bar, the loading screen, the
// empty states and the export dialog.
const ready = async (page: Page) =>
  expect.poll(async () => page.evaluate(() => '__AIVE__' in window)).toBe(true);

/** Every visible text, control icon and control under its minimum. */
async function scan(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        getComputedStyle(el).visibility !== 'hidden' &&
        !el.closest('.sr-only')
      );
    };
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${el.id ? '#' + el.id : ''}`;
    // Allowed exceptions, each with its reason:
    // - a number field's step arrows and preset chevron are parts of the
    //   field, whose input is the 32 px target;
    // - a select's chevron and a clip's kind icon are glyphs inside a line;
    // - the playhead's handle (the ruler is its target), the track header's
    //   toggles (logged in the backlog: they need a wider header) and the
    //   clips themselves (T3: lanes of 36 px, clips at least 28 px).
    // - V3 (spec 4): the Scene outliner is a dense Blender-style tree whose
    //   rows are the targets; its arrows and toggles are glyphs in a row;
    // - V1 (spec 1): the right rail's labels are 10 px under 24 px icons.
    const smallText = '.icon-rail-label';
    const smallGlyph =
      '.number-field-step, .number-field-more, .select-trigger, .timeline-clip, .outliner-row';
    const smallHit =
      '.number-field-step, .number-field-more, .timeline-playhead, .track-toggle, [data-action="track-up"], [data-action="track-down"], .timeline-clip, .timeline-gap-close, .timeline-trim, .outliner-row';
    const text: string[] = [],
      icons: string[] = [],
      hits: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || el.closest('canvas')) continue;
      if (
        [...el.childNodes].some(
          (node) => node.nodeType === 3 && node.textContent!.trim(),
        ) &&
        parseFloat(getComputedStyle(el).fontSize) < 12.5 &&
        !el.closest(smallText)
      )
        text.push(name(el));
      const control = el.closest('button, [role="button"], [role="menuitem"]');
      if (el.matches('svg.icon') && control && !control.closest(smallGlyph)) {
        const r = el.getBoundingClientRect();
        if (Math.min(r.width, r.height) < 19.5) icons.push(name(control));
      }
      if (
        el.matches(
          'button, [role="button"], select, input:not([type=hidden])',
        ) &&
        !el.closest(smallHit)
      ) {
        const r = el.getBoundingClientRect();
        if (Math.min(r.width, r.height) < 31.5) hits.push(name(el));
      }
    }
    return {
      text: [...new Set(text)],
      icons: [...new Set(icons)],
      hits: [...new Set(hits)],
    };
  });
}

// LAY-052: one case per theme.
async function caseLAY052(
  theme: 'dark' | 'light',
  { page }: { page: Page },
  testInfo?: { outputPath: (name: string) => string },
) {
  void testInfo;
  await page.addInitScript(
    (value) => localStorage.setItem('aive.theme', value),
    theme,
  );
  await page.goto('/');
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // Body text is 14 px, digits that change are tabular.
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontSize),
  ).toBe('14px');
  expect(
    await page
      .locator('#timeline-foundation [data-timecode]')
      .evaluate((item) => getComputedStyle(item).fontVariantNumeric),
  ).toContain('tabular-nums');
  // Rail icons are 24 px.
  const rail = (await page
    .locator('#rail-left [data-category="Media"] svg.icon')
    .boundingBox())!;
  expect(rail.width).toBeGreaterThanOrEqual(23.5);
  // Nothing selected, then a text layer (toolbar and right panel), then
  // the Media panel with the strip shown.
  expect(await scan(page)).toEqual({ text: [], icons: [], hits: [] });
  await page.locator('[data-layer-id="example-headline"]').first().click();
  await expect(page.locator('#context-toolbar')).toBeVisible();
  expect(await scan(page)).toEqual({ text: [], icons: [], hits: [] });
  await page.keyboard.press('Escape');
  await showCategory(page, 'Media');
  await showSceneStrip(page);
  expect(await scan(page)).toEqual({ text: [], icons: [], hits: [] });
  await page.screenshot({ path: testInfo!.outputPath(`${theme}.png`) });
}
test('[LAY-052] dark: no visible text under 12.5 px, no control icon under 20 px and no control under 32 px', async ({
  page,
}, testInfo) => caseLAY052('dark', { page }, testInfo));
test('[LAY-052] light: no visible text under 12.5 px, no control icon under 20 px and no control under 32 px', async ({
  page,
}, testInfo) => caseLAY052('light', { page }, testInfo));

test('[LAY-053] the placeholder wordmark shows in the top bar, the loading screen, the empty canvas and the export dialog', async ({
  page,
}) => {
  // Loading screen: hold the app's script so the page stays on it.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/src/main.ts', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('.boot-skeleton [data-brand-wordmark]')).toHaveText(
    'AAI-Native',
  );
  await expect(page).toHaveTitle(/^AI-Native Video Editor/);
  release();
  await ready(page);
  await expect(page.locator('.topbar [data-brand-wordmark]')).toHaveText(
    'AAI-Native',
  );
  // An empty scene: the canvas's empty state.
  await showSceneStrip(page);
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  await expect(page.locator('#canvas-empty')).toBeVisible();
  await expect(
    page.locator('#canvas-empty [data-brand-wordmark]'),
  ).toBeVisible();
  // The export dialog.
  await page.locator('#export').click();
  await expect(
    page.locator('.modal-dialog .export-brand [data-brand-wordmark]'),
  ).toHaveText('AAI-Native');
});

/** WCAG contrast of two computed CSS colours (rgb/rgba or color(srgb)). */
const contrastScript = () => {
  const parse = (value: string): number[] => {
    const numbers = value.match(/[\d.]+/g)!.map(Number);
    return value.startsWith('color(')
      ? numbers.slice(0, 3).map((n) => n * 255)
      : numbers.slice(0, 3);
  };
  const lum = (rgb: number[]) => {
    const [r, g, b] = rgb.map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  return (a: string, b: string) => {
    const [x, y] = [lum(parse(a)), lum(parse(b))].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };
};

// LAY-054: one case per theme.
async function caseLAY054(
  theme: 'dark' | 'light',
  {
    page,
    openFixtureProject,
  }: { page: Page; openFixtureProject?: (name: string) => Promise<void> },
  testInfo?: { outputPath: (name: string) => string },
) {
  void testInfo;
  await page.addInitScript(
    (value) => localStorage.setItem('aive.theme', value),
    theme,
  );
  await page.goto('/');
  await ready(page);
  await openFixtureProject!('nle-example.json');
  const clip = page.locator(
    '#timeline-foundation .timeline-clip[data-clip-id="clip-a"]',
  );
  // Hover: an outline shows.
  await clip.hover();
  expect(
    await clip.evaluate((item) => {
      const style = getComputedStyle(item);
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
    }),
  ).toBe(true);
  // Selected: its label reads at 4.5:1 on its fill.
  await clip.click({ position: { x: 30, y: 10 } });
  const selected = await clip.evaluate((item, script) => {
    const contrast = new Function(`return (${script})()`)() as (
      a: string,
      b: string,
    ) => number;
    const style = getComputedStyle(item);
    return contrast(style.color, style.backgroundColor);
  }, contrastScript.toString());
  expect(selected).toBeGreaterThanOrEqual(4.5);
  // The gap's trash button: its icon on its background.
  const gap = page.locator('#timeline-foundation .timeline-gap').first();
  await gap.hover();
  const trash = gap.locator('[data-action="close-gap"]');
  await expect(trash).toBeVisible();
  const trashContrast = await trash.evaluate((item, script) => {
    const contrast = new Function(`return (${script})()`)() as (
      a: string,
      b: string,
    ) => number;
    const style = getComputedStyle(item);
    return contrast(style.color, style.backgroundColor);
  }, contrastScript.toString());
  expect(trashContrast).toBeGreaterThanOrEqual(4.5);
  // The transition + and chip, drawn with their own classes on a lane.
  const marks = await page.evaluate((script) => {
    const contrast = new Function(`return (${script})()`)() as (
      a: string,
      b: string,
    ) => number;
    const lane = document.querySelector(
      '#timeline-foundation .timeline-track',
    )!;
    return ['transition-add', 'transition-chip'].map((name) => {
      const mark = document.createElement('button');
      mark.className = name;
      mark.textContent = '+';
      lane.append(mark);
      mark.style.opacity = '1';
      const style = getComputedStyle(mark);
      const box = mark.getBoundingClientRect();
      const result = {
        name,
        ratio: contrast(style.color, style.backgroundColor),
        size: Math.min(box.width, box.height),
      };
      mark.remove();
      return result;
    });
  }, contrastScript.toString());
  for (const mark of marks) {
    expect(mark.ratio, mark.name).toBeGreaterThanOrEqual(4.5);
    expect(mark.size, mark.name).toBeGreaterThanOrEqual(24);
  }
  // The canvas marquee: its border reaches 3:1 on the stage.
  // From the stage just left of the artboard (as H1's marquee tests).
  const from = await toScreen(page, -25, 20);
  const to = await toScreen(page, 120, 120);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  const marquee = page.locator('.canvas-marquee');
  await expect(marquee).toBeVisible();
  const marqueeContrast = await page.evaluate((script) => {
    const contrast = new Function(`return (${script})()`)() as (
      a: string,
      b: string,
    ) => number;
    const border = getComputedStyle(
      document.querySelector('.canvas-marquee')!,
    ).borderTopColor;
    const stage = getComputedStyle(
      document.querySelector('#canvas-stage')!,
    ).backgroundColor;
    return contrast(border, stage);
  }, contrastScript.toString());
  await page.mouse.up();
  expect(marqueeContrast).toBeGreaterThanOrEqual(3);
}
test('[LAY-054] dark: hover, selected, marquee, the gap trash button and the transition + and chip stay readable', async ({
  page,
  openFixtureProject,
}, testInfo) => caseLAY054('dark', { page, openFixtureProject }, testInfo));
test('[LAY-054] light: hover, selected, marquee, the gap trash button and the transition + and chip stay readable', async ({
  page,
  openFixtureProject,
}, testInfo) => caseLAY054('light', { page, openFixtureProject }, testInfo));

const VIEWPORTS: [number, number][] = [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1280, 720],
  [1024, 768],
  [820, 1180],
  [390, 844],
];
// LAY-055: one case per theme.
async function caseLAY055(
  theme: 'dark' | 'light',
  { page }: { page: Page },
  testInfo?: { outputPath: (name: string) => string },
) {
  void testInfo;
  await page.addInitScript(
    (value) => localStorage.setItem('aive.theme', value),
    theme,
  );
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await ready(page);
    const name = `${width}x${height} ${theme}`;
    const layout = await page.evaluate(() => {
      const inside = (selector: string) =>
        [...document.querySelectorAll<HTMLElement>(selector)]
          .filter((item) => item.offsetParent !== null)
          .every((item) => {
            const box = item.getBoundingClientRect();
            return box.left >= -0.5 && box.right <= innerWidth + 0.5;
          });
      return {
        page:
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
        bar: inside(
          '#timeline-foundation .timeline-controls button, #timeline-foundation [data-timecode]',
        ),
        footer: inside('#canvas-footer button'),
      };
    });
    expect(layout, name).toEqual({ page: true, bar: true, footer: true });
    await expect(
      page.locator('#timeline-foundation [data-timecode]'),
      name,
    ).toBeVisible();
  }
}
test('[LAY-055] dark: at every target window size the page never scrolls sideways and the Player bar, its timecode and the status row stay inside the window', async ({
  page,
}, testInfo) => caseLAY055('dark', { page }, testInfo));
test('[LAY-055] light: at every target window size the page never scrolls sideways and the Player bar, its timecode and the status row stay inside the window', async ({
  page,
}, testInfo) => caseLAY055('light', { page }, testInfo));
