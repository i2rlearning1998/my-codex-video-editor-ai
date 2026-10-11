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
    selectedKeyframes: { layerId: string; time: number }[];
    drawBrush: string | null;
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
      // T-ALL P1 (D-183): the app opens Media first; earlier tests were
      // written for the Scene panel, so the fixture keeps that start.
      await page.addInitScript(() => {
        (window as { __AIVE_E2E_START__?: string }).__AIVE_E2E_START__ =
          'Scene';
        // V1 (D-190): the earlier pixel-measuring tests keep the right
        // column reserved; V1's own tests switch this off.
        (window as { __AIVE_E2E_RIGHT__?: string }).__AIVE_E2E_RIGHT__ =
          'reserve';
      });
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
/**
 * H1.5: shows a left-rail category's panel. Clicking the active category
 * collapses its panel (LAY-031), so this clicks only when the category is not
 * already showing.
 */
export async function showCategory(page: Page, name: string) {
  const button = page.locator(`#rail-left [data-category="${name}"]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true')
    await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}
/**
 * I2: Graphics live inside Elements: opens the Elements panel's Graphics
 * page (backgrounds and gradients).
 */
export async function showGraphics(page: Page) {
  await showCategory(page, 'Elements');
  const back = page.locator('#library-elements [data-action="browse-back"]');
  while (await back.isVisible()) await back.click();
  await page.locator('#library-elements [data-tile="graphics"]').click();
  await expect(page.locator('#library-elements')).toHaveAttribute(
    'data-page',
    'elements-graphics',
  );
}
/**
 * I4: the Inspector's Position and size, Timing and Details start folded at
 * the bottom of the right panel's first tab; this opens them.
 */
/**
 * V7 (spec 10.1): a selection never opens the right panel; this opens it on
 * a rail section (a click on a closed panel or another section opens it).
 */
export async function openRight(page: Page, section = 'Properties') {
  const button = page.locator(`#rail-right [data-section="${section}"]`);
  await expect(button).toBeVisible();
  const closed = await page
    .locator('.editor-shell')
    .evaluate((shell) => shell.classList.contains('inspector-collapsed'));
  if (closed || (await button.getAttribute('aria-pressed')) !== 'true')
    await button.click();
  await expect(page.locator('.editor-shell')).not.toHaveClass(
    /inspector-collapsed/,
  );
  await settled(page);
}
/**
 * V7 (spec 10.1): opens a closed right panel the way a user does, from the
 * rail, keeping the section the rail already shows as active.
 */
export async function openRightPanel(page: Page) {
  const shell = page.locator('.editor-shell');
  if (
    !(await shell.evaluate((element) =>
      element.classList.contains('inspector-collapsed'),
    ))
  )
    return;
  const active = page.locator('#rail-right button[aria-pressed="true"]');
  await (
    (await active.count())
      ? active.first()
      : page.locator('#rail-right [data-section="Properties"]')
  ).click();
  await expect(shell).not.toHaveClass(/inspector-collapsed/);
  await settled(page);
}
export async function openInspector(page: Page) {
  await openRight(page, 'Properties');
  for (const tab of ['Transform', 'Timing', 'Dimensions'])
    await page.locator(`#inspector-content [data-subtab="${tab}"]`).click();
  await settled(page);
  // V1: the right card is shorter now; bring Position and size into view.
  await page
    .locator('#inspector-content [data-subtab="Transform"]')
    .evaluate((header) => header.scrollIntoView({ block: 'start' }));
}
/**
 * V1 (spec 1): the right rail and panel slide in when something is
 * selected; tests that measure the panel wait until no transition runs.
 */
export async function settled(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === 'running' &&
                animation.effect?.getComputedTiming().iterations !== Infinity,
            ).length,
      ),
    )
    .toBe(0);
}
/** H4: keyframes are shown and edited in 2D Animation mode. */
export async function mode2d(page: Page) {
  const button = page.locator('#mode-switch [data-mode="animation2d"]');
  await button.click();
  await expect(button).toHaveAttribute('aria-checked', 'true');
}
/**
 * T4: the scene strip is hidden by default; this shows it (the button left
 * of Scenes) and waits for its slide to end.
 */
export async function showSceneStrip(page: Page) {
  const button = page.locator('#scene-strip-show');
  if ((await button.getAttribute('aria-pressed')) !== 'true')
    await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  const strip = page.locator('#scene-strip');
  await expect(strip).not.toHaveClass(/strip-hidden/);
  await expect
    .poll(async () => strip.evaluate((item) => getComputedStyle(item).opacity))
    .toBe('1');
}
/**
 * V2 (D-191): lanes have no header; their lock, hide, solo, mute and move
 * actions are in the lane's right-click menu. Right-clicks an empty part of
 * the lane (after its last clip, inside the visible lanes) and runs one.
 */
export async function laneAction(
  page: Page,
  trackId: string,
  action:
    | 'track-lock'
    | 'track-enable'
    | 'track-mute'
    | 'track-solo'
    | 'track-up'
    | 'track-down',
) {
  // Rows are rebuilt on every render (e.g. while playing), so the spot is
  // measured in one go inside the page.
  const spot = await page.evaluate((trackId) => {
    const row = document.querySelector<HTMLElement>(
      `#timeline-foundation .timeline-nle-row[data-track-id="${trackId}"]`,
    )!;
    row.scrollIntoView({ block: 'nearest' });
    const area = document
      .querySelector('#timeline-foundation .timeline-scroll')!
      .getBoundingClientRect();
    const lane = row.getBoundingClientRect();
    // The emptiest visible spot: after the lane's last clip, or its far end.
    const end = Math.max(
      0,
      ...[...row.querySelectorAll('.timeline-clip')].map(
        (clip) => clip.getBoundingClientRect().right,
      ),
    );
    return {
      x: Math.min(area.right - 12, Math.max(area.left + 12, end + 12)),
      y: lane.top + lane.height / 2,
    };
  }, trackId);
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  const item = page.locator(
    `#timeline-foundation .timeline-menu [data-action="${action}"]`,
  );
  await item.click();
}
/**
 * V2 (spec 2): a ruler click now clears the selection, so tests that seek
 * with something selected type the time into the Player bar's timecode
 * instead (a user path that leaves the selection alone).
 */
export async function seekKeep(page: Page, seconds: number) {
  await page.locator('#timeline-foundation [data-timecode]').click();
  const input = page.locator('#timeline-foundation .player-timecode-input');
  await input.fill(String(Math.round(seconds * 1e6) / 1e6));
  await input.press('Enter');
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __AIVE__: { getSession(): { time: number } };
            }
          ).__AIVE__.getSession().time,
      ),
    )
    .toBeCloseTo(seconds, 2);
}
/**
 * V-series: the canvas view once the layout has settled (panels that slide
 * in after load, the timeline's centring re-render), so tests that compare
 * a view with the starting one do not start mid-change.
 */
export async function settledView(page: Page) {
  await settled(page);
  const read = () =>
    page.evaluate(() =>
      JSON.stringify(
        (
          window as unknown as {
            __AIVE__: { getCanvas(): { view: unknown } };
          }
        ).__AIVE__.getCanvas().view,
      ),
    );
  let last = '';
  await expect
    .poll(
      async () => {
        const now = await read();
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [300] },
    )
    .toBe(true);
}
