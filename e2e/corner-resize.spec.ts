import { test, expect, hook, toScreen } from './fixtures';

test('[CV-007] corner resize stays proportional, anchors the opposite corner and undoes in one step', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.locator('#scene-list [data-layer-id="example-badge"]').click();
  const before = await hook(page);
  const layer = before.project.compositions[0]!.layers.find(
    (item) => item.id === 'example-badge',
  )!;
  const corner = await toScreen(page, 76 + 224, 456 + 48);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 56, corner.y + 12, { steps: 12 });
  await page.mouse.up();
  const after = await hook(page);
  const resized = after.project.compositions[0]!.layers.find(
    (item) => item.id === layer.id,
  )!;
  expect(resized.transform.position.value[0]).toBeCloseTo(
    layer.transform.position.value[0],
    5,
  );
  expect(resized.transform.position.value[1]).toBeCloseTo(
    layer.transform.position.value[1],
    5,
  );
  const width =
    Number(resized.properties.width!.value) * resized.transform.scale.value[0];
  const height =
    Number(resized.properties.height!.value) * resized.transform.scale.value[1];
  expect(width).toBeGreaterThan(224);
  expect(width / height).toBeCloseTo(224 / 48, 5);
  expect(after.history.labels).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath('corner-resize.png') });
  await page.keyboard.press('Control+z');
  expect((await hook(page)).project).toEqual(before.project);
});
