import type { Page } from '@playwright/test';
import { test, expect, allowError } from './fixtures';
import {
  OWNER,
  ownerCode,
  startOwnerStack,
  type OwnerStack,
} from './lib-owner-helpers';

// P4 Part 3: the Admin screens inside the Owner App, in a real browser. The
// owner logs in with the 2-step code; dangerous actions ask for the password
// and a fresh code again. Nothing here is pre-assigned: the test adds its own
// provider, key and models.
let stack: OwnerStack;
test.beforeAll(async () => {
  stack = await startOwnerStack(3);
});
test.afterAll(() => stack?.stop());

async function logIn(page: Page) {
  allowError(
    page,
    (message) =>
      message.includes(stack.ownerUrl) && /401|403|502|503/.test(message),
    'The owner app answers 401 before login and 403 when it asks to re-authenticate, on purpose.',
  );
  await page.goto(stack.ownerUrl);
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(OWNER.password);
  await page.locator('#code').fill(ownerCode());
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('[data-tab="dashboard"]')).toBeVisible();
}
/** Waits for the status line; answers the password and code if they are asked. */
async function done(page: Page, expected: RegExp) {
  await expect
    .poll(
      async () => {
        const dialog = page.locator('#reauth');
        if (await dialog.isVisible()) {
          await page.locator('#reauth-password').fill(OWNER.password);
          await page.locator('#reauth-code').fill(ownerCode());
          await page.locator('#reauth-confirm').click();
        }
        return (await page.locator('#status').textContent()) ?? '';
      },
      { timeout: 30_000 },
    )
    .toMatch(expected);
}
const clearStatus = (page: Page) =>
  page.evaluate(() => {
    const s = document.getElementById('status');
    if (s) s.textContent = '';
  });

test('[P4A-007][P4A-008][P4A-009] the owner adds a provider, keeps its key in the vault, adds models and chooses a model per job; only capable models are offered', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await logIn(page);
  await page.locator('[data-tab="providers"]').click();
  await expect(page.locator('#providers')).toBeVisible();
  // Nothing is pre-assigned: the Editor chat has no model chosen yet.
  await expect(page.locator('select[data-slot="editor-chat"]')).toHaveValue('');

  // A provider with its own address (any OpenAI-compatible service).
  await clearStatus(page);
  await page.locator('#new-provider-name').fill('Acme AI');
  await page.locator('#new-provider-kind').selectOption('openai-compatible');
  await page.locator('#new-provider-url').fill('http://127.0.0.1:9/v1');
  await expect(page.locator('#new-provider-key')).toHaveValue(
    'ACME_AI_API_KEY',
  );
  await page.locator('#add-provider-save').click();
  await done(page, /Settings version \d+ is live/);
  const row = page.locator('[data-provider="acme-ai"]');
  await expect(row).toBeVisible();

  // Its key goes to the vault; the page shows the last 4 only.
  await clearStatus(page);
  const secret = 'sk-test-ABCDEFGHIJKLMNOP-9876';
  await row.locator('input[type="password"]').fill(secret);
  await row.locator('[data-act="key-save"]').click();
  await done(page, /Key saved in the vault/);
  await expect(page.locator('[data-key-state="acme-ai"]')).toContainText(
    '…9876',
  );
  await expect(page.locator('body')).not.toContainText(secret);
  const keysBody = await page.evaluate(async () =>
    (await fetch('/api/admin/keys')).text(),
  );
  expect(keysBody).not.toContain(secret);

  // Two models: a writer that gives JSON, and an image model.
  await clearStatus(page);
  await page.locator('#new-model-name').fill('Acme Writer');
  await page.locator('#new-model-id').fill('acme-writer');
  await page.locator('#new-model-provider').selectOption('acme-ai');
  await page.locator('#new-model-kind').selectOption('text');
  await page.locator('#new-model-json').check();
  await page.locator('#add-model-save').click();
  await done(page, /Settings version \d+ is live/);
  await clearStatus(page);
  await page.locator('#new-model-name').fill('Acme Pix');
  await page.locator('#new-model-id').fill('acme-pix-1');
  await page.locator('#new-model-provider').selectOption('acme-ai');
  await page.locator('#new-model-kind').selectOption('image');
  await page.locator('#add-model-save').click();
  await done(page, /Settings version \d+ is live/);

  // Only capable models are offered: the writer for the editor chat, never
  // the image model; the image model for an image studio, never the writer.
  const chat = page.locator('select[data-slot="editor-chat"]');
  await expect(chat.locator('option', { hasText: 'Acme Writer' })).toHaveCount(
    1,
  );
  await expect(chat.locator('option', { hasText: 'Acme Pix' })).toHaveCount(0);
  const imageSlot = page
    .locator('#assignments [data-role]')
    .filter({ has: page.locator('option', { hasText: 'Acme Pix' }) });
  await expect(imageSlot.first()).toBeVisible();
  await expect(
    imageSlot.first().locator('option', { hasText: 'Acme Writer' }),
  ).toHaveCount(0);

  // The owner chooses the editor chat's model; it stays after a reload.
  await clearStatus(page);
  await chat.selectOption('acme-writer');
  await page.locator('#assignments-save').click();
  await done(page, /Settings version \d+ is live/);
  await page.reload();
  await page.locator('[data-tab="providers"]').click();
  await expect(page.locator('select[data-slot="editor-chat"]')).toHaveValue(
    'acme-writer',
  );
  await page.screenshot({ path: 'reports/p4-admin-providers.png' });

  // The gateway's own audit chain has the settings changes and no key value.
  await page.locator('[data-tab="gateway"]').click();
  await expect(page.locator('#gateway-audit-state')).toContainText('intact');
  await expect(page.locator('#gateway-audit')).toContainText('config.save');
  await expect(page.locator('#gateway-audit')).not.toContainText(secret);
});

test('[P4A-010][P4A-011][P4A-012] plans, projects and Styles, Director rules and the emergency switch are saved from the admin screens', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await logIn(page);

  await page.locator('[data-tab="plans"]').click();
  const plan = page.locator('#plans [data-plan]').first();
  await plan.locator('summary').click();
  const credits = plan.getByLabel('Credits each month');
  await credits.fill('777');
  await clearStatus(page);
  await page.locator('#plans-save').click();
  await done(page, /Settings version \d+ is live/);
  await page.reload();
  await page.locator('[data-tab="plans"]').click();
  await page.locator('#plans [data-plan]').first().locator('summary').click();
  await expect(
    page.locator('#plans [data-plan]').first().getByLabel('Credits each month'),
  ).toHaveValue('777');

  await page.locator('[data-tab="workspace"]').click();
  await page.locator('#ws-trash').fill('14');
  await page.locator('#ws-style-credits').fill('3');
  await clearStatus(page);
  await page.locator('#workspace-save').click();
  await done(page, /Settings version \d+ is live/);
  await page.reload();
  await page.locator('[data-tab="workspace"]').click();
  await expect(page.locator('#ws-trash')).toHaveValue('14');
  await expect(page.locator('#ws-style-credits')).toHaveValue('3');

  await page.locator('[data-tab="director"]').click();
  await page.locator('#limit-scenes').fill('9');
  await clearStatus(page);
  await page.locator('#director-save').click();
  await done(page, /Settings version \d+ is live/);
  await page.reload();
  await page.locator('[data-tab="director"]').click();
  await expect(page.locator('#limit-scenes')).toHaveValue('9');

  // A value the server refuses is shown in plain words and nothing changes.
  await page.locator('[data-tab="config"]').click();
  await page.locator('#config-json').fill('{ not json');
  await clearStatus(page);
  await page.locator('#config-save').click();
  await done(page, /not valid JSON/);

  // The emergency switch needs a reason and the code; the dashboard shows it.
  await page.locator('[data-tab="emergency"]').click();
  await page.locator('#em-ai').check();
  await page.locator('#em-apply').click();
  await done(page, /Write a reason first/);
  await page.locator('#em-reason').fill('Testing the switch');
  await clearStatus(page);
  await page.locator('#em-apply').click();
  await done(page, /Applied/);
  await page.locator('[data-tab="dashboard"]').click();
  await expect(page.locator('#dash-emergency')).toContainText('AI is OFF');
  await page.locator('[data-tab="emergency"]').click();
  await page.locator('#em-ai').uncheck();
  await page.locator('#em-reason').fill('Back on');
  await clearStatus(page);
  await page.locator('#em-apply').click();
  await done(page, /Applied/);
  await page.locator('[data-tab="dashboard"]').click();
  await expect(page.locator('#dash-emergency')).toContainText(
    'running normally',
  );
  await page.screenshot({ path: 'reports/p4-admin-dashboard.png' });

  await page.locator('[data-tab="users"]').click();
  await expect(page.locator('#user-list')).toBeVisible();
  await page.locator('[data-tab="engines"]').click();
  await expect(page.locator('body')).toContainText('Stock & offline engines');
});
