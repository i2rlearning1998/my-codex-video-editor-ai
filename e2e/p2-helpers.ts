// P2-R1 helpers: sign up on the website like a person, then use the panel.
import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'correct horse battery';
let n = 0;
export async function signUp(
  page: Page,
  email = `asha${++n}-${Date.now()}@example.com`,
) {
  await page.goto('/site/#/signup');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();
  await expect(page).toHaveURL(/\/panel\//);
  await expect(page.locator('#credits-pill')).toContainText('credits');
  return email;
}
export const balance = async (page: Page) =>
  Number(
    (await page.locator('#credits-pill').textContent())!.replace(/\D+/g, ''),
  );
export async function setPlan(page: Page, plan: string) {
  await page.goto('/panel/#/credits');
  await page.locator(`[data-switch="${plan}"]`).click();
  await expect(
    page.locator(`[data-plan="${plan}"][data-current="true"]`),
  ).toBeVisible();
}

/** Approve the plan; when Director stops at the asset step, build with AI for every file. */
export async function approvePlan(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.locator('#plan-approve').click();
  const step = page.locator('#step-ai');
  const building = page.locator('#build-steps, #build-status');
  await expect(step.or(building).first()).toBeVisible();
  if (await step.isVisible()) await step.click();
}

/** Asset Library: opens the Studio Libraries card and then one Studio tool's results. */
export async function openStudioResults(
  page: import('@playwright/test').Page,
  feature: string,
): Promise<void> {
  await page.goto('/panel/#/assets');
  await page.locator('[data-lib-studio]').click();
  await page.locator(`[data-studio-feature="${feature}"]`).click();
}
