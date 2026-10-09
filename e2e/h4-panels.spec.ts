import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  mode2d,
  openInspector,
  rulerBox,
  toScreen,
} from './fixtures';

// H4: the right panel (Clipchamp) and the Editor | 2D Animation switch.
const rail = (page: Page) => page.locator('#rail-right');
const section = (page: Page, name: string) =>
  page.locator(`#rail-right [data-section="${name}"]`);
async function select(page: Page, id: string) {
  await page.locator(`#scene-list [data-layer-id="${id}"]`).click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([id]);
}
async function seek(page: Page, seconds: number) {
  const box = await rulerBox(page);
  const zoom = (await hook(page)).session.timelinePxPerSecond;
  await page.mouse.click(box.x + seconds * zoom, box.y + 8);
  await expect
    .poll(async () => (await hook(page)).session.time)
    .toBeCloseTo(seconds, 2);
}
const layerOf = async (page: Page, id: string) =>
  (await hook(page)).project.compositions[0]!.layers.find(
    (layer) => layer.id === id,
  ) as any;
const clipOf = async (page: Page, id: string) =>
  (await hook(page)).project.compositions[0]!.tracks.flatMap(
    (track) => track.clips,
  ).find((clip) => clip.layerId === id) as any;
const shownSections = (page: Page) =>
  rail(page)
    .locator('button[data-section]:not([hidden])')
    .evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.section),
    );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[LAY-035] the right rail lists the tabs that fit the selection; unbuilt ones are disabled and name their wave', async ({
  page,
  openFixtureProject,
}) => {
  // I4 (D-148): tabs per selection; the first is named after it. U5: with
  // nothing selected there are no tabs (no Canvas panel).
  expect(await shownSections(page)).toEqual([]);
  await select(page, 'example-headline');
  expect(await shownSections(page)).toEqual([
    'Properties',
    'Animate',
    'Effects',
    'Adjust',
  ]);
  await expect(section(page, 'Properties')).toHaveAttribute(
    'aria-label',
    'Text',
  );
  await select(page, 'example-badge');
  expect(await shownSections(page)).toEqual([
    'Properties',
    'Animate',
    'Effects',
    'Adjust',
  ]);
  await openFixtureProject('nle-example.json');
  await select(page, 'layer-a');
  // J15: a video's sections in Clipchamp's order; its own controls, the
  // Inspector and Animate are Advanced, last.
  expect(await shownSections(page)).toEqual([
    'Captions',
    'Audio',
    'Fade',
    'Animate',
    'Filters',
    'Effects',
    'Adjust',
    'Speed',
    'Transitions',
    'Properties',
  ]);
  // An unbuilt tab is disabled with its wave; clicking it changes nothing.
  await expect(section(page, 'Captions')).toHaveAttribute(
    'title',
    'Captions: Planned: Wave 8 (TXT-035)',
  );
  await section(page, 'Captions').click({ force: true });
  await expect(section(page, 'Properties')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // An image keeps Adjust open; with nothing selected it falls back.
  await section(page, 'Adjust').click();
  await select(page, 'layer-c');
  await expect(section(page, 'Adjust')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  // U5: nothing selected has no tabs; T-ALL P1 (D-183): the right panel
  // itself is then not drawn.
  await expect.poll(() => shownSections(page)).toEqual([]);
  await expect(page.locator('#right-panel-empty')).toBeHidden();
});

test('[LAY-036] the Inspector stacks Position and size, Timing and Details, folded under the first tab; a header opens its section, the chevron folds it', async ({
  page,
}) => {
  await select(page, 'example-headline');
  const inspector = page.locator('#inspector-content');
  await expect(inspector.locator('[role="tab"]')).toHaveCount(0);
  for (const name of ['Position and size', 'Timing', 'Details'])
    await expect(
      inspector.locator('.inspector-group-title', { hasText: name }),
    ).toBeVisible();
  // I4: they start folded at the bottom of the first tab.
  await expect(inspector.locator('#inspector-position-x')).toBeHidden();
  await inspector.locator('[data-subtab="Transform"]').click();
  await inspector.locator('[data-subtab="Timing"]').click();
  await inspector.locator('[data-subtab="Dimensions"]').click();
  await expect(inspector.locator('#inspector-position-x')).toBeVisible();
  await expect(inspector.locator('#inspector-start-time')).toBeVisible();
  await expect(inspector.locator('[data-field="Layer ID"]')).toHaveText(
    'example-headline',
  );
  await inspector.locator('[data-fold="inspector.timing"]').click();
  await expect(inspector.locator('#inspector-start-time')).toBeHidden();
  await inspector.locator('[data-subtab="Timing"]').click();
  await expect(inspector.locator('#inspector-start-time')).toBeVisible();
  // The selection's own controls come first.
  const order = await page
    .locator('#inspector-panel > .panel-body')
    .evaluate((panel) =>
      [...panel.children].map((child) => child.id).filter(Boolean),
    );
  expect(order.indexOf('right-section')).toBeLessThan(
    order.indexOf('inspector-content'),
  );
});

test('[LAY-037] Color (the first tab), Fade and Speed in the right panel edit the selection as one undo step each', async ({
  page,
  openFixtureProject,
}) => {
  await select(page, 'example-headline');
  await page.locator('#right-color').click();
  const hex = page.locator('#color-picker-hex');
  await hex.fill('#ff0000');
  await hex.press('Enter');
  await page.keyboard.press('Escape');
  expect((await layerOf(page, 'example-headline')).properties.fill.value).toBe(
    '#ff0000',
  );
  expect((await hook(page)).history.labels.at(-1)).toBe('Set color');
  await openFixtureProject('nle-example.json');
  await select(page, 'layer-a');
  await section(page, 'Fade').click();
  const fadeIn = page.locator('#right-fade-in');
  await fadeIn.fill('1');
  await fadeIn.press('Enter');
  expect((await clipOf(page, 'layer-a')).metadata.animation.in).toEqual({
    preset: 'fade',
    duration: 1,
  });
  expect((await hook(page)).history.labels.at(-1)).toBe('Fade in');
  await section(page, 'Speed').click();
  await page.locator('#right-section [data-speed="2"]').click();
  expect((await clipOf(page, 'layer-a')).speed).toBe(2);
  await page.locator('[data-action="right-reverse"]').click();
  expect((await clipOf(page, 'layer-a')).metadata.reversed).toBe(true);
  await expect(page.locator('[data-action="right-reverse"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('[ANI-021] Editor | 2D Animation: keyframe tools show in 2D Animation only; the switch crossfades in 320 ms and keeps the selection', async ({
  page,
}) => {
  const editor = page.locator('#mode-switch [data-mode="editor"]');
  await expect(editor).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.locator('#mode-switch [data-mode="animation3d"]'),
  ).toHaveAttribute('title', 'Planned: Wave 8 (ADV-002)');
  await select(page, 'example-badge');
  // Editor: no stopwatches, no keyframe diamonds in the Inspector.
  await expect(page.locator('#animation-panel')).toBeHidden();
  await expect(page.locator('.keyframe-button')).toHaveCount(0);
  // The crossfade runs as the mode changes (read in the same task).
  const duration = await page.evaluate(() => {
    document
      .querySelector<HTMLElement>('#mode-switch [data-mode="animation2d"]')!
      .click();
    return getComputedStyle(document.querySelector('#inspector-panel')!)
      .animationDuration;
  });
  expect(duration).toBe('0.32s');
  await expect(
    page.locator('#mode-switch [data-mode="animation2d"]'),
  ).toHaveAttribute('aria-checked', 'true');
  expect((await hook(page)).session.selectedIds).toEqual(['example-badge']);
  await expect(page.locator('#animation-panel')).toBeVisible();
  // I4: the Inspector's sections start folded under the first tab.
  await openInspector(page);
  await expect(page.locator('.keyframe-button').first()).toBeVisible();
  // Back to Editor: the tools go away again, the selection stays.
  await editor.click();
  await expect(page.locator('#animation-panel')).toBeHidden();
  expect((await hook(page)).session.selectedIds).toEqual(['example-badge']);
});

test('[ANI-022] in Editor mode an animated property is not changed: "Animated in 2D Animation", with a button that opens 2D Animation', async ({
  page,
}) => {
  // Animate the badge's position in 2D Animation.
  await mode2d(page);
  await select(page, 'example-badge');
  await seek(page, 0);
  await page
    .locator(
      '#animation-panel [data-property="position"] [data-action="stopwatch"]',
    )
    .click();
  await seek(page, 2);
  await openInspector(page);
  const x = page.locator('#inspector-content input[aria-label="Position X"]');
  await x.fill('276');
  await x.press('Enter');
  const animated = (await layerOf(page, 'example-badge')).transform.position;
  expect(animated.keyframes).toHaveLength(2);
  await page.locator('#mode-switch [data-mode="editor"]').click();
  const history = (await hook(page)).history.labels.length;
  // A canvas drag is refused.
  const from = await toScreen(page, 380, 470);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y, { steps: 6 });
  await page.mouse.up();
  const toast = page.locator('.toast', { hasText: 'Animated in 2D Animation' });
  await expect(toast).toBeVisible();
  // So is an Inspector edit.
  await x.fill('300');
  await x.press('Enter');
  expect((await hook(page)).history.labels.length).toBe(history);
  expect((await layerOf(page, 'example-badge')).transform.position).toEqual(
    animated,
  );
  // The toast's button opens 2D Animation.
  await toast
    .first()
    .locator('button', { hasText: 'Open 2D Animation' })
    .click();
  await expect(
    page.locator('#mode-switch [data-mode="animation2d"]'),
  ).toHaveAttribute('aria-checked', 'true');
});
