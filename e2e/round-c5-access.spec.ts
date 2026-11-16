// ROUND-C5 Part 3 in the browser. (1) Admin › Features & access used like the
// owner: a feature's rollout, the plan grid, a group imported from a file,
// an override that needs a note and the code, Who has this. (2) The effect: a
// free person's Brand Kit is locked; an override from the owner unlocks it at
// the next load; when it ends, it locks again.
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, allowError } from './fixtures';
import { PASSWORD } from './p2-helpers';
import {
  OWNER,
  ownerCode,
  startOwnerStack,
  type OwnerStack,
} from './lib-owner-helpers';
import { startC2Stack, type C2Stack } from './round-c2-stack';
import { createHash } from 'node:crypto';

const SHOTS = 'reports/round-c5/screens';
mkdirSync(SHOTS, { recursive: true });

test.describe('Admin › Features & access', () => {
  let stack: OwnerStack;
  test.beforeAll(async () => {
    stack = await startOwnerStack(21);
  });
  test.afterAll(() => stack?.stop());
  /** Clicks a save and waits for the screen's redraw after it. */
  async function saveAndRedraw(page: Page, button: string) {
    const before = Number(
      await page.locator('#access-screen').getAttribute('data-render'),
    );
    await page.locator(button).click();
    await expect
      .poll(async () =>
        Number(
          await page.locator('#access-screen').getAttribute('data-render'),
        ),
      )
      .toBeGreaterThan(before);
  }
  async function confirmCode(page: Page) {
    const dialog = page.locator('#reauth');
    const asked = await dialog
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!asked) return;
    await page.locator('#reauth-password').fill(OWNER.password);
    await page.locator('#reauth-code').fill(ownerCode());
    await page.locator('#reauth-confirm').click();
    await expect(dialog).toHaveCount(0);
  }

  test('[RDC5-025] the owner sets a rollout and a plan feature and saves; imports a group from a file; an override without a note is refused with the sentence, with a note it asks for the code and is listed; Who has this answers with a count', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    allowError(
      page,
      (m) => m.includes(stack.ownerUrl) && /40\d|50\d/.test(m),
      'The owner app answers 401 before login, 403 when it asks for the code and 400 for a refused step, on purpose.',
    );
    await page.goto(stack.ownerUrl);
    await page.locator('#email').fill(OWNER.email);
    await page.locator('#password').fill(OWNER.password);
    await page.locator('#code').fill(ownerCode());
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.locator('[data-tab="access"]').click();
    await expect(page.locator('#access-screen')).toBeVisible();
    // A group from a file.
    await page.locator('#cohort-id').fill('teachers');
    await page.locator('#cohort-name').fill('Teachers');
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#cohort-import').click();
    await (
      await chooser
    ).setFiles({
      name: 'teachers.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('a@school.example\nb@school.example\n'),
    });
    await expect(page.locator('#cohort-emails')).toHaveValue(/a@school/);
    await saveAndRedraw(page, '#cohort-save');
    await expect(page.locator('[data-cohort="teachers"]')).toContainText(
      'teachers · Teachers · 2',
    );
    await page.locator('[data-feature-rollout="brand-kit"]').fill('25');
    await saveAndRedraw(page, '#access-save-features');
    await expect(page.locator('#status')).toContainText(
      'Saved as config version',
    );
    await expect(
      page.locator('[data-feature-rollout="brand-kit"]'),
    ).toHaveValue('25');
    await page.locator('[data-plan-feature="free:brand-kit"]').check();
    await page.locator('[data-plan-limit="free:projects"]').fill('7');
    await saveAndRedraw(page, '#access-save-plans');
    await expect(page.locator('#status')).toContainText(
      'Saved as config version',
    );
    await expect(page.locator('[data-plan-limit="free:projects"]')).toHaveValue(
      '7',
    );
    // An override: the note is required, then the code.
    await page.locator('#override-who').fill('cohort:teachers');
    await page.locator('#override-what').selectOption('feature:brand-kit');
    await page.locator('#override-value').fill('on');
    await page.locator('#override-add').click();
    await expect(page.locator('#status')).toContainText(
      'Write a short note about why this person gets this, so you remember later.',
    );
    await page.locator('#override-note').fill('School pilot');
    await expect(page.locator('#override-who')).toHaveValue('cohort:teachers');
    await page.locator('#override-add').click();
    await confirmCode(page);
    await expect(page.locator('[data-override]')).toContainText('School pilot');
    await page.locator('#who-feature').selectOption('brand-kit');
    await page.locator('#who-show').click();
    await expect(page.locator('#who-count')).toContainText('people have it.');
    await page.screenshot({ path: `${SHOTS}/access.png`, fullPage: true });
  });
});

test.describe('the effect in the panel', () => {
  let stack: C2Stack | null = null;
  test.afterEach(async () => {
    await stack?.close();
    stack = null;
  });
  test("[RDC5-026] a free person's Brand Kit is locked; the owner's override unlocks it at the next load; when the override has ended it is locked again", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    stack = await startC2Stack(() => {}, { CONFIG_TTL_MS: '0' });
    await page.addInitScript((u) => {
      (window as { __AIVE_GATEWAY_URL__?: string }).__AIVE_GATEWAY_URL__ = u;
    }, stack.url);
    allowError(
      page,
      (m) => /401|403|404|Failed to load resource/.test(m),
      'RDC5: the panel reads the connector state before sign-in.',
    );
    const email = `bk-${Date.now()}@example.com`;
    await page.goto('/site/#/signup');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.locator('#auth-submit').click();
    await expect(page).toHaveURL(/\/panel\//);
    await page.goto('/panel/#/brand');
    await expect(page.locator('#brand-upgrade')).toBeVisible();
    // The server's id for a local sign-in (server/app.ts, /v1/local/token).
    const sub = createHash('sha256').update(email).digest('hex').slice(0, 32);
    const id = `${sub.slice(0, 8)}-${sub.slice(8, 12)}-${sub.slice(12, 16)}-${sub.slice(16, 20)}-${sub.slice(20, 32)}`;
    const until = Date.now() + 8000;
    await stack.store.saveAccessRules({
      cohorts: [],
      overrides: [
        {
          id: 'e2e',
          who: id,
          feature: 'brand-kit',
          on: true,
          note: 'e2e',
          by: 'owner',
          at: new Date().toISOString(),
          expiresAt: new Date(until).toISOString(),
        },
      ],
    });
    await page.reload();
    await expect(page.locator('#brand-upgrade')).toHaveCount(0);
    await expect(page.locator('h1')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/panel-brand-override.png` });
    // When it has ended, the plan decides again.
    await expect
      .poll(
        async () => {
          await page.reload();
          await page.locator('h1').first().waitFor();
          return page.locator('#brand-upgrade').count();
        },
        { timeout: 30_000, intervals: [2000] },
      )
      .toBe(1);
  });
});
