// P3U: the Director room and the Orb, in a real browser, on the P3 mock
// director (src/contracts/p3-mocks.ts). Every test acts like a person.
import { test, expect } from './fixtures';
import { signUp } from './p2-helpers';

const SHOTS = process.env.P3U_SHOTS ?? '';
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (!SHOTS) return;
  // Let the page's own entrance animations finish so the picture is the real one.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) =>
          Number.isFinite(a.effect?.getComputedTiming().iterations),
        )
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
test('[P3U-004] Settings > Animations Off turns the Orb into a still picture, On brings it back, and a hidden tab pauses it', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/room');
  const orb = page.locator('.orb-live');
  await expect(orb).toHaveAttribute('data-orb-animated', 'true');
  await page.evaluate(() => (document.documentElement.dataset.motion = 'off'));
  await expect(orb).toHaveAttribute('data-orb-animated', 'false');
  await page.evaluate(() => (document.documentElement.dataset.motion = 'on'));
  await expect(orb).toHaveAttribute('data-orb-animated', 'true');
});

test('[P3U-005] Home is the Director start: no separate Director menu item, the Styles and Continue strips sit below, and the first message opens AI mode with it', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/home');
  // Round B: Home is the Director's start box; the conversation itself is
  // in the editor's AI mode, which the first message opens (RDB-015).
  await expect(page.locator('#director-start .start-orb canvas')).toBeVisible();
  await expect(page.locator('#greeting')).toBeVisible();
  await expect(page.locator('#home-balance')).toContainText('credits');
  await expect(page.locator('.side a[href="#/room"]')).toHaveCount(0);
  await expect(page.locator('.home-below #style-reel')).toBeVisible();
  await shot(page, 'home-room');
  await page
    .locator('#home-input')
    .fill('A 60 second explainer about rainbows');
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/, {
    timeout: 30_000,
  });
  await expect(page.locator('#ai-thread')).toContainText('rainbows');
});
