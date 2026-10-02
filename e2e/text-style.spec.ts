import type { Page } from '@playwright/test';
import { test, expect, hook, artboard } from './fixtures';
import { choose, reveal } from './controls';

// W2-F5 text styling from the context toolbar. Default example:
// headline 76,165 730x230 "Make room\nfor your ideas." (size 78, #272b29);
// subtitle 76,570 680x70 "A study in shape, space & possibility." (size 24);
// kicker 76,72 600x40 "STUDIO NOTES  /  001" (size 20).
const boards = new WeakMap<Page, Awaited<ReturnType<typeof artboard>>>();
async function board(page: Page) {
  let value = boards.get(page);
  if (!value) boards.set(page, (value = await artboard(page)));
  return value;
}
const layer = async (page: Page, id: string) =>
  (await hook(page)).project.compositions[0]!.layers.find(
    (item) => item.id === id,
  )! as any;
async function select(page: Page, id: string) {
  await page.locator(`#scene-list [data-layer-id="${id}"]`).click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([id]);
}
/**
 * Composition-space bounds and count of the dark grey text ink inside a
 * rectangle (the indigo selection outline is not grey, so it is ignored).
 */
async function ink(page: Page, rect: [number, number, number, number]) {
  const { x, y, scale } = await board(page);
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, { rect, x, y, scale }) => {
      const box = canvas.getBoundingClientRect();
      const ratio = canvas.width / box.width;
      const px = (value: number, origin: number, base: number) =>
        Math.round((origin + value * scale - base) * ratio);
      const left = px(rect[0], x, box.x),
        top = px(rect[1], y, box.y);
      const width = px(rect[2], x, box.x) - left,
        height = px(rect[3], y, box.y) - top;
      const { data } = canvas
        .getContext('2d')!
        .getImageData(left, top, width, height);
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity,
        count = 0;
      for (let row = 0; row < height; row++)
        for (let column = 0; column < width; column++) {
          const i = (row * width + column) * 4;
          const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
          if (
            r + g + b < 3 * 170 &&
            Math.abs(r - g) < 30 &&
            Math.abs(g - b) < 30 &&
            Math.abs(r - b) < 30
          ) {
            count++;
            minX = Math.min(minX, column);
            maxX = Math.max(maxX, column);
            minY = Math.min(minY, row);
            maxY = Math.max(maxY, row);
          }
        }
      const unit = ratio * scale;
      return {
        left: rect[0] + minX / unit,
        right: rect[0] + (maxX + 1) / unit,
        top: rect[1] + minY / unit,
        bottom: rect[1] + (maxY + 1) / unit,
        count,
      };
    },
    { rect, x, y, scale },
  );
}
const control = (page: Page, id: string) =>
  page.locator(`#context-toolbar [data-control="${id}"]`);
async function commit(page: Page, id: string, value: string) {
  const input = await reveal(page, `toolbar-${id}`);
  await input.fill(value);
  await input.press('Enter');
}
const lastLabel = async (page: Page) =>
  (await hook(page)).history.labels.at(-1);
const SUBTITLE: [number, number, number, number] = [60, 565, 900, 645];
// Above the badge (456), left of the cards, and left of the rotation handle
// under the box's middle (H3); both lines start at x 76.
const HEADLINE: [number, number, number, number] = [60, 160, 400, 452];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[CV-037][TXT-014] the text toolbar aligns text left, center, right and justified, one undo step each', async ({
  page,
}, testInfo) => {
  await select(page, 'example-subtitle');
  // H3: the Canva text row: size chip, font, size, colour, B I U S aA,
  // align, list, spacing, transparency, effects, animate, position, style.
  for (const id of [
    'canvas-size',
    'font',
    'size',
    'color',
    'bold',
    'italic',
    'underline',
    'strike',
    'uppercase',
    'align',
    'spacing',
    'transparency',
    'effects',
    'animate',
    'position',
    'copy-style',
  ])
    await expect(control(page, id)).toBeEnabled();
  // List is planned (TXT-024, Wave 3); Effects opens a panel whose effects
  // name their wave.
  await expect(control(page, 'list')).toHaveAttribute('aria-disabled', 'true');
  await control(page, 'effects').click();
  await expect(
    page.locator('[data-tool-panel="effects"] [aria-disabled="true"]').first(),
  ).toHaveAttribute('title', 'Planned: Wave 3 (TXT-019)');
  await page.keyboard.press('Escape');
  const left = await ink(page, SUBTITLE);
  expect(left.left).toBeLessThan(80);
  await choose(page, 'toolbar-align', 'right');
  expect(await lastLabel(page)).toBe('Set text alignment');
  const right = await ink(page, SUBTITLE);
  expect(right.right).toBeGreaterThan(750);
  expect(right.right).toBeLessThanOrEqual(757);
  expect(right.left - left.left).toBeCloseTo(right.right - left.right, -1);
  await choose(page, 'toolbar-align', 'center');
  const center = await ink(page, SUBTITLE);
  expect((center.left + center.right) / 2).toBeCloseTo(76 + 680 / 2, -1);
  // Justify stretches every wrapped line but a paragraph's last. Narrow the
  // box with its right-side width grip so the subtitle wraps onto two lines.
  const { x, y, scale } = await board(page);
  await page.mouse.move(x + 756 * scale, y + 605 * scale);
  await page.mouse.down();
  await page.mouse.move(x + 456 * scale, y + 605 * scale, { steps: 6 });
  await page.mouse.up();
  await choose(page, 'toolbar-align', 'left');
  const firstLine: [number, number, number, number] = [60, 565, 560, 597];
  const ragged = await ink(page, firstLine);
  await choose(page, 'toolbar-align', 'justify');
  await expect(page.locator('#toolbar-align')).toHaveAttribute(
    'data-value',
    'justify',
  );
  const justified = await ink(page, firstLine);
  expect(justified.left).toBeCloseTo(ragged.left, 0);
  expect(justified.right).toBeGreaterThan(ragged.right + 4);
  expect(justified.right).toBeCloseTo(456, -1);
  await page.screenshot({ path: testInfo.outputPath('justified.png') });
  // The stored text is unchanged; one undo restores left alignment.
  await page.keyboard.press('Control+z');
  expect(
    (await layer(page, 'example-subtitle')).properties.textAlign.value,
  ).toBe('left');
});

test('[TXT-016] line height, letter spacing and paragraph spacing change the layout', async ({
  page,
}, testInfo) => {
  await select(page, 'example-headline');
  await control(page, 'spacing').click();
  await expect(control(page, 'spacing')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const before = await ink(page, HEADLINE);
  // Line height 2: the second line moves down by 78 × (2 − 1.2) = 62.4.
  await commit(page, 'line-height', '2');
  expect(await lastLabel(page)).toBe('Set line height');
  const taller = await ink(page, HEADLINE);
  expect(taller.top).toBeCloseTo(before.top, 0);
  expect(taller.bottom - before.bottom).toBeCloseTo(62.4, -1);
  // The popover stays open after the commit re-renders the toolbar.
  await expect(page.locator('#toolbar-paragraph-spacing')).toBeVisible();
  // Paragraph spacing 40: "for your ideas." is a second paragraph.
  await commit(page, 'paragraph-spacing', '40');
  const spaced = await ink(page, HEADLINE);
  expect(spaced.bottom - taller.bottom).toBeCloseTo(40, -1);
  await page.screenshot({ path: testInfo.outputPath('spacing.png') });
  // Letter spacing 5 on the subtitle: 38 characters grow by about 37 × 5.
  await select(page, 'example-subtitle');
  const plain = await ink(page, SUBTITLE);
  await control(page, 'spacing').click();
  await commit(page, 'letter-spacing', '5');
  expect(await lastLabel(page)).toBe('Set letter spacing');
  const wide = await ink(page, SUBTITLE);
  expect(wide.right - wide.left - (plain.right - plain.left)).toBeCloseTo(
    185,
    -1,
  );
  // G1: an out-of-range value is clamped to the limit (5×) with a message.
  await commit(page, 'line-height', '9');
  await expect(
    page.locator('.toast-error', { hasText: 'out of range' }),
  ).toBeVisible();
  await expect(page.locator('#toolbar-line-height')).toHaveValue('5');
  expect(
    (await layer(page, 'example-subtitle')).properties.lineHeight.value,
  ).toBe(5);
});

test('[TXT-017] text case shows UPPER, lower and Title case without changing the typed text', async ({
  page,
}) => {
  await select(page, 'example-subtitle');
  await control(page, 'spacing').click();
  const typed = await ink(page, SUBTITLE);
  await choose(page, 'toolbar-case', 'upper');
  expect(await lastLabel(page)).toBe('Set text case');
  const upper = await ink(page, SUBTITLE);
  expect(upper.right - upper.left).toBeGreaterThan(
    (typed.right - typed.left) * 1.15,
  );
  const subtitle = await layer(page, 'example-subtitle');
  expect(subtitle.properties.text.value).toBe(
    'A study in shape, space & possibility.',
  );
  expect(subtitle.properties.textCase.value).toBe('upper');
  // Title case capitalises each word's first letter only.
  await choose(page, 'toolbar-case', 'title');
  const title = await ink(page, SUBTITLE);
  expect(title.right - title.left).toBeGreaterThan(typed.right - typed.left);
  expect(title.right - title.left).toBeLessThan(upper.right - upper.left);
  // Lower case on the all-caps kicker makes it shorter and lower.
  await select(page, 'example-kicker');
  const kicker: [number, number, number, number] = [60, 66, 700, 112];
  const caps = await ink(page, kicker);
  await control(page, 'spacing').click();
  await choose(page, 'toolbar-case', 'lower');
  const lower = await ink(page, kicker);
  expect(lower.right - lower.left).toBeLessThan(caps.right - caps.left);
});

test('[TXT-010] the toolbar changes the font, the weight and italic, one undo step each', async ({
  page,
}) => {
  await select(page, 'example-subtitle');
  const arial = await ink(page, SUBTITLE);
  // H3: the font button opens the Font panel, each font in its own face.
  await control(page, 'font').click();
  await page
    .locator('[data-tool-panel="font"] [data-font="Courier New"]')
    .click();
  await expect(page.locator('#toolbar-font')).toHaveAttribute(
    'data-value',
    'Courier New',
  );
  expect(await lastLabel(page)).toBe('Set font');
  const courier = await ink(page, SUBTITLE);
  // Monospace at 24 px: 38 characters of about 14.4 units each.
  expect(courier.right - courier.left).not.toBeCloseTo(
    arial.right - arial.left,
    -1,
  );
  await page.keyboard.press('Control+z');
  await choose(page, 'toolbar-weight', '400');
  expect(await lastLabel(page)).toBe('Set font weight');
  const regular = await ink(page, SUBTITLE);
  await choose(page, 'toolbar-weight', '700');
  const bold = await ink(page, SUBTITLE);
  expect(bold.count).toBeGreaterThan(regular.count * 1.1);
  await control(page, 'italic').click();
  expect(await lastLabel(page)).toBe('Set italic');
  await expect(control(page, 'italic')).toHaveAttribute('aria-pressed', 'true');
  const italic = await ink(page, SUBTITLE);
  expect(italic).not.toEqual(bold);
  const subtitle = await layer(page, 'example-subtitle');
  expect(subtitle.properties.fontWeight.value).toBe(700);
  expect(subtitle.properties.fontStyle.value).toBe('italic');
});
