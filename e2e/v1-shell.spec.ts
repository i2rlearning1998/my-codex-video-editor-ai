import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// V1 (Clipchamp clone spec 1): region cards and the right side that exists
// only while something is selected. These tests turn off the fixture's
// reserved right column (D-190), so they see the real layout.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_RIGHT__?: string }).__AIVE_E2E_RIGHT__ = 'off';
  });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});
const box = async (page: Page, selector: string) =>
  (await page.locator(selector).boundingBox())!;
const width = (page: Page, selector: string) =>
  page
    .locator(selector)
    .evaluate((element) => element.getBoundingClientRect().width);

test('[LAY-063] the right rail is always shown (Auto Caption alone and disabled with nothing selected); a selection changes its categories but never opens the panel; a rail click toggles the panel; the drawer icon closes it', async ({
  page,
}) => {
  // V7 (spec 10.1, B24, B25): fresh project: rail with a disabled Auto
  // Caption, no panel.
  const shown = () =>
    page
      .locator('#rail-right button:not([hidden])')
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLElement).dataset.section),
      );
  await expect.poll(() => width(page, '#rail-right')).toBeCloseTo(65, 0);
  await expect.poll(shown).toEqual(['Captions']);
  const caption = page.locator('#rail-right [data-section="Captions"]');
  await expect(caption).toHaveAttribute('aria-disabled', 'true');
  await expect(caption).toContainText('Auto Caption');
  await expect(caption).toHaveAttribute('title', /Planned/);
  await caption.click({ force: true });
  await expect.poll(() => width(page, '#inspector-panel')).toBe(0);
  const stage = await box(page, '.preview-panel');
  const centred = async () => {
    const stageBox = await box(page, '.canvas-stage');
    const canvas = await box(page, '#composition-canvas');
    return Math.abs(
      canvas.x + canvas.width / 2 - (stageBox.x + stageBox.width / 2),
    );
  };
  expect(await centred()).toBeLessThanOrEqual(2);
  // Select a picture-less shape layer: the rail changes, the panel stays shut
  // and nothing moves.
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  await expect.poll(shown).toContain('Animate');
  await page.waitForTimeout(300);
  expect(await width(page, '#inspector-panel')).toBe(0);
  expect((await box(page, '.preview-panel')).width).toBeCloseTo(stage.width, 0);
  // A rail click opens the panel (300 px); the same click again closes it.
  const effects = page.locator('#rail-right [data-section="Effects"]');
  await effects.click();
  await expect.poll(() => width(page, '#inspector-panel')).toBeCloseTo(300, 0);
  await expect(effects).toHaveAttribute('aria-pressed', 'true');
  await effects.click();
  await expect.poll(() => width(page, '#inspector-panel')).toBe(0);
  // Select text: the rail changes; open, then the drawer icon closes it.
  await page.locator('#scene-list [data-layer-id="example-headline"]').click();
  await expect.poll(shown).toContain('Properties');
  await page.locator('#rail-right [data-section="Effects"]').click();
  await expect.poll(() => width(page, '#inspector-panel')).toBeCloseTo(300, 0);
  const drawer = page.locator('#right-panel-collapse');
  await expect(drawer.locator('svg path').first()).toHaveAttribute('d', /./);
  await drawer.click();
  await expect.poll(() => width(page, '#inspector-panel')).toBe(0);
  // Open again, then a click on the empty canvas deselects: the panel
  // closes, the rail stays with Auto Caption only.
  await page.locator('#rail-right [data-section="Effects"]').click();
  await expect.poll(() => width(page, '#inspector-panel')).toBeCloseTo(300, 0);
  const stageBox = await box(page, '.canvas-stage');
  await page.mouse.click(stageBox.x + 6, stageBox.y + stageBox.height - 6);
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([]);
  await expect.poll(() => width(page, '#inspector-panel')).toBe(0);
  await expect.poll(shown).toEqual(['Captions']);
  expect(await width(page, '#rail-right')).toBeCloseTo(65, 0);
  expect(await centred()).toBeLessThanOrEqual(2);
});

test('[LAY-065] no rendered icon is smaller than 16 px; rail icons are 24 px and rail labels are never cut', async ({
  page,
}) => {
  // V7 (spec 10.5, B26): measure every visible icon in three states.
  const small = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('svg.icon')]
        .filter((icon) => {
          const box = icon.getBoundingClientRect();
          const style = getComputedStyle(icon);
          return (
            box.width > 0 &&
            box.height > 0 &&
            style.visibility !== 'hidden' &&
            !icon.closest('[hidden], .sr-only') &&
            Math.min(box.width, box.height) < 15.5
          );
        })
        .map(
          (icon) =>
            `${(icon.parentElement as HTMLElement).className || icon.parentElement!.tagName}`,
        ),
    );
  expect(await small()).toEqual([]);
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  await page.locator('#rail-right [data-section="Effects"]').click();
  expect(await small()).toEqual([]);
  // Rail icons 24 px; labels fit (no ellipsis, nothing wider than its box).
  const rails = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.icon-rail button')]
      .filter((button) => button.getBoundingClientRect().width > 0)
      .map((button) => {
        const icon = button.querySelector('svg')!.getBoundingClientRect();
        const label = button.querySelector<HTMLElement>('.icon-rail-label');
        return {
          name: label?.textContent ?? '',
          icon: Math.round(icon.width),
          cut: label
            ? label.scrollWidth > label.clientWidth + 1 ||
              getComputedStyle(label).textOverflow === 'ellipsis'
            : false,
        };
      }),
  );
  for (const rail of rails) {
    expect(rail.icon, rail.name).toBe(24);
    expect(rail.cut, rail.name).toBe(false);
  }
  expect(rails.map((rail) => rail.name)).toContain('Templates');
});

test('[LAY-064] regions are separate cards: 8 px gutters of the page colour, opaque 1 px borders, neighbours of different tones', async ({
  page,
}) => {
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  // (V7: the panel opens from its rail.)
  await page.locator('#rail-right [data-section="Effects"]').click();
  await expect.poll(() => width(page, '#inspector-panel')).toBeGreaterThan(290);
  const regions = [
    '#rail-left',
    '#library-panel',
    '.preview-panel',
    '#inspector-panel',
    '#rail-right',
    '.editor-shell > .timeline',
  ];
  const styles = await page.evaluate(
    (selectors) =>
      selectors.map((selector) => {
        const element = document.querySelector(selector)!;
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          border: style.borderTopColor,
          borderWidth: style.borderTopWidth,
        };
      }),
    regions,
  );
  const page_ = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('.editor-shell')!)
        .backgroundColor,
  );
  for (const style of styles) {
    expect(style.borderWidth).toBe('1px');
    // Opaque: rgb(), not rgba() with an alpha below 1.
    expect(style.border).toMatch(/^rgb\(/);
    expect(style.background).not.toBe(page_);
  }
  // Neighbours left to right differ, and the stage differs from the timeline.
  for (let i = 0; i + 1 < 5; i++)
    expect(styles[i]!.background).not.toBe(styles[i + 1]!.background);
  expect(styles[2]!.background).not.toBe(styles[5]!.background);
  const footer = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('#canvas-footer')!)
        .backgroundColor,
  );
  expect(footer).not.toBe(styles[2]!.background);
  expect(footer).not.toBe(styles[5]!.background);
  // 8 px gutters between the cards.
  const library = await box(page, '#library-panel');
  const stage = await box(page, '.preview-panel');
  const inspector = await box(page, '#inspector-panel');
  const timeline = await box(page, '.editor-shell > .timeline');
  expect(Math.round(stage.x - (library.x + library.width))).toBe(8);
  expect(Math.round(inspector.x - (stage.x + stage.width))).toBe(8);
  expect(Math.round(timeline.y - (stage.y + stage.height))).toBe(8);
});
