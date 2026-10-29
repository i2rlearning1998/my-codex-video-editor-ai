import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, allowError } from './fixtures';
import {
  OWNER,
  ownerCode,
  startOwnerStack,
  type OwnerStack,
} from './lib-owner-helpers';

// Phase 1 library manager (P1-14, P1-17): the owner app in a real browser,
// with its real publish gate (headless Chromium inside the owner server).
const PACKS = 'examples/creator-packs';
let stack: OwnerStack;
test.beforeAll(async () => {
  stack = await startOwnerStack();
});
test.afterAll(() => stack?.stop());

async function logIn(page: Page) {
  allowError(
    page,
    (message) =>
      message.includes(stack.ownerUrl) &&
      /http (401|403)|status of (401|403)/.test(message),
    'The owner app answers 401 before login and 403 when it asks to re-authenticate, on purpose.',
  );
  await page.goto(stack.ownerUrl);
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(OWNER.password);
  await page.locator('#code').fill(ownerCode());
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('[data-tab="library"]')).toBeVisible();
}
async function upload(page: Page, file: string) {
  await page.locator('[data-tab="upload"]').click();
  await page.locator('#upload-file').setInputFiles(path.join(PACKS, file));
  await page.locator('#upload-send').click();
  const result = page.locator('#upload-result');
  await expect(result).not.toContainText('Checking', { timeout: 90_000 });
  return result;
}

test('[LIB-017][LIB-014][LIB-016][FIX7-015] one command starts the manager and its catalog; the owner logs in with a 2-step code, a good pack is published, a bad one is rejected with its reason, and Unpublish asks again for the password and code', async ({
  page,
}) => {
  test.setTimeout(240_000);
  // A wrong code is refused.
  allowError(
    page,
    (message) => message.includes(stack.ownerUrl) && /401|403/.test(message),
    'Wrong codes and the re-authentication prompt answer 401 and 403 on purpose.',
  );
  await page.goto(stack.ownerUrl);
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(OWNER.password);
  await page.locator('#code').fill('000000');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('#login-error')).toHaveText(
    'The email, password or code is wrong.',
  );
  await logIn(page);

  const good = await upload(page, 'shape.json');
  await expect(good).toContainText('Published shape-pack-shape-kite.');
  await expect(good).toContainText(/Catalog version \d+ is live\./);
  const bad = await upload(page, 'bad-missing-field.json');
  await expect(bad.locator('.error')).toContainText(
    'Rejected shape-kite in bad-missing-field.json: The field "data.width" is wrong: Required.',
  );

  await page.locator('[data-tab="library"]').click();
  await expect(page.locator('#category [data-value="elements"]')).toBeVisible();
  await expect(page.locator('#kinds')).toBeVisible();
  await page.locator('#search').fill('kite');
  await page.locator('#search').press('Enter');
  const card = page.locator('.item[data-id="shape-pack-shape-kite"]');
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toHaveJSProperty('complete', true);
  await expect(card.locator('[data-state]')).toContainText('Published');
  // Featured, order and a licence: one save.
  await card.locator('summary').click();
  await card.locator('[data-field="featured"]').check();
  await card.locator('[data-field="license"]').fill('CC BY 4.0');
  await card.locator('[data-field="credit"]').fill('Kite by the owner');
  await card.locator('[data-action="save"]').click();
  await expect(page.locator('#status')).toContainText(
    /Catalog version \d+ is live/,
  );
  // Unpublish is dangerous: the window of OWNER_REAUTH_SECONDS (1 s here)
  // has passed, so the app asks for the password and a fresh code.
  await expect
    .poll(async () =>
      (await page.request.get(`${stack.ownerUrl}api/session`)).status(),
    )
    .toBe(200);
  await page
    .locator('.item[data-id="shape-pack-shape-kite"] [data-action="unpublish"]')
    .click();
  await expect(page.locator('#reauth')).toBeVisible();
  await page.locator('#reauth-password').fill(OWNER.password);
  await page.locator('#reauth-code').fill(ownerCode());
  await page.locator('#reauth-confirm').click();
  await expect(
    page.locator('.item[data-id="shape-pack-shape-kite"] [data-state]'),
  ).toContainText('Not published');

  // The audit log lists every action.
  await page.locator('[data-tab="audit"]').click();
  await expect(page.locator('#audit-state')).toHaveText(
    'The audit log is intact.',
  );
  for (const action of ['login', 'upload', 'update', 'reauth', 'unpublish'])
    await expect(
      page.locator(`#audit tr[data-action="${action}"]`).first(),
    ).toBeVisible();
  // Hindi labels.
  await page.locator('#language').click();
  await expect(page.locator('[data-tab="library"]')).toHaveText('लाइब्रेरी');
});
