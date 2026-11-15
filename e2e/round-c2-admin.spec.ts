// ROUND-C2 Part 5 (RDC2-030 to RDC2-032): the Owner App's Admin tabs for
// the Claude connector. The real Owner App and its admin bridge run in
// their own processes (lib-owner-helpers); the server's file store is
// seeded here with a connection and a few connector calls.
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, allowError } from './fixtures';
import {
  OWNER,
  ownerCode,
  startOwnerStack,
  type OwnerStack,
} from './lib-owner-helpers';
import { fileStore } from '../server/store';

let stack: OwnerStack;
test.beforeAll(async () => {
  stack = await startOwnerStack(9);
});
test.afterAll(() => stack?.stop());

async function logIn(page: Page) {
  allowError(
    page,
    (m) => m.includes(stack.ownerUrl) && /400|401|403|502|503/.test(m),
    'The owner app answers 401 before login, 403 when it asks to re-authenticate and 400 for a refused save, on purpose.',
  );
  await page.goto(stack.ownerUrl);
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(OWNER.password);
  await page.locator('#code').fill(ownerCode());
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('[data-tab="dashboard"]')).toBeVisible();
}
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

test('[RDC2-030] Rules & Playbooks: a wrong rule is a plain sentence; save publishes a version; the preview shows the exact manual; rollback makes the previous version live', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await logIn(page);
  await page.locator('[data-tab="rules"]').click();
  await expect(page.locator('#rules-tab')).toBeVisible();
  await expect(page.locator('#rule-id-0')).toHaveValue('scope');
  await expect(
    page.locator('[data-counter="chapter-01-audience-and-goal"]'),
  ).toContainText(/of 20000 characters/);
  // A wrong edit is refused in plain words, nothing is saved.
  await page.locator('#rule-add').click();
  const last = page.locator('.rule-row').last();
  await last.locator('input').fill('9 bad id');
  await clearStatus(page);
  await page.locator('#rules-save').click();
  await done(page, /the id must start with a letter.*has no English text/);
  // A real change: a new rule at the top, saved and published.
  await last.locator('input').fill('owner-test');
  await last
    .locator('textarea')
    .first()
    .fill('Always end with a question for the viewer.');
  // Move it to the top with its Up button.
  for (let i = 0; i < 40; i++) {
    if ((await page.locator('#rule-id-0').inputValue()) === 'owner-test') break;
    const n = await page.locator('.rule-row').count();
    let at = -1;
    for (let j = 0; j < n; j++)
      if ((await page.locator(`#rule-id-${j}`).inputValue()) === 'owner-test')
        at = j;
    await page.locator(`#rule-up-${at}`).click();
  }
  await expect(page.locator('#rule-id-0')).toHaveValue('owner-test');
  await page.locator('#chapter-03-look-and-feel').fill('OWNER LOOK CHAPTER.');
  await clearStatus(page);
  await page.locator('#rules-save').click();
  await done(page, /Settings version (\d+) is live/);
  const saved = Number(
    /version (\d+)/.exec(
      (await page.locator('#status').textContent()) ?? '',
    )![1],
  );
  // The preview is buildManual's text for the draft.
  await page.locator('[data-tab="rules"]').click();
  await expect(page.locator('#rule-id-0')).toHaveValue('owner-test');
  // The tab redraws after the save; choose once the redraw is done.
  await expect(async () => {
    await page.locator('#preview-type').selectOption('documentary');
    await expect(page.locator('#preview-type')).toHaveValue('documentary', {
      timeout: 500,
    });
  }).toPass();
  await page.locator('#rules-preview').click();
  const preview = page.locator('#manual-preview');
  await expect(preview).toContainText(
    '## Rulebook\n- Always end with a question for the viewer.',
  );
  await expect(preview).toContainText(
    '### 03-look-and-feel\nOWNER LOOK CHAPTER.',
  );
  await expect(preview).toContainText('## Video type: documentary');
  // Rollback: the version before is live again.
  await clearStatus(page);
  await page.locator('#rules-rollback').click();
  await done(page, new RegExp(`Version ${saved - 1} is live again\\.`));
  await page.locator('[data-tab="rules"]').click();
  await expect(page.locator('#rule-id-0')).toHaveValue('scope');
});

test('[RDC2-031] the MCP tab: the address with Copy, per-tool switches and prices, the master switch, the connections and the last calls', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const store = fileStore(path.join(stack.root, 'server', 'store.json'));
  await store.saveMcpClient({
    id: 'mcpc-e2e-client-1',
    name: 'Claude',
    redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
    createdAt: new Date().toISOString(),
  });
  await store.saveProfile({
    id: 'user-c2',
    email: 'maker@example.com',
    plan: 'free',
    locale: 'en',
    brandKit: {},
    createdAt: new Date().toISOString(),
  });
  for (const id of [
    'mcpk-00000000-0000-4000-8000-000000000001',
    'mcpk-00000000-0000-4000-8000-000000000002',
  ])
    await store.saveMcpConnection({
      id,
      userId: 'user-c2',
      clientId: 'mcpc-e2e-client-1',
      clientName: 'Claude',
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      revokedAt: null,
      accessHash: 'a'.repeat(64),
      accessExp: Date.now() + 3_600_000,
      refreshHash: 'b'.repeat(64),
    });
  await store.appendUsage({
    id: 'u-mcp-1',
    at: new Date().toISOString(),
    userId: 'user-c2',
    modelId: 'mcp:submit_plan',
    role: 'tool',
    credits: 0,
    ms: 12,
    outcome: 'ok',
    source: 'mcp',
  });
  await logIn(page);
  await page.locator('[data-tab="mcp"]').click();
  await expect(page.locator('#mcp-tab')).toBeVisible();
  await expect(page.locator('#mcp-address')).toHaveValue(/\/mcp$/);
  await page.locator('#mcp-copy').click();
  await done(page, /Copied\./);
  await expect(page.locator('#mcp-calls')).toContainText('submit_plan');
  await expect(page.locator('#mcp-calls')).toContainText('maker@example.com');
  await expect(page.locator('#mcp-connections tbody tr')).toHaveCount(2);
  // Per-tool: switch one off and price another; save.
  await page.locator('#mcp-tool-search_web').uncheck();
  await page.locator('#mcp-proof').check();
  await page.locator('#mcp-rate').fill('20');
  await clearStatus(page);
  await page.locator('#mcp-save').click();
  await done(page, /Settings version \d+ is live/);
  await page.locator('[data-tab="mcp"]').click();
  await expect(page.locator('#mcp-tool-search_web')).not.toBeChecked();
  await expect(page.locator('#mcp-proof')).toBeChecked();
  await expect(page.locator('#mcp-rate')).toHaveValue('20');
  // The master switch (the emergency switch mcpOff).
  await page.locator('#mcp-master').uncheck();
  await clearStatus(page);
  await page.locator('#mcp-master-apply').click();
  await done(page, /The connector is off for everyone\./);
  expect((await store.emergency()).mcpOff).toBe(true);
  // Revoke one, then all.
  await clearStatus(page);
  await page
    .locator('#mcp-revoke-mcpk-00000000-0000-4000-8000-000000000001')
    .click();
  await done(page, /1 connections ended\./);
  await clearStatus(page);
  await page.locator('#mcp-revoke-all').click();
  await done(page, /1 connections ended\./);
  expect(
    (await store.mcpConnections('user-c2')).every((c) => c.revokedAt),
  ).toBe(true);
  // Turning the connector on again.
  await page.locator('#mcp-master').check();
  await clearStatus(page);
  await page.locator('#mcp-master-apply').click();
  await done(page, /The connector is on\./);
});
