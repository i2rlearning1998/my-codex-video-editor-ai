import { test as base, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Project } from '../src/core';

export interface HookSnapshot {
  version: string;
  getProject(): Project;
  getSession(): {
    compositionId: string;
    selectedIds: string[];
    time: number;
    playing: boolean;
    canvasZoom: number;
    timelinePxPerSecond: number;
    soloTrackIds: string[];
  };
  getHistory(): { canUndo: boolean; canRedo: boolean; labels: string[] };
  getConsoleErrors(): readonly unknown[];
}
type ErrorException = (
  matches: (message: string) => boolean,
  reason: string,
) => void;
type Fixtures = {
  errorGuard: void;
  openFixtureProject: (name: string) => Promise<void>;
};
export const test = base.extend<Fixtures>({
  errorGuard: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      const allowed: ((message: string) => boolean)[] = [];
      // Shared per-test registry; exceptions must be declared explicitly in the test.
      exceptions.set(page, (matches, reason) => {
        if (!reason.trim())
          throw new Error('An error exception requires a written reason');
        allowed.push(matches);
        testInfo.annotations.push({
          type: 'error-exception',
          description: reason,
        });
      });
      page.on('console', (message) => {
        if (message.type() === 'error')
          errors.push(`console: ${message.text()} ${message.location().url}`);
      });
      page.on('pageerror', (error) =>
        errors.push(`pageerror: ${error.message}`),
      );
      page.on('requestfailed', (request) =>
        errors.push(
          `requestfailed: ${request.url()} ${request.failure()?.errorText}`,
        ),
      );
      page.on('response', (response) => {
        if (response.status() >= 400)
          errors.push(`http ${response.status()}: ${response.url()}`);
      });
      page.on('dialog', async (dialog) => {
        if (dialog.type() === 'confirm') await dialog.accept();
        else await dialog.dismiss();
      });
      await use();
      exceptions.delete(page);
      expect(
        errors.filter((message) => !allowed.some((match) => match(message))),
        'Unexpected browser errors',
      ).toEqual([]);
    },
    { auto: true },
  ],
  openFixtureProject: async ({ page }, use) => {
    await use(async (name) => {
      const file = path.resolve('tests/fixtures/projects', name);
      const title = (
        JSON.parse(readFileSync(file, 'utf8')) as { metadata: { name: string } }
      ).metadata.name;
      await page.locator('#menu-trigger').click();
      await page.locator('#import').setInputFiles(file);
      await page.locator('.modal-dialog [data-role="confirm"]').click();
      await expect(page.locator('#project-name')).toHaveText(title);
    });
  },
});
const exceptions = new WeakMap<Page, ErrorException>();
export function allowError(
  page: Page,
  matches: (message: string) => boolean,
  reason: string,
) {
  const register = exceptions.get(page);
  if (!register) throw new Error('Error guard is not initialized');
  register(matches, reason);
}
export { expect };
export async function hook(page: Page) {
  return page.evaluate(() => {
    const api = (window as unknown as { __AIVE__: HookSnapshot }).__AIVE__;
    return {
      version: api.version,
      project: api.getProject(),
      session: api.getSession(),
      history: api.getHistory(),
      errors: api.getConsoleErrors(),
    };
  });
}
export async function artboard(page: Page) {
  return page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')!;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width,
      right = -1,
      top = canvas.height;
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (
          Math.abs(data[i]! - 240) < 5 &&
          Math.abs(data[i + 1]! - 238) < 5 &&
          Math.abs(data[i + 2]! - 231) < 5
        ) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
        }
      }
    if (right < left) throw new Error('Artboard background not found');
    const box = canvas.getBoundingClientRect();
    const ratio = box.width / canvas.width;
    return {
      x: box.x + left * ratio,
      y: box.y + top * ratio,
      scale: ((right - left + 1) * ratio) / 1280,
    };
  });
}
export async function toScreen(page: Page, x: number, y: number) {
  const board = await artboard(page);
  return { x: board.x + x * board.scale, y: board.y + y * board.scale };
}

export async function menuAction(page: Page, id: string) {
  if (!(await page.locator('#app-menu').isVisible()))
    await page.locator('#menu-trigger').click();
  await page.locator(id).click();
}

/**
 * The timeline ruler's box. The timeline re-renders by replacing its elements,
 * so a single boundingBox() can land on a detached ruler and return null; wait
 * for the attached one (its position does not change between renders).
 */
export async function rulerBox(page: Page) {
  const ruler = page.locator('.timeline-ruler');
  let box: Awaited<ReturnType<typeof ruler.boundingBox>> = null;
  await expect
    .poll(async () => (box = await ruler.boundingBox()))
    .not.toBeNull();
  return box!;
}
