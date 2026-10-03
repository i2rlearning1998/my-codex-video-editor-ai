import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';

// J10: clip visuals (colour and icon per kind, hover outline, selected
// outline with white handles and a length pill on the ruler), marquee
// selection on the timeline, and Ctrl+G / Ctrl+Shift+G from it.
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )!;
};
const labels = async (page: Page) => (await hook(page)).history.labels;
const clipFor = async (page: Page, layerId: string) => {
  const clip = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === layerId)!;
  return {
    clip,
    element: page.locator(
      `#timeline-foundation .timeline-clip[data-clip-id="${clip.id}"]`,
    ),
  };
};
const style = (element: ReturnType<Page['locator']>, property: string) =>
  element.evaluate(
    (node, name) => getComputedStyle(node).getPropertyValue(name),
    property,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[TL-069] clips are coloured by kind with an icon; hover outlines; selected shows a purple outline, white handles and its length on the ruler', async ({
  page,
}, testInfo) => {
  const text = await clipFor(page, 'example-headline');
  const group = await clipFor(page, 'example-cards');
  await text.element.scrollIntoViewIfNeeded();
  await expect(text.element).toHaveAttribute('data-kind', 'text');
  await expect(group.element).toHaveAttribute('data-kind', 'group');
  await expect(text.element.locator('.clip-kind-icon svg')).toHaveCount(1);
  expect(await style(text.element, 'background-color')).not.toBe(
    await style(group.element, 'background-color'),
  );
  expect(await style(text.element, 'border-top-left-radius')).toBe('8px');
  // The tooltip names the clip, its start and its length.
  await expect(text.element).toHaveAttribute(
    'title',
    /Main headline: \d+(\.\d+)?s, \d+(\.\d+)?s duration/,
  );
  // Hover: an outline.
  await text.element.hover();
  expect(await style(text.element, 'outline-style')).toBe('solid');
  // Selected: the accent outline, white trim grips, and the length pill.
  await text.element.click();
  await expect(text.element).toHaveAttribute('aria-pressed', 'true');
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-accent')
      .trim(),
  );
  const outline = await style(text.element, 'outline-color');
  expect(outline).toBe(
    await page.evaluate((value) => {
      const probe = document.createElement('span');
      probe.style.color = value;
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    }, accent),
  );
  const grip = await text.element
    .locator('.timeline-trim')
    .first()
    .evaluate((node) => getComputedStyle(node, '::after').backgroundColor);
  expect(grip).toBe('rgb(255, 255, 255)');
  const pill = page.locator('#timeline-foundation .ruler-duration');
  await expect(pill).toHaveText(`${text.clip.duration} s`);
  const pillBox = (await pill.boundingBox())!;
  const clipBox = (await text.element.boundingBox())!;
  expect(Math.abs(pillBox.x - clipBox.x)).toBeLessThan(2);
  expect(Math.abs(pillBox.width - clipBox.width)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('clips.png') });
});

test('[TL-070] a marquee on the timeline selects the clips it touches; Ctrl+G groups them and Ctrl+Shift+G ungroups, one step each', async ({
  page,
}) => {
  const tracks = [...(await scene(page)).tracks].sort(
    (a, b) => a.order - b.order,
  );
  const [first, second] = [tracks[0]!.clips[0]!, tracks[1]!.clips[0]!];
  const a = (await clipFor(page, first.layerId)).element;
  const b = (await clipFor(page, second.layerId)).element;
  await a.scrollIntoViewIfNeeded();
  const boxA = (await a.boundingBox())!;
  const boxB = (await b.boundingBox())!;
  // From the empty time after the clips, across both lanes.
  const right = Math.max(boxA.x + boxA.width, boxB.x + boxB.width) + 60;
  await page.mouse.move(right, boxA.y + 4);
  await page.mouse.down();
  await page.mouse.move(right - 120, boxB.y + boxB.height - 4, { steps: 6 });
  await expect(
    page.locator('#timeline-foundation .timeline-marquee'),
  ).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(async () => [...(await hook(page)).session.selectedIds].sort())
    .toEqual([first.layerId, second.layerId].sort());
  // Focus is on the timeline; Ctrl+G groups.
  await page.keyboard.press('Control+g');
  expect((await labels(page)).at(-1)).toBe('Group');
  const grouped = (await scene(page)).layers.find(
    (layer) =>
      layer.type === 'group' &&
      layer.children.some((child) => child.id === first.layerId),
  )!;
  expect(grouped.children.map((child) => child.id).sort()).toEqual(
    [first.layerId, second.layerId].sort(),
  );
  await page.keyboard.press('Control+Shift+g');
  expect((await labels(page)).at(-1)).toBe('Ungroup');
  expect(
    (await scene(page)).layers.some((layer) => layer.id === grouped.id),
  ).toBe(false);
});
