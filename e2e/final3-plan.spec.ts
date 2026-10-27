import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, hook, menuAction, showCategory } from './fixtures';
import { mockStock, GOOD_KEY } from './stock-mock';

// FINAL3 Part D at 1920 × 940: a Video Plan v2 imported in AI › Import is
// checked in plain words and built end to end (media from mocked stock,
// voice from the test speech engine, captions, camera, transitions), with
// no slot dialog; Review & swap edits the result.
const PLAN = readFileSync('tests/fixtures/plans/honey-en.json', 'utf8');
type Layer = {
  id: string;
  type: string;
  assetId?: string | null;
  properties: Record<string, { value: unknown }>;
  transform: { position: { value: [number, number] } };
  children: Layer[];
};
const allLayers = async (page: Page) => {
  const { project } = await hook(page);
  const list: (Layer & { scene: string })[] = [];
  const visit = (layers: Layer[], scene: string) =>
    layers.forEach((layer) => {
      list.push({ ...layer, scene });
      visit(layer.children, scene);
    });
  project.compositions.forEach((c) =>
    visit(c.layers as unknown as Layer[], c.id),
  );
  return list;
};
const withKey = (page: Page) =>
  page.addInitScript(
    ([key]) =>
      localStorage.setItem(
        'aive.provider-key.pixabay.apiKey',
        JSON.stringify(key),
      ),
    [GOOD_KEY] as const,
  );
const withVoice = (page: Page) =>
  page.addInitScript(() => {
    (window as { __AIVE_E2E_SPEECH__?: boolean }).__AIVE_E2E_SPEECH__ = true;
  });
async function emptyProject(page: Page) {
  await menuAction(page, '#new-project');
  await page.locator('#new-project-form button[type="submit"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(page.locator('#new-project-form')).toBeHidden();
  await expect
    .poll(async () => {
      const { project } = await hook(page);
      return (
        project.compositions.length === 1 &&
        !project.compositions[0]!.layers.length
      );
    })
    .toBe(true);
}
async function importPlan(page: Page, text = PLAN) {
  await showCategory(page, 'AI');
  await page.locator('#library-ai #ai-import').click();
  await page.locator('#ai-import-source').fill(text);
}
async function build(page: Page) {
  await importPlan(page);
  await page.locator('[data-action="build-video"]').click();
  const dialog = page.locator('.plan-build');
  await expect(dialog).toBeVisible();
  await expect(page.locator('.composition-dialog')).toHaveCount(0);
  await expect(dialog.locator('#plan-summary')).toBeVisible({
    timeout: 60_000,
  });
  return dialog;
}

test('[FN3-021] a v2 plan builds end to end: progress, media from stock with alternatives, voice, captions, camera, transitions; it replaces the empty scene in one undo step and opens the strip', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withKey(page);
  await withVoice(page);
  const mock = await mockStock(page);
  await page.goto('/');
  await emptyProject(page);
  const dialog = await build(page);
  for (const step of [
    'check',
    'media',
    'voice',
    'layout',
    'captions',
    'camera',
  ])
    await expect(dialog.locator(`[data-step="${step}"]`)).toHaveAttribute(
      'data-state',
      'done',
    );
  await expect(dialog.locator('#plan-summary')).toContainText('3 scenes');
  await page.screenshot({ path: 'reports/final3/d-build.png' });
  const state = await hook(page);
  expect(state.project.compositions.map((c) => c.name)).toEqual([
    'Cold open',
    'The hive',
    'Close',
  ]);
  expect(state.history.labels.at(-1)).toBe('Build video');
  expect(state.session.selectedIds).toEqual([]);
  expect(state.session.compositionId).toBe(state.project.compositions[0]!.id);
  expect(mock.downloads.length).toBeGreaterThan(0);
  await expect(
    page.locator('.toast', { hasText: 'Built 3 scenes' }),
  ).toBeVisible();
  await expect(page.locator('#scene-strip')).toBeVisible();
  const layers = await allLayers(page);
  expect(
    layers.some(
      (l) => l.properties.planRef?.value === 'open/flower' && l.assetId,
    ),
  ).toBe(true);
  expect(layers.filter((l) => l.properties.captionCue).length).toBeGreaterThan(
    2,
  );
  expect(layers.some((l) => l.properties.role?.value === 'camera')).toBe(true);
  expect(
    state.project.compositions[1]!.markers.some((m) =>
      m.label.startsWith('aive:scene-transition'),
    ),
  ).toBe(true);
  // Narration from the voice engine.
  expect(state.project.assets.some((a) => a.name.startsWith('Narration'))).toBe(
    true,
  );
  // One undo removes the whole build (the empty scene comes back).
  await dialog.locator('#plan-cancel').click();
  await page.locator('#undo').click();
  await expect
    .poll(async () => (await hook(page)).project.compositions.length)
    .toBe(1);
});

test('[FN3-022] without a voice key the video is silent with a banner; with stock down media get fallback cards and "needs asset" flags and the build still completes', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await withKey(page);
  const mock = await mockStock(page);
  mock.mode = 'down';
  await page.goto('/');
  const dialog = await build(page);
  await expect(dialog.locator('#plan-banner')).toContainText(
    'Built without voice',
  );
  await expect(dialog.locator('[data-step="voice"]')).toHaveAttribute(
    'data-state',
    'failed',
  );
  await expect(dialog.locator('#plan-summary')).toContainText('needs an asset');
  await expect(dialog.locator('#plan-summary')).toContainText(
    'could not be reached',
  );
  const flagged = (await allLayers(page)).filter(
    (l) => l.properties.planFlag?.value === 'needs-asset',
  );
  expect(flagged.length).toBeGreaterThanOrEqual(2);
  // Captions still follow the narration (timed by its length).
  expect((await allLayers(page)).some((l) => l.properties.captionCue)).toBe(
    true,
  );
  // Review shows the banner and the flag.
  await dialog.locator('#plan-review').click();
  const panel = page.locator('.plan-review');
  await expect(panel.locator('#plan-review-silent')).toBeVisible();
  await expect(
    panel.locator('[data-plan-layer="open/flower"]'),
  ).toHaveAttribute('data-flag', 'needs-asset');
  await page.screenshot({ path: 'reports/final3/d-fallback.png' });
});

test('[FN3-023] Review & swap: an alternative swaps the media keeping its place and animation; changing the narration speaks it again and remakes the scene; Export plan and Compare', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await withKey(page);
  await withVoice(page);
  await mockStock(page);
  await page.goto('/');
  const dialog = await build(page);
  await dialog.locator('#plan-review').click();
  const panel = page.locator('.plan-review');
  const row = panel.locator('[data-plan-layer="open/flower"]');
  // The chosen stock picture is the pressed alternative.
  await expect(
    row.locator('.plan-alternative[aria-pressed="true"]'),
  ).toHaveCount(1);
  const before = (await allLayers(page)).find(
    (l) => l.properties.planRef?.value === 'open/flower',
  )!;
  const animationOf = async (layerId: string) =>
    (await hook(page)).project.compositions
      .flatMap((c) => c.tracks.flatMap((t) => t.clips))
      .find((c) => c.layerId === layerId)!.metadata.animation;
  const animation = await animationOf(before.id);
  expect(animation).toBeTruthy();
  // Use my own: a picture from disk replaces it in place.
  const chooser = page.waitForEvent('filechooser');
  await row.locator('[data-action="plan-use-own"]').click();
  await (
    await chooser
  ).setFiles('tests/fixtures/media/image_gradient_1920x1080.png');
  await expect
    .poll(async () => (await hook(page)).history.labels.at(-1))
    .toBe('Swap media');
  const after = (await allLayers(page)).find(
    (l) => l.properties.planRef?.value === 'open/flower',
  )!;
  expect(after.id).toBe(before.id);
  expect(after.assetId).not.toBe(before.assetId);
  expect(after.transform.position.value).toEqual(
    before.transform.position.value,
  );
  expect(await animationOf(after.id)).toEqual(animation);
  // Narration: Update voice regenerates the scene (new voice, captions).
  const closeScene = async () =>
    (await hook(page)).project.compositions.find((c) => c.name === 'Close')!;
  const sceneBefore = (await closeScene()).id;
  await panel.locator('#plan-narration-close').fill('Thank a bee today.');
  await panel
    .locator('[data-plan-scene="close"] [data-action="plan-voice"]')
    .click();
  await expect
    .poll(async () => (await hook(page)).history.labels.at(-1), {
      timeout: 30_000,
    })
    .toBe('Regenerate scene');
  const regenerated = await closeScene();
  expect(regenerated.id).not.toBe(sceneBefore);
  const captions = (await allLayers(page)).filter(
    (l) => l.scene === regenerated.id && l.properties.captionCue,
  );
  expect(
    JSON.stringify(captions.map((c) => c.properties.captionCue!.value)),
  ).toContain('Thank');
  // Compare and export.
  await panel.locator('[data-action="plan-compare"]').click();
  await expect(panel.locator('.plan-compare')).toBeVisible();
  const download = page.waitForEvent('download');
  await panel.locator('[data-action="plan-export"]').click();
  const file = await (await download).path();
  const exported = JSON.parse(readFileSync(file!, 'utf8'));
  expect(exported.format).toBe('video-plan');
  expect(exported.resolved['open/flower']).toMatch(/^asset:/);
  expect(exported.scenes[2].narration).toBe('Thank a bee today.');
  await page.screenshot({ path: 'reports/final3/d-review.png' });
});

test('[FN3-024] the importer checks a plan in plain words: errors reject it, an unknown starter-kit id is a warning; a v1 composition still opens the slot dialog', async ({
  page,
}) => {
  await page.goto('/');
  const plan = JSON.parse(PLAN);
  delete plan.scenes[0].layers[0].mediaIntent;
  await importPlan(page, JSON.stringify(plan));
  const row = page.locator('.ai-import-item');
  await expect(row).toHaveAttribute('data-status', 'rejected');
  await expect(row).toContainText(
    'Scene 1 (open), layer "flower" is media without "mediaIntent"',
  );
  await page.locator('#ai-import-source').fill('');
  plan.scenes[0].layers[0].mediaIntent = { query: 'bee', type: 'photo' };
  plan.scenes[1].layers[1].kit = 'lower-third-9';
  await page.locator('#ai-import-source').fill(JSON.stringify(plan));
  await expect(row).toHaveAttribute('data-status', 'warning');
  await expect(row).toContainText('the starter kit has no "lower-third-9"');
  await expect(page.locator('[data-action="build-video"]')).toBeVisible();
  // A v1 composition pack still uses the slot dialog.
  await page.locator('#ai-import-source').fill('');
  await expect(row).toHaveCount(0);
  await page
    .locator('#ai-import-source')
    .fill(
      readFileSync(
        'examples/creator-packs/composition-documentary-mini.json',
        'utf8',
      ),
    );
  await page.locator('[data-action="build-video"]').click();
  await expect(
    page.locator('.composition-dialog .composition-slot'),
  ).not.toHaveCount(0);
});

test('[FN3-025] the AI category lists the plan with its status, its feel as a Theme and the starter kit; the feel saves as a theme (contains / does not contain), exports as a Creator Pack, applies without changing content and a plan can name it', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await withKey(page);
  await withVoice(page);
  await mockStock(page);
  await page.goto('/');
  const dialog = await build(page);
  await dialog.locator('#plan-review').click();
  // AI: the plan (Built), its feel (Theme) and the starter kit.
  await page.locator('[data-action="side-panel-back"]:visible').click();
  await showCategory(page, 'AI');
  const ai = page.locator('#library-ai');
  await expect(ai.locator('[data-plan-status="built"]')).toHaveCount(1);
  await expect(ai).toContainText('Where honey comes from · feel');
  const kit = ai.locator('[data-kit="lower-third-1"]');
  await expect(kit).toHaveCount(1);
  await kit.click();
  await expect
    .poll(async () => (await hook(page)).history.labels.at(-1))
    .toBe('Add starter kit item');
  await page.screenshot({ path: 'reports/final3/d-ai.png' });
  // Save the feel as a theme from Review & swap (the palette opens it).
  await page.keyboard.press('Control+k');
  await page.locator('#command-palette input').fill('Review video plan');
  await page.keyboard.press('Enter');
  const review = page.locator('.plan-review');
  await review.locator('#plan-feel-name').fill('Honey feel');
  await review.locator('[data-action="plan-save-feel"]').click();
  await expect(page.locator('.toast', { hasText: 'Honey feel' })).toBeVisible();
  // My themes: what it holds; export as a Creator Pack.
  await showCategory(page, 'Theme');
  const card = page
    .locator('.theme-group[data-group="saved"] .theme-card')
    .filter({ hasText: 'Honey feel' });
  await expect(card.locator('.theme-contains')).toContainText(
    'transition, camera tendency, pacing',
  );
  await expect(card.locator('.theme-contains')).toContainText(
    'Does not contain text, media or layout',
  );
  const download = page.waitForEvent('download');
  await card.locator('[data-action="theme-more"]').click();
  await page
    .locator('#library-theme-menu [data-action="theme-export"]')
    .click();
  const pack = JSON.parse(
    readFileSync((await (await download).path())!, 'utf8'),
  );
  expect(pack.items[0].type).toBe('theme');
  expect(pack.items[0].data.palette.background).toBe('#1b1a17');
  // Applying it changes colours, not content.
  const count = (await allLayers(page)).length;
  await card.locator('.theme-apply').click();
  await expect(
    page.locator('.toast', { hasText: 'transition, camera and pacing' }),
  ).toBeVisible();
  expect((await allLayers(page)).length).toBe(count);
  // A plan can name it: its scenes take the theme's background.
  const themeId = await card.getAttribute('data-theme-id');
  const plan = JSON.parse(PLAN);
  delete plan.feel;
  plan.meta.title = 'Honey again';
  plan.meta.themeId = themeId;
  plan.scenes = [plan.scenes[2]];
  await importPlan(page, JSON.stringify(plan));
  await page.locator('[data-action="build-video"]').click();
  await expect(page.locator('.plan-build #plan-summary')).toBeVisible({
    timeout: 60_000,
  });
  const { project, session } = await hook(page);
  const again = project.compositions.find(
    (c) => c.id === session.compositionId,
  )!;
  expect(again.backgroundColor).toBe('#1b1a17');
});

test('[FIX6-004] a pasted video plan offers Build video; Add to AI, Also add to the scene and Copy report are not shown', async ({
  page,
}) => {
  await page.goto('/');
  await importPlan(page);
  await expect(page.locator('[data-action="build-video"]')).toBeVisible();
  await expect(page.locator('#ai-import-add')).toBeHidden();
  await expect(page.locator('#ai-import-scene-row')).toBeHidden();
  await expect(page.locator('#ai-import-report')).toBeHidden();
  await expect(page.locator('#ai-import-cancel')).toBeVisible();
});
