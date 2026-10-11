import type { Page } from '@playwright/test';
import { expect } from './fixtures';

// G1: helpers that drive the shared custom controls the way a user does.

/**
 * H3: toolbar controls that live in a popover of the floating toolbar, by the
 * control (data-control) of the button that opens it.
 */
const HOST: Record<string, string> = {
  'toolbar-weight': 'spacing',
  'toolbar-letter-spacing': 'spacing',
  'toolbar-line-height': 'spacing',
  'toolbar-paragraph-spacing': 'spacing',
  'toolbar-case': 'spacing',
  'toolbar-stroke': 'stroke-style',
  'toolbar-width': 'stroke-style',
  'toolbar-dash': 'stroke-style',
  'toolbar-cap': 'stroke-style',
  'toolbar-join': 'stroke-style',
  'toolbar-corners': 'corners-menu',
  'toolbar-opacity': 'transparency',
  'toolbar-brush': 'brush-size',
  'toolbar-scene-length': 'duration',
  'flip-horizontal': 'flip',
  'flip-vertical': 'flip',
  // The shape's fill opacity sits under the Colour panel's swatches.
  'toolbar-fill-opacity': '#toolbar-fill',
};
/** A toolbar button, opening the More overflow first when it is in there. */
export async function toolbarButton(page: Page, control: string) {
  // (V7: the right panel holds hidden copies of some controls; use the
  // one the user can see.)
  const button = page
    .locator(control.startsWith('#') ? control : `[data-control="${control}"]`)
    .filter({ visible: true })
    .first();
  if (!(await button.count())) {
    const more = page.locator('#context-toolbar [data-control="toolbar-more"]');
    if (await more.isVisible()) await more.click();
  }
  await expect(button).toBeVisible();
  return button;
}
/**
 * Makes a toolbar control visible the way a user reaches it: opens its
 * popover (and the More overflow) when needed. `id` is the element id or the
 * data-control of a button.
 */
export async function reveal(page: Page, id: string) {
  const target = page
    .locator(`#${id}, [data-control="${id}"]`)
    .filter({ visible: true })
    .first();
  if (await target.count()) return target;
  const host = HOST[id];
  if (host) await (await toolbarButton(page, host)).click();
  else await toolbarButton(page, id);
  await expect(target).toBeVisible();
  return target;
}

/** Opens a custom Select by its trigger id and clicks an option. */
export async function choose(page: Page, id: string, value: string) {
  await (await reveal(page, id)).click();
  await page
    .locator(`.select-popover [role="option"][data-value="${value}"]`)
    .click();
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', value);
}

/** Opens a colour field by its trigger id and enters a hex value. */
export async function pickColor(page: Page, id: string, hex: string) {
  await (await reveal(page, id)).click();
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

/** Opens a toolbar button's side panel unless it is already open. */
export async function openPanel(page: Page, control: string, id: string) {
  if (!(await sidePanel(page, id).isVisible()))
    await (await toolbarButton(page, control)).click();
  await expect(sidePanel(page, id)).toBeVisible();
}
