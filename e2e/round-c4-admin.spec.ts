// ROUND-C4: the new Admin screens of the Owner App, used like the owner:
// Readymade Styles (list, a legacy Style with "Add a template", a new Style
// with a template, the slot report, Check the Style, Save, status moves that
// ask for the code, versions and rollback), Brief fields (add a block, the
// live Brief card preview, save) and Director limits (a value out of range,
// save), plus the Library manager one click away. Screenshots of every new
// screen go to the test output (reports/round-c4/screens).
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, allowError } from './fixtures';
import {
  OWNER,
  ownerCode,
  startOwnerStack,
  type OwnerStack,
} from './lib-owner-helpers';

let stack: OwnerStack;
test.beforeAll(async () => {
  stack = await startOwnerStack(13);
});
test.afterAll(() => stack?.stop());
const SHOTS = 'reports/round-c4/screens';
mkdirSync(SHOTS, { recursive: true });

async function logIn(page: Page) {
  allowError(
    page,
    (m) => m.includes(stack.ownerUrl) && /400|401|403|404|409|502|503/.test(m),
    'The owner app answers 401 before login, 403 when it asks for the code and 400 for a refused step, on purpose.',
  );
  await page.goto(stack.ownerUrl);
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(OWNER.password);
  await page.locator('#code').fill(ownerCode());
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('[data-tab="dashboard"]')).toBeVisible();
}
/**
 * Answers the password-and-code dialog when it comes (the e2e window is 1 s,
 * so a quick second step may still be inside it and ask nothing).
 */
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
const template = {
  format: 'video-plan',
  version: 4,
  meta: { title: 'Fact: {{topic}}', language: 'en', aspect: '9:16', fps: 30 },
  captions: { enabled: false },
  scenes: [
    {
      id: 'open',
      title: '{{topic}}',
      narration: 'Here is a fact about {{place}}.',
      durationHint: 4,
      notes: 'method:library',
      layers: [{ id: 't', kind: 'title', text: '{{topic}}', anchor: 'center' }],
    },
  ],
};

test('[RDC4-040] Readymade Styles: the list shows the three samples as "Director\'s form only"; a legacy Style offers Add a template; a new Style with a template reports its missing slot with the place, adds the missing ones, passes Check the Style with a first draft and a frame sketch, saves as Draft version 1; moving it up asks for the code and is refused without tests; its history lists the versions', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await logIn(page);
  await page.locator('[data-tab="styles"]').click();
  await expect(page.locator('#st-list')).toBeVisible();
  await expect(page.locator('[data-style-row]')).toHaveCount(3);
  await expect(
    page.locator('[data-style-row] [data-status="published"]').first(),
  ).toContainText("Director's form only");
  await page.screenshot({ path: `${SHOTS}/styles-list.png`, fullPage: true });
  // A legacy Style: Add a template opens the editor with a starter.
  const firstId = await page
    .locator('[data-style-row]')
    .first()
    .getAttribute('data-style-row');
  await page.locator(`[data-edit="${firstId}"]`).click();
  await expect(page.locator('#st-legacy')).toBeVisible();
  await page.locator('#st-add-template').click();
  await expect(page.locator('#st-template')).toHaveValue(/video-plan/);
  await page.locator('#st-back').click();
  // A new Style.
  await page.locator('#st-new').click();
  await page.locator('#st-id').fill('facts-ui');
  await page.locator('#st-name-en').fill('Facts UI');
  await page.locator('#st-name-hi').fill('तथ्य');
  await page.locator('#st-blurb-en').fill('One fact, one minute.');
  await page.locator('#st-template').fill(JSON.stringify(template, null, 2));
  await page.locator('#st-check').click();
  await expect(page.locator('#st-slot-messages')).toContainText(
    'scene 1, field narration: The template uses {{place}} but the slot list has no slot with that name.',
  );
  await page.locator('#st-slots-add-missing').click();
  await expect(page.locator('#st-slot-name-0')).toHaveValue('topic');
  await expect(page.locator('#st-slot-name-1')).toHaveValue('place');
  await expect(page.locator('[data-slot-studio="topic"]')).toHaveText('');
  await page.locator('#st-slot-kind-1').selectOption('image');
  await expect(page.locator('[data-slot-studio="place"]')).not.toHaveText('');
  await page.locator('#st-slot-kind-1').selectOption('text');
  await page.locator('#st-check').click();
  await expect(page.locator('#st-check-ok')).toBeVisible();
  await expect(page.locator('#st-draft')).toContainText('1 scenes');
  await expect(page.locator('#st-sketch')).toBeVisible();
  await page.locator('#st-look-add').click();
  await expect(page.locator('[data-look-warning="0"]')).toContainText(
    'no Hindi name yet',
  );
  await page.screenshot({ path: `${SHOTS}/style-editor.png`, fullPage: true });
  await page.locator('#st-show-filled').click();
  await expect(page.locator('#st-filled')).toContainText('Fact: topic');
  // Two looks are not 3 or 4: remove the one we added before saving.
  await page.locator('[data-look="0"] button', { hasText: 'Remove' }).click();
  await page.locator('#st-note').fill('first draft');
  await page.locator('#st-save').click();
  await expect(page.locator('#status')).toContainText('Version 1 is live');
  await expect(page.locator('#style-editor')).toHaveAttribute(
    'data-editing',
    'facts-ui',
  );
  // Moving it up asks for the code, then says why not.
  await page.locator('#st-to-tested').click();
  await confirmCode(page);
  await expect(page.locator('#status')).toHaveText(
    'Tested needs at least one passed test, or a written reason.',
  );
  // A test, then Tested.
  await page.locator('#st-test-add').click();
  await page.locator('#st-test-topic-0').fill('Rain');
  await page.locator('#st-tests-save').click();
  await expect(page.locator('#status')).toContainText('is live');
  await page.locator('#st-to-tested').click();
  await confirmCode(page);
  await expect(page.locator('#st-status-now')).toHaveText('Tested');
  await expect(page.locator('#st-history-table tbody tr')).toHaveCount(3);
  await page.screenshot({ path: `${SHOTS}/style-history.png`, fullPage: true });
  // Roll back to version 1 (a new version, asks for the code).
  await page.locator('[data-rollback="1"]').click();
  await confirmCode(page);
  await expect(page.locator('#st-history-table tbody tr')).toHaveCount(4);
  // The list shows it, filtered by status.
  await page.locator('#st-back').click();
  await page.locator('#st-filter').selectOption('draft');
  await expect(page.locator('[data-style-row="facts-ui"]')).toBeVisible();
  await page.locator('#st-filter').selectOption('published');
  await expect(page.locator('[data-style-row="facts-ui"]')).toHaveCount(0);
});

test('[RDC4-041] Make a Style from a Project without an account says to set it first; the account setting asks for the code', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await logIn(page);
  await page.locator('[data-tab="styles"]').click();
  await page.locator('#st-from').click();
  await expect(page.locator('#fp-no-account')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/from-project.png`, fullPage: true });
  await page.locator('#fp-back').click();
  await page.locator('#st-account').fill('me@example.com');
  await page.locator('#st-account-save').click();
  await confirmCode(page);
  await expect(page.locator('#status')).toHaveText('me@example.com');
});

test("[RDC4-050] Brief fields: blocks and types are edited in place; a block still used is shown with its users; the live Brief card uses the panel's own functions; saving publishes a new version with a history row", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await logIn(page);
  await page.locator('[data-tab="fields"]').click();
  await expect(page.locator('#fl-block-rows')).toBeVisible();
  await expect(page.locator('[data-users="topic"]')).toContainText(
    'video type',
  );
  await page.locator('#fl-sample').fill('A short explainer about volcanoes');
  await page.locator('#fl-preview').click();
  await expect(
    page.locator('#fl-prefilled [data-filled="topic"]'),
  ).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/brief-fields.png`, fullPage: true });
  await page.locator('#fl-block-add').click();
  const last = page.locator('#fl-block-rows > div').last();
  await last.locator('input[id^="fl-block-id-"]').fill('mood');
  await last.locator('input[id^="fl-block-en-"]').fill('Mood');
  await page.locator('#fl-note').fill('mood block');
  await page.locator('#fl-save').click();
  await confirmCode(page);
  await expect(page.locator('#status')).toContainText('is live');
  await expect(page.locator('#fl-history-table tbody tr')).toHaveCount(1);
});

test('[RDC4-060] Director limits: every limit with its range; a value out of range is refused with the field and the range; a valid change saves; the Library manager is one click away and back, with no second login', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await logIn(page);
  await page.locator('[data-tab="limits"]').click();
  await expect(page.locator('#dl-rewrites')).toBeVisible();
  await expect(page.locator('#dl-maxAttachmentMb')).toBeVisible();
  await expect(page.locator('[data-refusal]').first()).toBeVisible();
  await expect(page.locator('[data-mood]').first()).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/director-limits.png`,
    fullPage: true,
  });
  await page.locator('#dl-rewrites').fill('99');
  await page.locator('#dl-save').click();
  await expect(page.locator('#status')).toHaveText(
    'Plan rewrites per video must be between 0 and 50.',
  );
  await page.locator('#dl-rewrites').fill('5');
  await page.locator('#dl-save').click();
  await confirmCode(page);
  await expect(page.locator('#status')).toContainText('is live');
  await expect(page.locator('#dl-rewrites')).toHaveValue('5');
  // 5.1: the library manager and back, the same session.
  await page.locator('[data-tab="library"]').click();
  await expect(page.locator('#email')).toHaveCount(0);
  await expect(page.locator('[data-tab="library"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.locator('[data-tab="limits"]').click();
  await expect(page.locator('#dl-rewrites')).toHaveValue('5');
});
