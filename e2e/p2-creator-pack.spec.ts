import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, hook, menuAction, showCategory } from './fixtures';

// P2 (CREATOR-PACK-SPEC 2, 4, 6, 10): Import creator pack: offline checks,
// render checks, My library, the panels, versions, deletes and bad packs.
const EXAMPLES = 'examples/creator-packs';
const read = (name: string) => readFileSync(`${EXAMPLES}/${name}`, 'utf8');
const dialog = (page: Page) => page.locator('.ai-import-dialog');
const row = (page: Page, id: string) =>
  dialog(page).locator(`.creator-item[data-item="${id}"]`);

async function openImport(page: Page) {
  await showCategory(page, 'Media');
  await showCategory(page, 'AI');
  await page.locator('#ai-import').click();
  await expect(dialog(page)).toBeVisible();
}
/** Pastes a pack and waits for the offline result. */
async function paste(page: Page, text: string) {
  await dialog(page).locator('#ai-import-source').fill(text);
  await expect(dialog(page).locator('#ai-import-report')).toBeEnabled();
}
/** Q4: the render checks run on their own; this waits until they end. */
async function runChecks(page: Page) {
  await expect(dialog(page).locator('#ai-import-summary')).toHaveText(
    /passed the checks/,
    { timeout: 60_000 },
  );
}
async function importPack(page: Page, text: string) {
  await openImport(page);
  await paste(page, text);
  await runChecks(page);
  await dialog(page).locator('#ai-import-add').click();
  await finish(page);
}
/** Q4: the result card, then Done. */
async function finish(page: Page) {
  await expect(dialog(page).locator('#creator-result')).toBeVisible();
  await dialog(page).locator('#creator-done').click();
  await expect(dialog(page)).toBeHidden();
}
/** The keys in My library (read from the store, like the shell does). */
const libraryKeys = (page: Page) =>
  page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try {
      const dir = await (
        await root.getDirectoryHandle('aive-media')
      ).getDirectoryHandle('creator');
      const file = await (await dir.getFileHandle('index.json')).getFile();
      return (
        JSON.parse(await file.text()) as { key: string; removed?: boolean }[]
      )
        .filter((entry) => !entry.removed)
        .map((entry) => entry.key)
        .sort();
    } catch {
      return [] as string[];
    }
  });
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

test.describe('P2 creator packs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as { __AIVE_E2E_FREECODE__?: string }).__AIVE_E2E_FREECODE__ =
        'fake';
    });
    await page.goto('/');
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
  });

  test('[CP-004][CP-005][CP-006][CP-007] the example packs import through the review dialog and appear in their panels with a Creator pack badge', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // The review: the offline checks, then the render checks on their own.
    await openImport(page);
    await paste(page, read('motion-c.json'));
    await runChecks(page);
    const motion = row(page, 'motion-particles');
    await expect(motion).toHaveAttribute('data-status', 'ok');
    await expect(motion.locator('.creator-reasons')).toContainText(
      'Baked twice: identical bytes.',
    );
    await expect(motion.locator('.creator-thumb')).toBeVisible();
    await dialog(page).locator('#ai-import-add').click();
    await finish(page);
    // The rest of the valid examples, each a pack of its own.
    for (const file of [
      'shape.json',
      'text.json',
      'background.json',
      'template.json',
      'motion-b.json',
      'move-preset.json',
    ])
      await importPack(page, read(file));
    // My library: not an undo step, kept in this browser.
    expect((await hook(page)).history.labels).toEqual([]);
    expect(await libraryKeys(page)).toEqual([
      'background-pack/background-night',
      'motion-b-pack/motion-orbit',
      'motion-c-pack/motion-particles',
      'move-pack/preset-move',
      'shape-pack/shape-kite',
      'template-pack/template-card',
      'text-pack/text-title',
    ]);
    // R2: AI items show in the AI category only, grouped by kind and badged.
    await showCategory(page, 'AI');
    const ai = page.locator('#library-ai');
    const card = (kind: string, id: string) =>
      ai.locator(`.ai-group[data-kind="${kind}"] .ai-card[data-item="${id}"]`);
    for (const [kind, id] of [
      ['shape', 'shape-pack--shape-kite'],
      ['background', 'background-pack--background-night'],
      ['text', 'text-pack--text-title'],
      ['template', 'template-pack--template-card'],
      ['motion', 'motion-b-pack--motion-orbit'],
      ['motion', 'motion-c-pack--motion-particles'],
      ['preset', 'move-pack--preset-move'],
    ] as const)
      // S1: no AI chip in the AI category (everything there is AI).
      await expect(card(kind, id).locator('.ai-chip')).toHaveCount(0);
    // Insert: one undo step.
    await card('shape', 'shape-pack--shape-kite').click();
    await expect
      .poll(async () => (await hook(page)).history.labels.length)
      .toBe(1);
    // A motion item inserts a code layer with its own copy of the source.
    await card('motion', 'motion-c-pack--motion-particles').click();
    await expect
      .poll(async () =>
        (await hook(page)).project.compositions[0]!.layers.some((layer) =>
          layer.code?.source.includes('motion-particles'),
        ),
      )
      .toBe(true);
  });

  test('[CP-014][CP-008] bad packs are rejected with their exact reasons, unsupported kinds say so, and the library stays untouched', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const expected = JSON.parse(read('expected.json')) as Record<
      string,
      { ok: boolean; reason?: string }
    >;
    await openImport(page);
    for (const [file, result] of Object.entries(expected)) {
      if (result.ok) continue;
      await paste(page, read(file));
      const rows = dialog(page).locator('.creator-item');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toHaveAttribute('data-status', 'rejected');
      await expect(rows.first().locator('.creator-reasons')).toContainText(
        result.reason!,
      );
      await expect(
        rows.first().locator('input[type="checkbox"]'),
      ).toBeDisabled();
      await expect(dialog(page).locator('#ai-import-add')).toBeDisabled();
    }
    // Render checks reject what the offline checks cannot see.
    const motion = (id: string, body: string) =>
      JSON.stringify({
        format: 'creator-pack',
        version: 1,
        pack: {
          id: 'runtime-pack',
          name: { en: 'Runtime', hi: 'रनटाइम' },
          version: 1,
          author: 'ai',
          createdWith: 'claude-chat',
        },
        items: [
          {
            id,
            name: { en: id, hi: `हि ${id}` },
            tags: [],
            type: 'motion',
            data: {
              tier: 'C',
              meta: {
                id,
                name: id,
                version: '1.0.0',
                category: 'Test',
                duration: 1,
                fps: 10,
                seekable: true,
                keepFrame: false,
                thumbnailTime: 0.5,
                libs: [],
                params: [],
              },
              source: `export default { meta: { "id": "${id}", "name": "${id}", "version": "1.0.0", "category": "Test", "duration": 1, "fps": 10, "seekable": true, "keepFrame": false, "thumbnailTime": 0.5, "libs": [], "params": [] }, init({ ctx }) { this.ctx = ctx; }, renderFrame({ t }) { ${body} } };`,
            },
          },
        ],
      });
    await paste(page, motion('blank-thing', 'void t;'));
    await runChecksExpectReject(page, 'blank-thing', /empty or one colour/);
    await paste(
      page,
      motion(
        'random-thing',
        "this.ctx.fillStyle = '#ff0000'; this.ctx.fillRect(Math.random() * 500, 0, 50, 50);",
      ),
    );
    await runChecksExpectReject(page, 'random-thing', /not deterministic/);
    // A composition is not supported yet: listed, never silently dropped.
    await paste(page, read('composition.json'));
    await expect(row(page, 'shape-kite')).toHaveAttribute(
      'data-status',
      /ok|warning/,
    );
    const composition = dialog(page).locator(
      '.creator-item[data-type="composition"]',
    );
    await expect(composition).toHaveAttribute('data-status', 'unsupported');
    await expect(composition).toContainText('Not supported yet');
    // Copy report: plain text for the AI.
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    await dialog(page).locator('#ai-import-report').click();
    await expect(
      page.locator('.toast', { hasText: 'Report copied' }),
    ).toBeVisible();
    const report = await page.evaluate(() => navigator.clipboard.readText());
    expect(report).toContain('Creator pack tiny-video version 1');
    expect(report).toMatch(/NOT SUPPORTED YET/);
    await dialog(page).locator('#ai-import-cancel').click();
    expect(await libraryKeys(page)).toEqual([]);
    expect((await hook(page)).history.labels).toEqual([]);
  });

  test('[CP-015][CP-006] re-importing is idempotent, a higher version replaces after a confirm, and deleting an item keeps projects that used it', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await newProject(page);
    const shape = read('shape.json');
    await importPack(page, shape);
    await importPack(page, shape);
    await expect(
      page.locator('.toast', { hasText: 'already in your library' }),
    ).toBeVisible();
    expect(await libraryKeys(page)).toEqual(['shape-pack/shape-kite']);
    // Version 2 with a renamed item replaces the pack after a confirm.
    const v2 = JSON.parse(shape) as {
      pack: { version: number };
      items: { id: string }[];
    };
    v2.pack.version = 2;
    v2.items[0]!.id = 'shape-kite-two';
    await openImport(page);
    await paste(page, JSON.stringify(v2));
    await runChecks(page);
    await dialog(page).locator('#ai-import-add').click();
    await page.locator('.modal-dialog [data-role="confirm"]').click();
    await finish(page);
    await expect
      .poll(() => libraryKeys(page))
      .toEqual(['shape-pack/shape-kite-two']);
    // Use it, then delete it from the library: the project keeps its copy.
    await showCategory(page, 'AI');
    const card = page.locator(
      '#library-ai .ai-card[data-item="shape-pack--shape-kite-two"]',
    );
    await card.click();
    await expect
      .poll(
        async () => (await hook(page)).project.compositions[0]!.layers.length,
      )
      .toBe(1);
    const before = (await hook(page)).project;
    // R4: the card's "⋯" opens the same menu as a right-click.
    await card.hover();
    await page
      .locator(
        '#library-ai .shelf-item[data-item-id="shape-pack--shape-kite-two"] .shelf-more',
      )
      .click();
    await page.locator('#ai-menu [data-action="ai-delete"]').click();
    await expect(card).toHaveCount(0);
    expect(await libraryKeys(page)).toEqual([]);
    expect((await hook(page)).project).toEqual(before);
    // Restore brings it back; a reload keeps the library and the project.
    await page
      .locator('.toast')
      .getByRole('button', { name: 'Restore' })
      .click();
    await expect(card).toHaveCount(1);
    await page.reload();
    await expect
      .poll(async () => page.evaluate(() => '__AIVE__' in window))
      .toBe(true);
    expect(await libraryKeys(page)).toEqual(['shape-pack/shape-kite-two']);
  });

  test('[CP-004] a dropped .creatorpack.json file opens the review', async ({
    page,
  }) => {
    await page.evaluate((text) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([text], 'kite.creatorpack.json', { type: 'application/json' }),
      );
      const target = document.querySelector('#composition-canvas')!;
      for (const type of ['dragenter', 'dragover', 'drop'])
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
    }, read('shape.json'));
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator('#ai-import-file-name')).toHaveText(
      'kite.creatorpack.json',
    );
    await expect(row(page, 'shape-kite')).toBeVisible();
  });
});

async function runChecksExpectReject(page: Page, id: string, reason: RegExp) {
  await expect(row(page, id)).toHaveAttribute('data-status', 'rejected', {
    timeout: 30_000,
  });
  await expect(row(page, id).locator('.creator-reasons')).toContainText(reason);
  await expect(dialog(page).locator('#ai-import-add')).toBeDisabled();
}
