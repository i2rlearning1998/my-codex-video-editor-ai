import type { Page } from '@playwright/test';
import {
  test,
  expect,
  hook,
  seekKeep,
  showCategory,
  showSceneStrip,
} from './fixtures';
import { exported, meanDiff, preview } from './fx-helpers';

// FINAL3 Part C at 1920 × 940: cameras moved by code controllers (no
// keyframes), shots on a Camera track, the right panel's Camera section
// (not in AI), Preview camera that keeps layers selectable, the camera
// frame on the canvas, export equal to the preview, save and reload.
type Point = [number, number];
interface CanvasDebug {
  view: [number, number, number, number, number, number];
  corners: Point[] | null;
  cameraFrame: Point[] | null;
}
const canvasDebug = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __AIVE__: { getCanvas(): CanvasDebug } }
    ).__AIVE__.getCanvas(),
  );
type Layer = {
  id: string;
  name: string;
  properties: Record<string, { value: unknown }>;
  transform: { position: { value: [number, number] } };
};
const scene = async (page: Page) => {
  const { project, session } = await hook(page);
  return project.compositions.find((c) => c.id === session.compositionId)!;
};
const shots = async (page: Page) =>
  ((await scene(page)).layers as unknown as Layer[]).filter(
    (layer) => layer.properties.role?.value === 'camera',
  );
const shotOf = (layer: Layer) =>
  JSON.parse(String(layer.properties.cameraShot!.value)) as {
    controller: string;
    strength: number;
    from?: Record<string, number>;
  };
const lastLabel = async (page: Page) =>
  (await hook(page)).history.labels.at(-1);
const right = (page: Page) => page.locator('#right-section');
const canvasBox = async (page: Page) =>
  (await page.locator('#composition-canvas').boundingBox())!;

/** Nothing selected → the scene toolbar's Camera → Add camera. */
async function addCamera(page: Page) {
  await page.keyboard.press('Escape');
  const bar = page.locator('#context-toolbar');
  await expect(bar).toHaveAttribute('data-kind', 'scene');
  await bar.locator('[data-control="scene-camera"]').click();
  await expect(right(page)).toHaveAttribute('data-section', 'Camera');
  await right(page).locator('[data-action="camera-add"]').click();
  expect(await lastLabel(page)).toBe('Add camera');
  await expect(right(page).locator('#camera-controller')).toBeVisible();
}

test('[FN3-015] the scene toolbar opens the Camera section (not in AI); Add camera puts a shot on a Camera track at the top; presets and controllers are parameters, one step each', async ({
  page,
}) => {
  await page.goto('/');
  // Not in the AI category.
  await showCategory(page, 'AI');
  await expect(
    page.locator(
      '#library-ai [data-action^="camera"], #library-ai .camera-group',
    ),
  ).toHaveCount(0);
  await expect(page.locator('#library-ai')).not.toContainText('Add camera');
  await addCamera(page);
  const [shot] = await shots(page);
  expect(shotOf(shot!).controller).toBe('push-in');
  // The Camera track: first lane, holding the shot clip.
  const lanes = page.locator('#timeline-foundation .timeline-nle-row');
  await expect(lanes.first()).toHaveAttribute('data-camera', 'true');
  await expect(
    lanes.first().locator(`.nle-clip[data-id="${shot!.id}"]`),
  ).toHaveAttribute('data-kind', 'camera');
  // No keyframe UI anywhere in the section.
  await expect(
    right(page).locator('[data-camera-keyframe], .keyframe-button'),
  ).toHaveCount(0);
  // Presets row and a controller: parameters only.
  await right(page).locator('[data-action="camera-preset-punch-in"]').click();
  expect(await lastLabel(page)).toBe('Camera preset');
  expect(shotOf((await shots(page))[0]!).strength).toBe(1.6);
  await right(page).locator('#camera-controller').click();
  await page.locator('[role="option"]', { hasText: 'Orbit' }).click();
  expect(await lastLabel(page)).toBe('Camera controller');
  expect(shotOf((await shots(page))[0]!).controller).toBe('orbit');
  await right(page).locator('[data-action="camera-randomise"]').click();
  expect(await lastLabel(page)).toBe('Randomise shot');
  // Lens presets and the Blender settings are there.
  await right(page).locator('[data-action="camera-lens-85"]').click();
  expect(await lastLabel(page)).toBe('Camera settings');
  for (const id of [
    'camera-type',
    'camera-lens-unit',
    'camera-sensor-fit',
    'camera-shift-x',
    'camera-clip-start',
  ])
    await expect(right(page).locator(`#${id}`)).toBeVisible();
  // Fold and unfold the Camera track.
  const fold = page.locator(
    '#timeline-foundation [data-action="camera-lane-fold"]',
  );
  await fold.click();
  await expect(lanes.first()).toHaveAttribute('data-collapsed', 'true');
  await fold.click();
  await expect(lanes.first()).toHaveAttribute('data-collapsed', 'false');
  // A shot splits like any clip (two shots of the same camera, one step).
  await seekKeep(page, 2.5);
  await page
    .locator('#timeline-foundation [data-action="split"]')
    .first()
    .click();
  expect(await lastLabel(page)).toBe('Split');
  expect(await shots(page)).toHaveLength(2);
  await page.locator('#undo').click();
  expect(await shots(page)).toHaveLength(1);
  await page
    .locator(`#timeline-foundation .nle-clip[data-id="${shot!.id}"]`)
    .click();
  // Duplicate and delete cameras; deleting the last removes the track.
  await right(page).locator('[data-action="camera-duplicate"]').click();
  expect(await lastLabel(page)).toBe('Duplicate camera');
  expect((await shots(page)).length).toBe(2);
  await page.screenshot({ path: 'reports/final3/c-camera-panel.png' });
  await right(page).locator('[data-action="camera-delete"]').click();
  await right(page).locator('[data-action="camera-delete"]').click();
  expect(await shots(page)).toHaveLength(0);
  expect(
    (await scene(page)).tracks.some((t) => t.id.startsWith('camera-track')),
  ).toBe(false);
});

test('[FN3-016] Preview camera shows the controller moving the frame; the export frame equals the preview; layers stay selectable and movable through it', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await seekKeep(page, 0);
  const still = await preview(page, true);
  await addCamera(page);
  await right(page).locator('[data-action="camera-preset-punch-in"]').click();
  await right(page).locator('[data-action="camera-preview"]').click();
  await expect(
    right(page).locator('[data-action="camera-preview"]'),
  ).toHaveAttribute('aria-checked', 'true');
  await seekKeep(page, 4.5);
  const pushed = await preview(page);
  expect(meanDiff(pushed, still)).toBeGreaterThan(4);
  await seekKeep(page, 2);
  const middle = await preview(page);
  expect(meanDiff(middle, pushed)).toBeGreaterThan(1);
  // The exported frame is the preview's frame.
  const file = await exported(page, testInfo);
  expect(meanDiff(file, middle)).toBeLessThan(3);
  await page.screenshot({ path: 'reports/final3/c-preview-camera.png' });
  // Select the headline in the timeline: its box is drawn where the camera
  // shows it (bigger than at rest), and a canvas drag moves it.
  await page
    .locator('#timeline-foundation .nle-clip[data-id="example-headline"]')
    .click();
  await expect
    .poll(async () => (await canvasDebug(page)).corners)
    .not.toBeNull();
  const corners = (await canvasDebug(page)).corners!;
  const box = await canvasBox(page);
  const centre: Point = [
    box.x + (corners[0]![0] + corners[2]![0]) / 2,
    box.y + (corners[0]![1] + corners[2]![1]) / 2,
  ];
  const before = ((await scene(page)).layers as unknown as Layer[]).find(
    (l) => l.id === 'example-headline',
  )!.transform.position.value;
  await page.mouse.move(...centre);
  await page.mouse.down();
  await page.mouse.move(centre[0] + 40, centre[1] + 20, { steps: 5 });
  await page.mouse.up();
  const after = ((await scene(page)).layers as unknown as Layer[]).find(
    (l) => l.id === 'example-headline',
  )!.transform.position.value;
  expect(after[0]).toBeGreaterThan(before[0] + 5);
  // A click on empty paper and back on the headline selects it again.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.mouse.click(centre[0] + 40, centre[1] + 20);
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual(['example-headline']);
});

test('[FN3-017] the camera frame on the canvas edits the start framing: drag trucks, wheel dollies, Alt-drag orbits, one step each; Preview camera hides it', async ({
  page,
}) => {
  await page.goto('/');
  await addCamera(page);
  await expect
    .poll(async () => (await canvasDebug(page)).cameraFrame)
    .not.toBeNull();
  const frame = (await canvasDebug(page)).cameraFrame!;
  const box = await canvasBox(page);
  const view = (await canvasDebug(page)).view;
  const centre: Point = [
    box.x + (frame[0]![0] + frame[2]![0]) / 2,
    box.y + (frame[0]![1] + frame[2]![1]) / 2,
  ];
  await page.mouse.move(...centre);
  await page.mouse.down();
  await page.mouse.move(centre[0] + 60, centre[1], { steps: 6 });
  await page.mouse.up();
  expect(await lastLabel(page)).toBe('Camera framing');
  const moved = shotOf((await shots(page))[0]!).from!;
  expect(moved.x).toBeCloseTo(60 / view[0], 0);
  // The frame followed.
  const after = (await canvasDebug(page)).cameraFrame!;
  expect(after[0]![0] - frame[0]![0]).toBeCloseTo(60, 0);
  await page.screenshot({ path: 'reports/final3/c-camera-frame.png' });
  // Wheel over the frame: dolly (z).
  await page.mouse.move(centre[0] + 60, centre[1]);
  await page.mouse.wheel(0, -100);
  await expect
    .poll(async () => shotOf((await shots(page))[0]!).from?.z ?? 0)
    .toBeGreaterThan(0);
  // Alt-drag: orbit (pan).
  await page.keyboard.down('Alt');
  await page.mouse.move(centre[0] + 60, centre[1]);
  await page.mouse.down();
  await page.mouse.move(centre[0] + 160, centre[1], { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(shotOf((await shots(page))[0]!).from!.pan).toBeCloseTo(-10, 0);
  // End framing: the switch edits `to`.
  await right(page).locator('[data-camera-edit="end"]').click();
  const end = (await canvasDebug(page)).cameraFrame!;
  const endCentre: Point = [
    box.x + (end[0]![0] + end[2]![0]) / 2,
    box.y + (end[0]![1] + end[2]![1]) / 2,
  ];
  await page.mouse.move(...endCentre);
  await page.mouse.down();
  await page.mouse.move(endCentre[0], endCentre[1] + 30, { steps: 4 });
  await page.mouse.up();
  expect(
    (shotOf((await shots(page))[0]!) as { to?: { y?: number } }).to?.y,
  ).toBeCloseTo(30 / view[0], 0);
  // Preview camera: no frame to edit.
  await right(page).locator('[data-action="camera-preview"]').click();
  await expect
    .poll(async () => (await canvasDebug(page)).cameraFrame)
    .toBeNull();
});

test('[FN3-018] a camera on scene 2 leaves scene 1 alone; shots survive a reload; a project without cameras has no Camera track', async ({
  page,
}) => {
  await page.goto('/');
  expect(
    (await scene(page)).tracks.some((t) => t.id.startsWith('camera-track')),
  ).toBe(false);
  await expect(
    page.locator('#timeline-foundation [data-camera="true"]'),
  ).toHaveCount(0);
  await showSceneStrip(page);
  await page.locator('#scene-strip-add').click();
  await page.locator('[data-action="strip-add-blank"]').click();
  const second = (await hook(page)).session.compositionId;
  await addCamera(page);
  const { project } = await hook(page);
  const shotScenes = project.compositions.filter((c) =>
    c.layers.some(
      (l) => (l as unknown as Layer).properties.role?.value === 'camera',
    ),
  );
  expect(shotScenes.map((c) => c.id)).toEqual([second]);
  // Saved: a reload keeps the shot and its camera.
  await expect(page.locator('#save-status-text')).toContainText(/Saved/);
  await page.reload();
  await expect
    .poll(async () =>
      (await hook(page)).project.compositions.some((c) =>
        c.layers.some(
          (l) => (l as unknown as Layer).properties.role?.value === 'camera',
        ),
      ),
    )
    .toBe(true);
});
