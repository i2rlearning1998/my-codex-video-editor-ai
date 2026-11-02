// P2-R3: the cinematic panel: the rail, the Style reel and the Director room.
import { test, expect } from './fixtures';
import { signUp } from './p2-helpers';

test('[P2R3-001] [P2R3-002] [P2R3-003] the Director room: you and Director look different, Enter sends and Shift+Enter makes a new line, "Your film" fills as you answer, a model can be chosen, a notes file can be attached and the voice button is there', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/styles');
  await page.locator('[data-style="story-explainer"] a.button').click();
  await page.locator('#f-idea').fill('How Eratosthenes measured the Earth.');
  await page.locator('#talk-director').click();

  const box = page.locator('#chat-input');
  await expect(page.locator('.msg.director').first()).toBeVisible();
  await expect(page.locator('#dir-facts')).toContainText('Eratosthenes');

  // An answer chip fills "Your film".
  await page.locator('[data-answer="Write it for me"]').click();
  await expect(page.locator('#dir-facts')).toContainText('Write it for me');
  await expect(page.locator('#dir-ready')).toContainText('% ready');

  // Shift+Enter is a new line; Enter sends.
  await box.fill('first line');
  await box.press('Shift+Enter');
  await box.pressSequentially('second line');
  await expect(box).toHaveValue('first line\nsecond line');
  await box.press('Enter');
  await expect(page.locator('.msg.user').last()).toContainText('second line');
  await expect(box).toHaveValue('');

  // The two sides of the chat sit on opposite sides.
  const me = await page.locator('.msg.user').last().boundingBox();
  const ai = await page.locator('.msg.director').first().boundingBox();
  expect(me!.x).toBeGreaterThan(ai!.x + 150);

  // The send button is off while the box is empty.
  await expect(page.locator('#chat-send')).toBeDisabled();

  // Model: Fast, Balanced and Best are listed; Best is locked on Free.
  await page.locator('#chat-model').click();
  await expect(page.locator('.cmp-item.model')).toHaveCount(3);
  await expect(page.locator('[data-model="mock-best"]')).toBeDisabled();
  await page.locator('[data-model="mock-fast"]').click();
  await expect(page.locator('#chat-model')).toContainText('Fast');

  // + menu: attach a notes file; it becomes a chip, then a note and a line.
  await page.locator('#chat-plus').click();
  await expect(page.locator('#chat-add-file')).toBeVisible();
  await page.locator('#chat-file-input').setInputFiles({
    name: 'script.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Shadows in Syene and Alexandria.'),
  });
  await expect(page.locator('#chat-files')).toContainText('script.txt');
  await expect(page.locator('#chat-send')).toBeEnabled();
  await page.locator('#chat-send').click();
  await expect(page.locator('.msg.user').last()).toContainText('script.txt');
  await expect(page.locator('.dir-note').last()).toContainText('script.txt');

  // Voice typing: the button exists (it is only off where the browser has none).
  await expect(page.locator('#chat-mic')).toBeVisible();
});

test('[P2R3-004] Live Build draws each scene from the plan itself (real titles and layout on a canvas), the film strip fills in as scenes finish, and the percent reaches 100', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/styles');
  await page.locator('[data-style="story-explainer"] a.button').click();
  await page
    .locator('#f-idea')
    .fill('How Eratosthenes measured the circumference of the Earth.');
  await page.getByText('Write it for me').first().click();
  await page.getByText('Text to speech').first().click();
  await page.locator('#make-plan').click();
  await page.locator('#plan-card .scene').first().waitFor();
  await page.locator('#plan-approve').click();
  await expect(page.locator('#build-status')).toHaveAttribute(
    'data-state',
    'done',
  );
  await expect(page.locator('.meter-pct')).toContainText('100');
  const thumbs = page.locator('#build-preview .frame-thumb canvas');
  const n = await thumbs.count();
  expect(n).toBeGreaterThanOrEqual(3);
  // Each finished frame has something drawn on it (not one flat colour).
  const varied = await thumbs.evaluateAll((list) =>
    (list as HTMLCanvasElement[]).map((cv) => {
      const data = cv
        .getContext('2d')!
        .getImageData(0, 0, cv.width, cv.height).data;
      const first = data.slice(0, 4).join();
      for (let i = 0; i < data.length; i += 4)
        if (data.slice(i, i + 4).join() !== first) return true;
      return false;
    }),
  );
  expect(varied.every(Boolean)).toBe(true);
  await expect(page.locator('#open-in-editor')).toBeVisible();
});
