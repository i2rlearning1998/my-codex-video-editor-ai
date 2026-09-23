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
