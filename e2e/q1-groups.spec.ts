import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  seekKeep,
  showCategory,
  showGraphics,
  openSubmenus,
} from './fixtures';

// Q1: a group clip carries its children in time; Ungroup bakes the group's
// transform; a background group is one block.
const card = (page: Page, id: string) =>
  page.locator(`.library-card[data-item-id="${id}"]`).first();
interface Layer {
  id: string;
  type: string;
  startTime: number;
  duration: number;
  transform: { position: { value: number[] } };
  children: Layer[];
}
const scene = async (page: Page) => {
  const state = await hook(page);
  return state.project.compositions.find(
    (item) => item.id === state.session.compositionId,
  )! as unknown as {
    layers: Layer[];
    tracks: {
      clips: { layerId: string; startTime: number; duration: number }[];
    }[];
  };
};
const menu = (page: Page) =>
  page.locator('#timeline-foundation .timeline-menu');
async function clipMenu(page: Page, layerId: string) {
  const clip = page.locator(
    `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${layerId}"]`,
  );
  await expect(async () => {
    await clip.click({ button: 'right', position: { x: 20, y: 10 } });
    await expect(menu(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
}
/** RGB of the drawn canvas at a composition point. */
const pixel = (page: Page, x: number, y: number) =>
  page.evaluate(
    ({ x, y }) => {
      const [a, b, c, d, e, f] = (
        window as unknown as { __AIVE__: { getCanvas(): { view: number[] } } }
      ).__AIVE__.getCanvas().view as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const canvas = document.querySelector<HTMLCanvasElement>(
        '#composition-canvas',
      )!;
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      return [
        ...canvas
          .getContext('2d')!
          .getImageData(
            Math.round((a * x + c * y + e) * ratio),
            Math.round((b * x + d * y + f) * ratio),
            1,
            1,
          ).data,
      ].slice(0, 3);
    },
    { x, y },
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

test('[QT-001] lengthening a group clip carries its children: a layered background lengthened to 12 s still draws at 10 s', async ({
  page,
}) => {
  await showGraphics(page);
  await card(page, 'bg-layered-1').click();
  const selected = (await hook(page)).session.selectedIds[0]!;
  const group = (await scene(page)).layers.find(
    (layer) => layer.id === selected,
  )!;
  expect(group.children.length).toBeGreaterThan(1);
  await seekKeep(page, 1);
  const before = await pixel(page, 640, 360);
  await clipMenu(page, group.id);
  await openSubmenus(menu(page), 'clip-menu');
  await menu(page).locator('[data-command="edit-duration"]').click();
  const field = page.locator(
    '.element-timing-popover #element-timing-duration',
  );
  await field.fill('12');
  await field.press('Enter');
  await page.keyboard.press('Escape');
  const after = (await scene(page)).layers.find(
    (item) => item.id === group.id,
  )!;
  const clip = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((item) => item.layerId === group.id)!;
  expect(clip.duration).toBe(12);
  for (const child of after.children)
    expect(child.startTime + child.duration).toBeCloseTo(
      clip.startTime + 12,
      6,
    );
  await seekKeep(page, 10);
  await expect.poll(() => pixel(page, 640, 360)).toEqual(before);
  // Trimming back to 3 s carries them too; undo restores 12 s.
  await clipMenu(page, group.id);
  await openSubmenus(menu(page), 'clip-menu');
  await menu(page).locator('[data-command="edit-duration"]').click();
  await field.fill('3');
  await field.press('Enter');
  await page.keyboard.press('Escape');
  for (const child of (await scene(page)).layers.find(
    (item) => item.id === group.id,
  )!.children)
    expect(child.startTime + child.duration).toBeLessThanOrEqual(
      clip.startTime + 3 + 1e-6,
    );
  await page.locator('#undo').click();
  await expect
    .poll(async () =>
      (await scene(page)).layers
        .find((item) => item.id === group.id)!
        .children.map((child) => child.startTime + child.duration),
    )
    .toEqual(after.children.map(() => clip.startTime + 12));
});

test('[QT-002][QT-003] Ungroup bakes a moved group into its children; a background group is one block and a refusal shows one toast', async ({
  page,
}) => {
  await showCategory(page, 'Text');
  await card(page, 'text-11').click();
  const selected = (await hook(page)).session.selectedIds[0]!;
  const group = (await scene(page)).layers.find(
    (layer) => layer.id === selected,
  )!;
  expect(group.type).toBe('group');
  const [gx, gy] = group.transform.position.value as [number, number];
  const worlds = group.children.map((child) => {
    const [x, y] = child.transform.position.value as [number, number];
    return [x + gx, y + gy];
  });
  await page.keyboard.press('Control+Shift+G');
  await expect
    .poll(async () => (await hook(page)).history.labels.at(-1))
    .toBe('Ungroup');
  const layers = (await scene(page)).layers;
  expect(layers.some((layer) => layer.id === group.id)).toBe(false);
  for (const [index, child] of group.children.entries()) {
    const now = layers.find((layer) => layer.id === child.id)!;
    expect(now.transform.position.value[0]).toBeCloseTo(worlds[index]![0]!, 6);
    expect(now.transform.position.value[1]).toBeCloseTo(worlds[index]![1]!, 6);
  }
  // A background group: Ungroup is offered disabled with the reason.
  await showGraphics(page);
  await card(page, 'bg-layered-1').click();
  const background = (await hook(page)).session.selectedIds[0]!;
  const item = page.locator('.selection-action[data-action="ungroup"]');
  await expect(item).toBeDisabled();
  await expect(item).toHaveAttribute('title', 'Background is one block');
  expect((await hook(page)).session.selectedIds).toEqual([background]);
  const steps = (await hook(page)).history.labels.length;
  await page.keyboard.press('Control+Shift+G');
  await page.keyboard.press('Control+Shift+G');
  await page.keyboard.press('Control+Shift+G');
  await expect(
    page.locator('.toast:not(.toast-leaving)', {
      hasText: 'Background is one block',
    }),
  ).toHaveCount(1);
  expect((await hook(page)).history.labels.length).toBe(steps);
});
