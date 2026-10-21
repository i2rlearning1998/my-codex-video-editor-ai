import type { Page } from '@playwright/test';
import { expect, hook, test } from './fixtures';

// FIX1 F6: a nested clip is a compound clip that opens on the timeline with
// its real lanes and clips, fully editable; each edit is one undo step on
// the main timeline, the nest's length follows its inside, and Un-nest puts
// the edited clips back.
const ready = (page: Page) =>
  expect.poll(() => page.evaluate(() => '__AIVE__' in window)).toBe(true);
const scene = async (page: Page) => {
  const { project, session } = await hook(page);
  return project.compositions.find((c) => c.id === session.compositionId)!;
};
const labels = async (page: Page) => (await hook(page)).history.labels;
const clipEl = (page: Page, layerId: string) =>
  page.locator(
    `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${layerId}"]`,
  );
const menuEntry = (page: Page, command: string) =>
  page.locator(`.timeline-menu [data-command="${command}"]`);
const nestedClipOf = async (page: Page) =>
  (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((clip) => (clip.metadata as { nested?: unknown }).nested)!;
async function trimEnd(page: Page, layerId: string, pixels: number) {
  const element = clipEl(page, layerId);
  await element.click({ position: { x: 30, y: 8 } });
  const grip = element.locator('[data-trim="right"]');
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 - pixels,
    box.y + box.height / 2,
    {
      steps: 8,
    },
  );
  await page.mouse.up();
}

test('[FX1-014] nest two clips on two lanes, open it: its real lanes and clips show and trim like any clip (one undo step each), the nest follows its new length, Esc and Back leave, Un-nest puts the trimmed clips back', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const current = await scene(page);
  const top = new Set(current.layers.map((layer) => layer.id));
  const lanes = [...current.tracks]
    .filter((track) => track.type !== 'audio' && !track.locked)
    .sort((a, b) => a.order - b.order);
  const picks = lanes
    .map((track) => track.clips.find((clip) => top.has(clip.layerId)))
    .filter((clip) => !!clip)
    .slice(0, 2)
    .map((clip) => clip!.layerId);
  expect(picks.length).toBe(2);
  await clipEl(page, picks[0]!).click();
  await clipEl(page, picks[1]!).click({ modifiers: ['Shift'] });
  await clipEl(page, picks[1]!).click({ button: 'right' });
  await menuEntry(page, 'nest-clips').click();
  await expect.poll(async () => (await labels(page)).at(-1)).toBe('Nest clips');
  const nested = await nestedClipOf(page);
  const groupId = nested.layerId;
  const before = nested.duration;
  // The block: a nest icon, a map of what is inside and its length.
  const block = clipEl(page, groupId);
  await expect(block).toHaveAttribute('data-nested', 'true');
  await expect(block.locator('.nest-map-clip')).toHaveCount(2);
  await expect(block.locator('.nest-length')).toContainText('s');
  // Open it: the breadcrumb names only the path; the inner lanes show.
  await block.dblclick();
  const bar = page.locator('#nest-bar');
  await expect(bar).toBeVisible();
  await expect(bar.locator('.nest-crumb')).toHaveText([
    'Main timeline',
    'Nested clip',
  ]);
  await expect(bar.locator('.nest-child')).toHaveCount(0);
  await expect(bar.locator('[data-action="nest-exit"]')).toHaveText(
    'Back to main timeline',
  );
  const inner = page.locator('#timeline-foundation .timeline-clip.nle-clip');
  await expect(inner).toHaveCount(2);
  await expect(clipEl(page, picks[0]!)).toBeVisible();
  await expect(clipEl(page, picks[1]!)).toBeVisible();
  await expect(clipEl(page, groupId)).toHaveCount(0);
  await page.screenshot({ path: 'reports/fix1/f6-nest-inside.png' });
  // Trim both inner clips' ends: each is one undo step on the main project.
  const steps = (await labels(page)).length;
  await trimEnd(page, picks[0]!, 120);
  await expect.poll(async () => (await labels(page)).length).toBe(steps + 1);
  await trimEnd(page, picks[1]!, 120);
  await expect.poll(async () => (await labels(page)).length).toBe(steps + 2);
  const records = (
    (await nestedClipOf(page)).metadata as {
      nested: { duration: number; clips: { clip: { duration: number } }[] };
    }
  ).nested;
  expect(records.duration).toBeLessThan(before - 0.5);
  // The canvas shows the inside: the selected inner clip is a real layer.
  expect((await hook(page)).session.selectedIds).toEqual([picks[1]]);
  // Esc (nothing selected) leaves.
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(0);
  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
  // On the main timeline the nest is shorter now.
  const after = await nestedClipOf(page);
  expect(after.duration).toBeCloseTo(records.duration, 3);
  // Undo the last inner trim from the main timeline: the nest grows back.
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await nestedClipOf(page)).duration)
    .toBeGreaterThan(after.duration + 0.1);
  await page.keyboard.press('Control+y');
  // Back to main timeline button.
  await clipEl(page, groupId).dblclick();
  await expect(bar).toBeVisible();
  await bar.locator('[data-action="nest-exit"]').click();
  await expect(bar).toBeHidden();
  // Un-nest: the trimmed clips come back with their new lengths.
  const trimmed = Object.fromEntries(
    (
      (await nestedClipOf(page)).metadata as {
        nested: { clips: { clip: { layerId: string; duration: number } }[] };
      }
    ).nested.clips.map((r) => [r.clip.layerId, r.clip.duration]),
  );
  await clipEl(page, groupId).click({ button: 'right' });
  await menuEntry(page, 'unnest-clip').click();
  await expect
    .poll(async () => (await labels(page)).at(-1))
    .toBe('Flatten nested clip');
  const loose = (await scene(page)).tracks.flatMap((track) => track.clips);
  for (const id of picks)
    expect(loose.find((clip) => clip.layerId === id)!.duration).toBeCloseTo(
      trimmed[id]!,
      3,
    );
});
