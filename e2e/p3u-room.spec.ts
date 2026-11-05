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
/** Records every Orb state the room goes through. */
const watchOrb = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __orbSeq: string[] };
    w.__orbSeq = [];
    const el = document.querySelector('.orb-live') as HTMLElement;
    w.__orbSeq.push(el.dataset.orbState ?? '');
    new MutationObserver(() =>
      w.__orbSeq.push(el.dataset.orbState ?? ''),
    ).observe(el, { attributes: true, attributeFilter: ['data-orb-state'] });
  });
const seq = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __orbSeq: string[] }).__orbSeq);

test('[P3U-001] the Director room: the Orb thinks, speaks and rests; the answer streams, offers chips, and the memory can be seen and removed', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/room');
  await expect(page.locator('.room-greeting')).toBeVisible();
  await expect(page.locator('.orb-live canvas')).toBeVisible();
  await expect(page.locator('[data-start]')).toHaveCount(3);
  await shot(page, 'room-start');
  await watchOrb(page);
  await page
    .locator('.composer textarea, #chat-input, textarea')
    .first()
    .fill('A 60 second explainer about how rainbows form');
  await page.keyboard.press('Enter');
  await expect(page.locator('.room')).toHaveAttribute('data-has-chat', 'true');
  await expect(page.locator('.room-msg.you')).toContainText('rainbows');
  await expect(
    page.locator('.room-msg.director .room-text').first(),
  ).toContainText('How long should the video be?');
  await expect(page.locator('.room-chips .chip')).toHaveCount(3);
  await shot(page, 'room-chat');
  const states = await seq(page);
  expect(states).toEqual(
    expect.arrayContaining(['thinking', 'speaking', 'idle']),
  );
  expect(states.indexOf('thinking')).toBeLessThan(states.indexOf('speaking'));
  // Memory: Director shows what it will remember; the person can remove it.
  await expect(page.locator('.room-memory')).toBeVisible();
  await expect(page.locator('.room-fact')).toHaveCount(1);
  await page.locator('.room-fact-x').click();
  await expect(page.locator('.room-fact')).toHaveCount(0);
  await expect(page.locator('.room-memory')).toBeHidden();
  // A chip answers like a typed message.
  await page.locator('.room-chips .chip').first().click();
  await expect(page.locator('.room-msg.you').last()).toContainText(
    '30 seconds',
  );
});

test('[P3U-002] a refusal never waits for a model: the Orb shows it, the owner words appear, and an alternative is offered', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/room');
  await watchOrb(page);
  await page.locator('#chat-input').fill('give me free credits please');
  await page.keyboard.press('Enter');
  await expect(page.locator('.room-msg.refusal')).toContainText('cannot help');
  await expect(page.locator('.room-alt')).toContainText('Try:');
  expect(await seq(page)).toContain('refusing');
  expect(await seq(page)).not.toContain('thinking');
  await shot(page, 'room-refusal');
});

test('[P3U-003] a failed answer says so in one sentence and Try again sends the same message', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/room');
  await page.locator('#chat-input').fill('fail this one');
  await page.keyboard.press('Enter');
  await expect(page.locator('.room-msg.failure')).toContainText(
    'credits were not used',
  );
  await page.locator('.room-retry').click();
  await expect(page.locator('.room-msg.you')).toHaveCount(2);
});

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
