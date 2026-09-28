import type { Page } from '@playwright/test';
import { expect } from './fixtures';

// G1: helpers that drive the shared custom controls the way a user does.

/** Opens a custom Select by its trigger id and clicks an option. */
export async function choose(page: Page, id: string, value: string) {
  await page.locator(`#${id}`).click();
  await page
    .locator(`.select-popover [role="option"][data-value="${value}"]`)
    .click();
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', value);
}

/** Opens a colour field by its trigger id and enters a hex value. */
export async function pickColor(page: Page, id: string, hex: string) {
  await page.locator(`#${id}`).click();
  const input = page.locator('#color-picker-hex');
  await input.fill(hex);
  await input.press('Enter');
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', hex);
  // Close the picker (a popover, or the Colour side panel) like a user would.
  await page.keyboard.press('Escape');
  await expect(page.locator('#color-picker-hex')).toHaveCount(0);
}

/** The side panel (G1.5) by id: position, animate, colour, stroke-style. */
export const sidePanel = (page: Page, id: string) =>
  page.locator(`[data-deep-panel="${id}"]`);
