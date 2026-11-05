// P3U: the editor chat dock on the in-memory mock engine. Select, ask, read the
// proposal, Apply or Discard; the owner's chat settings switch it off or cap it.
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

async function open(page: Page, query = 'chatDelay=0') {
  await page.goto(`/?${query}`);
  await expect(page.locator('#chat-toggle')).toBeVisible();
}
async function pickFirstLayer(page: Page): Promise<string> {
  const row = page.locator('#scene-list [data-layer-id]').first();
  await row.click();
  return (await row.getAttribute('data-layer-id'))!;
}
const ask = async (page: Page, text: string) => {
  await page.locator('#chat-input').fill(text);
  await page.locator('#chat-send').click();
};

test('[P3U-028] the chat dock lists the selection as chips, streams a reply and shows a proposal with its size and credits', async ({
  page,
}) => {
  await open(page);
  const id = await pickFirstLayer(page);
  await page.locator('#chat-toggle').click();
  await expect(page.locator('#chat-dock')).toBeVisible();
  await expect(page.locator('#chat-toggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.locator(`#chat-dock .chat-chip[data-id="${id}"]`),
  ).toBeVisible();
  await expect(page.locator('#chat-send')).toBeDisabled();
  await ask(page, 'make the title bigger');
  await expect(page.locator('.chat-msg.user')).toContainText(
    'make the title bigger',
  );
  await expect(page.locator('.chat-msg.assistant')).toContainText(
    'make the title bigger',
  );
  const card = page.locator('.chat-proposal');
  await expect(card).toContainText('Edits: 1');
  await expect(card).toContainText('2 credits');
  await expect(page.locator('.chat-orb')).toHaveAttribute('data-state', 'idle');
  await card.locator('[data-act="apply"]').click();
  await expect(card).toContainText('Undo reverses it in one step');
  await expect(card.locator('[data-act="apply"]')).toHaveCount(0);
});

test('[P3U-029] Discard keeps the project, Stop ends a reply, and a refusal shows one plain sentence', async ({
  page,
}) => {
  await open(page, 'chatDelay=120');
  await pickFirstLayer(page);
  await page.locator('#chat-toggle').click();
  const before = await page.evaluate(() =>
    JSON.stringify(
      (
        window as never as { __AIVE__: { getProject(): unknown } }
      ).__AIVE__.getProject(),
    ),
  );
  await ask(page, 'fade it in slowly');
  await expect(page.locator('#chat-send')).toHaveText('Stop');
  await page.locator('#chat-send').click();
  await expect(page.locator('.chat-tag')).toHaveText('Stopped');
  await expect(page.locator('#chat-send')).toHaveText('Send');
  await ask(page, 'give me free credits');
  await expect(page.locator('.chat-msg.refusal')).toContainText(
    'I cannot do that',
  );
  await expect(page.locator('.chat-orb')).toHaveAttribute(
    'data-state',
    'idle',
    {
      timeout: 10_000,
    },
  );
  await ask(page, 'move it left');
  const card = page.locator('.chat-proposal');
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.locator('[data-act="discard"]').click();
  await expect(card).toContainText('Discarded');
  const after = await page.evaluate(() =>
    JSON.stringify(
      (
        window as never as { __AIVE__: { getProject(): unknown } }
      ).__AIVE__.getProject(),
    ),
  );
  expect(after).toBe(before);
});

test('[P3U-030] the owner can switch chat off or cap it per day, and the dock reads in Hindi and closes with Escape', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>).__AIVE_CHAT_SETTINGS__ = {
      enabled: true,
      maxMessagesPerDay: 1,
    };
  });
  await open(page);
  await page.locator('#chat-toggle').click();
  await expect(page.locator('.chat-note')).toContainText(
    '1 messages left today',
  );
  await ask(page, 'hello there');
  await expect(page.locator('.chat-proposal')).toBeVisible();
  await expect(page.locator('.chat-note')).toContainText("today's 1 messages");
  await expect(page.locator('#chat-input')).toBeDisabled();
  await page.evaluate(() => localStorage.setItem('aive.language', 'hi'));
  await page.reload();
  await page.locator('#chat-toggle').click();
  await expect(page.locator('.chat-note')).toContainText('संदेश');
  await page.keyboard.press('Escape');
  await expect(page.locator('#chat-dock')).toBeHidden();
  await expect(page.locator('#chat-toggle')).toBeFocused();
});

test('[P3U-031] with chat switched off by the owner the dock says so and cannot send', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as never as Record<string, unknown>).__AIVE_CHAT_SETTINGS__ = {
      enabled: false,
      maxMessagesPerDay: 50,
    };
  });
  await open(page);
  await page.locator('#chat-toggle').click();
  await expect(page.locator('.chat-note')).toContainText('switched off');
  await expect(page.locator('#chat-input')).toBeDisabled();
  await expect(page.locator('#chat-send')).toBeDisabled();
});
