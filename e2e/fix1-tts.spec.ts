import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, allowError } from './fixtures';

// FIX1 F3: one "Text to speech" tool under Record & create, cloud engines
// only (the browser and offline voices are behind feature flags). Sarvam is
// mocked: its answer is a real WAV, so Preview, Save and the timeline run.
const panel = (page: Page) => page.locator('#library-record');
const vo = (page: Page) => panel(page).locator('.voiceover');

/** A mono 16-bit WAV of `seconds` of a 440 Hz tone, base64. */
function wav(seconds = 0.4, rate = 24000) {
  const n = Math.round(seconds * rate);
  const buffer = Buffer.alloc(44 + n * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + n * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buffer.writeInt16LE(
      Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)),
      44 + i * 2,
    );
  return buffer.toString('base64');
}

async function mockSarvam(page: Page, status = { value: 200 }) {
  const bodies: string[] = [];
  allowError(
    page,
    (m) => /http (401|402|403)|status of (401|402|403)/.test(m),
    'The mocked Sarvam answers a bad key and a used-up quota on purpose.',
  );
  await page.route('https://api.sarvam.ai/**', async (route) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
    };
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    bodies.push(route.request().postData() ?? '');
    if (status.value !== 200)
      return route.fulfill({ status: status.value, headers, body: '{}' });
    return route.fulfill({
      status: 200,
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ audios: [wav()] }),
    });
  });
  return bodies;
}

test('[FX1-008] one Text to speech tool: a single card, no browser or offline voice, no right-hand Speech panel; with no key an empty state offers each cloud provider and opens Settings at its key', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'Record');
  await expect(panel(page).locator('[data-record="tts"]')).toHaveCount(1);
  await expect(panel(page).locator('.voiceover')).toHaveCount(0);
  await expect(
    page.locator('#rail-right [data-section="Speech"]'),
  ).toBeHidden();
  await panel(page).locator('[data-record="tts"]').click();
  await expect(vo(page).locator('#voiceover-title')).toHaveText(
    'Text to speech',
  );
  const empty = vo(page).locator('.voiceover-empty');
  await expect(empty).toContainText('Add a free key to make voices');
  const providers = await empty
    .locator('[data-provider]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-provider')));
  expect(providers).toEqual([
    'sarvam',
    'google-cloud-tts',
    'elevenlabs',
    'minimax',
  ]);
  await empty.locator('[data-provider="sarvam"]').click();
  await expect(page.locator('#key-sarvam-apiKey')).toBeFocused();
  await page.keyboard.press('Escape');
  // Back returns to the cards.
  await panel(page).locator('[data-action="record-back"]').click();
  await expect(panel(page).locator('[data-record="tts"]')).toBeVisible();
});

test('[FX1-009] Text to speech with Sarvam (mocked): Hindi voice, text count and Add pause, Preview plays, Save to Media, Add to timeline; a bad key and a used-up quota say so with Copy diagnostics', async ({
  page,
}) => {
  const status = { value: 200 };
  const bodies = await mockSarvam(page, status);
  await page.addInitScript(() =>
    localStorage.setItem(
      'aive.provider-key.sarvam.apiKey',
      JSON.stringify('sarvam-test-key-1234'),
    ),
  );
  await page.goto('/');
  await showCategory(page, 'Record');
  await panel(page).locator('[data-record="tts"]').click();
  const options = await vo(page)
    .locator('#vo-engine option')
    .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
  expect(options).not.toContain('browser');
  expect(options).not.toContain('local-tts');
  await expect(vo(page).locator('#vo-engine')).toHaveValue('sarvam');
  await vo(page).locator('#vo-language').selectOption('hi-IN');
  await expect(vo(page).locator('#vo-voice')).not.toHaveValue('');
  await vo(page).locator('#vo-text').fill('नमस्ते दुनिया');
  await vo(page).locator('[data-action="vo-pause"]').click();
  await page.keyboard.type('फिर मिलेंगे');
  await expect(vo(page).locator('#vo-text')).toHaveValue(/\[pause\]/);
  await expect(vo(page).locator('#vo-count')).toContainText('/ 5000');
  await vo(page).locator('[data-action="vo-preview"]').click();
  await expect(vo(page).locator('.voiceover-message')).toHaveText(
    'Playing the preview…',
  );
  await vo(page).locator('[data-action="vo-save"]').click();
  await expect(vo(page).locator('.voiceover-message')).toHaveText(
    'Saved to Media.',
  );
  // The pause split the text: two requests, the mark never sent.
  expect(bodies.length).toBeGreaterThanOrEqual(3);
  expect(bodies.some((body) => body.includes('[pause]'))).toBe(false);
  const asset = (
    (await hook(page)).project.assets as unknown as {
      type: string;
      metadata: { speech?: { providerId: string } };
    }[]
  ).at(-1)!;
  expect(asset.type).toBe('audio');
  expect(asset.metadata.speech?.providerId).toBe('sarvam');
  const lanes = (await hook(page)).project.compositions[0]!.tracks.length;
  await vo(page).locator('[data-action="vo-add"]').click();
  await expect
    .poll(async () => (await hook(page)).project.compositions[0]!.tracks.length)
    .toBe(lanes + 1);
  await vo(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'reports/fix1/f3-tts.png' });
  // A bad key.
  status.value = 401;
  await vo(page).locator('#vo-text').fill('Another line');
  await vo(page).locator('[data-action="vo-save"]').click();
  await expect(vo(page).locator('.voiceover-message')).toContainText(
    'needs a valid key',
  );
  await expect(
    vo(page).locator('[data-action="copy-diagnostics"]'),
  ).toBeVisible();
  // A used-up quota (402), and a 403 that may be either.
  status.value = 402;
  await vo(page).locator('#vo-text').fill('A line');
  await vo(page).locator('[data-action="vo-save"]').click();
  await expect(vo(page).locator('.voiceover-message')).toContainText('402');
  status.value = 403;
  await vo(page).locator('#vo-text').fill('One more line');
  await vo(page).locator('[data-action="vo-save"]').click();
  await expect(vo(page).locator('.voiceover-message')).toContainText('quota');
});
