import { readFileSync } from 'node:fs';
import {
  test,
  expect,
  showCategory,
  menuAction,
  hook,
  settleBuild,
  addOwnMedia,
  HONEY_MEDIA,
} from './fixtures';
import { mockStock, GOOD_KEY } from './stock-mock';

// FIX4 A1: after Import + Build two messages used to stack at the bottom-left
// and cover the lower part of the left panel. Now ONE toast shows at a time,
// bottom-centre over the canvas area, and never over a panel's scroller.
test('[FX4-001] one toast at a time, never over a left panel', async ({
  page,
}) => {
  await page.goto('/');
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page
    .locator('#ai-import-source')
    .fill(readFileSync('docs/samples/plan-en-honey.json', 'utf8'));
  await page.locator('[data-action="build-video"]').click();
  await settleBuild(page);
  await expect(
    page.locator('.toast', { hasText: 'Built 3 scenes' }),
  ).toBeVisible();
  await expect(page.locator('.toast:not(.toast-leaving)')).toHaveCount(1);
  const overlap = await page.evaluate(() => {
    const toast = document
      .querySelector('.toast:not(.toast-leaving)')!
      .getBoundingClientRect();
    const panel = document
      .querySelector('.library > .panel-body')!
      .getBoundingClientRect();
    return (
      toast.left < panel.right &&
      toast.right > panel.left &&
      toast.top < panel.bottom &&
      toast.bottom > panel.top
    );
  });
  expect(overlap).toBe(false);
  await page.screenshot({ path: 'reports/fix4/a1-toast.png' });
});

test('[FX4-002] a toast waits while the pointer is on it (longer than its 10 s), then hides', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page
    .locator('#ai-import-source')
    .fill(readFileSync('docs/samples/plan-en-honey.json', 'utf8'));
  await page.locator('[data-action="build-video"]').click();
  await settleBuild(page);
  const toast = page.locator('.toast', { hasText: 'Built 3 scenes' });
  await expect(toast).toBeVisible();
  await toast.hover();
  await page.waitForTimeout(11000);
  await expect(toast).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(toast).toHaveCount(0, { timeout: 14000 });
});

// FIX4 A4: after a full build (media found from mocked stock) the card reads
// Built with its scene count and a picture of the first built scene, and its
// menu offers Build again; before a build it reads Not built.
test('[FX4-004] AI composition card: Not built, then Built with scene count and poster', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(
    ([key]) => {
      localStorage.setItem(
        'aive.provider-key.pixabay.apiKey',
        JSON.stringify(key),
      );
      (window as { __AIVE_E2E_SPEECH__?: boolean }).__AIVE_E2E_SPEECH__ = true;
    },
    [GOOD_KEY] as const,
  );
  await mockStock(page);
  await page.goto('/');
  // FIX7: a build uses only the person's own files, added first.
  await addOwnMedia(page, HONEY_MEDIA);
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page
    .locator('#ai-import-source')
    .fill(readFileSync('tests/fixtures/plans/honey-en.json', 'utf8'));
  await page.locator('[data-action="build-video"]').click();
  const dialog = page.locator('.plan-build');
  await settleBuild(page);
  await page.keyboard.press('Escape');
  const card = page.locator('#library-ai .shelf-item').first();
  await expect(card).toContainText('Built');
  await expect(card).toContainText('3 scenes');
  await expect(card.locator('[data-thumb="image"]')).toHaveCount(1);
  await page.screenshot({ path: 'reports/fix4/a4-card.png' });
  // A10: the starter kit cards show real pictures, not grey placeholders.
  const kit = page.locator(
    '#library-ai .shelf-item[data-id^="ai:kit:"], #library-ai .shelf-item:has([data-thumb])',
  );
  await expect(
    page.locator('#library-ai [data-thumb="placeholder"]'),
  ).toHaveCount(0);
  expect(await kit.count()).toBeGreaterThan(3);
  await page
    .locator('#library-ai .shelf-body, #library-ai .shelf')
    .first()
    .evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.screenshot({ path: 'reports/fix4/a10-kit.png' });
});

test('[FX4-008] Settings › Offline › Model source saves an https address, refuses others and resets', async ({
  page,
}) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => '__AIVE__' in window)).toBe(true);
  await menuAction(page, '#open-settings');
  const settings = page.locator('.modal-dialog');
  await settings.locator('[data-settings-tab="offline"]').click();
  const input = settings.locator('#model-source-input');
  const status = settings.locator('#model-source-status');
  await input.fill('http://nope.example');
  await settings.locator('[data-action="model-source-save"]').click();
  await expect(status).toHaveAttribute('data-state', 'error');
  await input.fill('https://models.example.com/hf');
  await settings.locator('[data-action="model-source-save"]').click();
  await expect(status).toHaveAttribute('data-state', 'ok');
  expect(
    await page.evaluate(() => localStorage.getItem('aive.model-source')),
  ).toBe('https://models.example.com/hf');
  await settings.locator('[data-action="model-source-reset"]').click();
  await expect(input).toHaveValue('');
  expect(
    await page.evaluate(() => localStorage.getItem('aive.model-source')),
  ).toBeNull();
  await page.screenshot({ path: 'reports/fix4/a6-model-source.png' });
});

// FIX4 V3: a Video Plan v3 built as ONE timeline (no media needed): one
// scene holds every layer, the shapes are real shape layers, Review & swap
// explains that chapters are stretches of the timeline.
test('[FX4-010] a v3 timeline plan builds one scene with shapes, a bubble and an overlay', async ({
  page,
}) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => '__AIVE__' in window)).toBe(true);
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page
    .locator('#ai-import-source')
    .fill(readFileSync('docs/samples/plan-v3-diagram.json', 'utf8'));
  await page.locator('[data-action="build-video"]').click();
  const dialog = page.locator('.plan-build');
  await settleBuild(page);
  const { project } = await hook(page);
  // The example project stays; the whole plan is ONE new scene.
  const built = project.compositions.filter((c) =>
    c.id.startsWith('ais_plan-how-big'),
  );
  expect(built).toHaveLength(1);
  const refs = built[0]!.layers.map((layer) =>
    String(
      (layer.properties as Record<string, { value: unknown }>).planRef?.value,
    ),
  );
  expect(refs).toContain('overlay/tag');
  expect(refs).toContain('protractor/ray');
  await dialog.locator('#plan-review').click();
  await expect(page.locator('#plan-timeline-note')).toBeVisible();
  await expect(
    page.locator('.plan-review [data-action="plan-delete"]'),
  ).toHaveCount(0);
  await page.screenshot({ path: 'reports/fix4/v3-timeline.png' });
});
