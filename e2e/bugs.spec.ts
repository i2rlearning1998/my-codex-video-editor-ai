import { test, expect, hook } from './fixtures';

test.fail(
  '[TL-004] locking Video 1 prevents Delete from removing clip-a',
  async ({ page, openFixtureProject }) => {
    await page.goto('/');
    await openFixtureProject('nle-example.json');
    await page.locator('[data-action="track-lock"][data-id="video-1"]').click();
    await page
      .locator('.timeline-clip[data-clip-id="clip-a"]')
      .click({ position: { x: 40, y: 10 } });
    await page.keyboard.press('Delete');
    const track = (await hook(page)).project.compositions[0]!.tracks.find(
      (item) => item.id === 'video-1',
    )!;
    expect(track.clips.map((clip) => clip.id)).toContain('clip-a');
  },
);

test.fail(
  '[TL-019] right trim stops at the next clip instead of overlapping it',
  async ({ page, openFixtureProject }) => {
    await page.goto('/');
    await openFixtureProject('nle-example.json');
    await page.bringToFront();
    await page
      .locator('.timeline-clip[data-clip-id="clip-a"]')
      .click({ position: { x: 40, y: 10 } });
    const trim = page.locator('[data-clip-id="clip-a"] .timeline-trim.right');
    await trim.hover();
    const handle = (await trim.boundingBox())!;
    await page.mouse.move(handle.x + 3, handle.y + 8);
    await page.mouse.down();
    await page.mouse.move(handle.x + 203, handle.y + 8, { steps: 12 });
    await page.mouse.up();
    const clips = (await hook(page)).project.compositions[0]!.tracks.find(
      (item) => item.id === 'video-1',
    )!.clips;
    const a = clips.find((clip) => clip.id === 'clip-a')!;
    const b = clips.find((clip) => clip.id === 'clip-b')!;
    expect(a.startTime + a.duration).toBeLessThanOrEqual(b.startTime);
  },
);
