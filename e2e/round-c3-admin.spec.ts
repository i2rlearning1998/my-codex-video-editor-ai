// ROUND-C3 Part 7.1 (RDC3-071): Admin › Rules & Playbooks: each rulebook
// item says who it is for (both, the Director, the person's Claude), and the
// preview shows both views of the one manual.
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
  stack = await startOwnerStack(11);
});
test.afterAll(() => stack?.stop());

async function logIn(page: Page) {
  allowError(
    page,
    (m) => m.includes(stack.ownerUrl) && /400|401|403|502|503/.test(m),
    'The owner app answers 401 before login and 403 when it asks to re-authenticate, on purpose.',
  );
  await page.goto(stack.ownerUrl);
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(OWNER.password);
  await page.locator('#code').fill(ownerCode());
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('[data-tab="dashboard"]')).toBeVisible();
}

test("[RDC3-071] each rule has an Applies to choice (assets-order is the Director's, assets-claude Claude's); an item set to Claude only shows in Claude's preview and not in the Director's", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await logIn(page);
  await page.locator('[data-tab="rules"]').click();
  const ids = page.locator('[id^="rule-id-"]');
  await expect(ids.first()).toBeVisible();
  const count = await ids.count();
  const indexOf = async (id: string) => {
    for (let i = 0; i < count; i++)
      if ((await page.locator(`#rule-id-${i}`).inputValue()) === id) return i;
    throw new Error(`no rule ${id}`);
  };
  await expect(
    page.locator(`#rule-applies-${await indexOf('assets-order')}`),
  ).toHaveValue('director');
  await expect(
    page.locator(`#rule-applies-${await indexOf('assets-claude')}`),
  ).toHaveValue('claude');
  await expect(page.locator('#rule-applies-0')).toHaveValue('both');
  // The first rule, for Claude only.
  // The preview fills "[platform]" with the brand name; compare the part
  // before it.
  const first = (await page.locator('#rule-en-0').inputValue()).split(
    '[platform]',
  )[0]!;
  await page.locator('#rule-applies-0').selectOption('claude');
  await page.locator('#rules-preview').click();
  await expect(page.locator('#manual-preview-claude')).toContainText(
    `## Guidance\n- ${first}`,
  );
  await expect(page.locator('#manual-preview')).toContainText('## Rulebook');
  await expect(page.locator('#manual-preview')).not.toContainText(first);
});
