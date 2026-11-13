// ROUND-A Parts A3 and A4: the Asset Library (Project › Video › three
// libraries, Studio Libraries, search, type filter, Trash), the editor's
// import dialogs and the Studio forms built from the Platform Config.
import type { Page } from '@playwright/test';
import { test, expect, hook, allowError, showCategory } from './fixtures';
import { setPlan, signUp } from './p2-helpers';
import { startStack, type Stack } from './p2-stack';
import { defaultConfig } from '../src/platform-config';

/** New project, Start with editor; back on the Project page. */
async function newEditorProject(page: Page, name: string) {
  await page.goto('/panel/#/projects?new=1');
  await page.locator('#np-name').fill(name);
  await page.locator('[data-option="editor"]').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  const videoId = (await hook(page)).project.id;
  await page.goBack();
  await page.getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page).toHaveURL(/\/panel\/#\/project\//);
  const projectId = /#\/project\/([^/?]+)/.exec(page.url())![1]!;
  return { projectId, videoId };
}
/** Runs AI Sound (3 credits) with a description, saved to `to` (a Video id or Studio Libraries). */
async function voiceover(page: Page, script: string, to = 'unsorted') {
  await page.goto('/panel/#/studio/sfx');
  await page.locator('#sf-prompt').fill(script);
  await page.locator('#studio-project').selectOption(to);
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-saved')).toBeVisible({ timeout: 30_000 });
}

test('[RDA-017] the Asset Library shows Project cards and one Studio Libraries card in the order they were made; a Project holds its Video cards and each Video the AI, My Templates and Media libraries; search and the type filter find items; Trash and Restore', async ({
  page,
}) => {
  await signUp(page);
  await setPlan(page, 'pro'); // AI Sound is a Pro tool
  const { projectId, videoId } = await newEditorProject(page, 'Library one');
  await voiceover(page, 'Hello from the project', videoId);
  await voiceover(page, 'Hello from the Studio');
  // The Project page's Assets tab groups this Project's assets by Video.
  await page.goto(`/panel/#/project/${projectId}/assets`);
  await expect(
    page.locator(`[data-asset-video="${videoId}"] [data-asset]`),
  ).toHaveCount(1);
  await page.goto('/panel/#/assets');
  const grid = page.locator('#lib-grid > *');
  await expect(grid).toHaveCount(2);
  await expect(grid.nth(0)).toHaveAttribute('data-lib-project', projectId);
  await expect(grid.nth(1)).toHaveAttribute('data-lib-studio', '');
  // Project › Video › three libraries.
  await grid.nth(0).click();
  await page.locator(`[data-lib-video="${videoId}"]`).click();
  await expect(page.locator('[data-library]')).toHaveCount(3);
  await expect(page.locator('[data-library="ai"]')).toContainText(
    'AI Libraries',
  );
  await expect(page.locator('[data-library="media"]')).toContainText('1');
  // Studio Libraries › one card per tool.
  await page.goto('/panel/#/assets/studio');
  await expect(page.locator('[data-studio-feature="sfx"]')).toContainText(
    'AI Sound',
  );
  // Search and type filter.
  await page.goto('/panel/#/assets');
  await page.locator('#lib-search').fill('from the studio');
  await expect(page.locator('#lib-results [data-asset]')).toHaveCount(1);
  await expect(page.locator('#lib-results .lib-where')).toContainText(
    'Studio Libraries',
  );
  await page.locator('#lib-search').fill('');
  await page.locator('[data-type-filter="audio"]').click();
  await expect(page.locator('#lib-results [data-asset]')).toHaveCount(2);
  await page.locator('[data-type-filter="images"]').click();
  await expect(page.locator('#lib-results')).toHaveCount(0);
  await expect(page.locator('#lib-body')).toContainText('Nothing matches.');
  // Delete goes to the Trash; Restore brings it back.
  await page.goto('/panel/#/assets/studio/sfx');
  await page.locator('[data-trash]').first().click();
  await expect(page.locator('#asset-list [data-asset]')).toHaveCount(0);
  await page.goto('/panel/#/assets/trash');
  await page.locator('[data-restore]').first().click();
  await page.goto('/panel/#/assets/studio/sfx');
  await expect(page.locator('#asset-list [data-asset]')).toHaveCount(1);
  // Regenerating keeps the old result and adds the new one.
  await voiceover(page, 'Hello from the Studio');
  await page.goto('/panel/#/assets/studio/sfx');
  await expect(page.locator('#asset-list [data-asset]')).toHaveCount(2);
});

test("[RDA-018] the editor's Import from your Library lists Project › Video › items and Studio Libraries › tool › items, copies the chosen one into the open Video's Media, and the same item twice is one media item", async ({
  page,
}) => {
  await signUp(page);
  await setPlan(page, 'pro'); // AI Sound is a Pro tool
  const { videoId } = await newEditorProject(page, 'Source project');
  await voiceover(page, 'Narration for the source', videoId);
  await voiceover(page, 'A Studio sound');
  // A second Project's Video, opened in the editor.
  await page.goto('/panel/#/projects?new=1');
  await page.locator('#np-name').fill('Target');
  await page.locator('[data-option="editor"]').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  const assets = async () => (await hook(page)).project.assets.length;
  const before = await assets();
  await showCategory(page, 'Media');
  const importOnce = async (name: string) => {
    await page.locator('#import-menu').click();
    await page.locator('#import-library-item').click();
    const groups = page.locator('[data-role="lib-import-groups"]');
    await expect(
      groups.locator('.import-project-head', { hasText: 'Source project' }),
    ).toBeVisible();
    await expect(
      groups.locator('.import-project-head', { hasText: 'Studio Libraries' }),
    ).toBeVisible();
    await groups.locator('.import-row', { hasText: name }).click();
    await page.locator('[data-role="lib-import-confirm"]').click();
    await expect(page.locator('.import-groups')).toHaveCount(0);
  };
  await importOnce('A Studio sound');
  await expect.poll(assets).toBe(before + 1);
  await importOnce('A Studio sound');
  await expect.poll(assets).toBe(before + 1);
  await importOnce('Narration for the source');
  await expect.poll(assets).toBe(before + 2);
});

test('[RDA-019] Studio lists Image, Video, Story, SEO, Voice and Captions; Voice has four tabs (AI Voiceover, AI Sound, Audio to Audio, Voice Clone) and no Music; Story checks the plot under the field, shows the cost before Run, fills the plot from an idea and keeps its history', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/studio');
  const list = page.locator('#studio-list [data-studio]');
  await expect(list).toHaveCount(6);
  for (const id of ['images', 'video', 'story', 'seo', 'voice', 'captions'])
    await expect(
      page.locator(`#studio-list [data-studio="${id}"]`),
    ).toHaveCount(1);
  await page.goto('/panel/#/studio/voice');
  await expect(page.locator('#studio-family-tabs [data-tab]')).toHaveText([
    'AI Voiceover',
    'AI Sound',
    'Audio to Audio',
    'Voice Clone',
  ]);
  // Story.
  await page.goto('/panel/#/studio/story');
  await expect(page.locator('#studio-cost')).toContainText('credits');
  await page.locator('#studio-run').click();
  await expect(page.locator('[data-error="plot"]')).toBeVisible();
  await expect(page.locator('#studio-saved')).toHaveCount(0);
  const ideas = page.locator('[data-field="ideas"] .sf-idea');
  const shown = await ideas.count();
  await page.locator('[data-act="more-ideas"]').click();
  expect(await ideas.count()).toBeGreaterThan(shown);
  await page.locator('[data-field="category"] [data-value="horror"]').click();
  await ideas.first().click();
  await expect(page.locator('#sf-plot')).not.toHaveValue('');
  await expect(
    page.locator('[data-field="language"] [data-value]'),
  ).toHaveCount(8);
  await page.locator('[data-field="form"] [data-value="dialogue"]').click();
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-saved')).toBeVisible();
  await expect(page.locator('#studio-library [data-asset]')).toHaveCount(1);
  await expect(page.locator('#studio-library h2')).toHaveText(
    'Generated history',
  );
  // SEO: languages, categories and the four outputs.
  await page.goto('/panel/#/studio/seo');
  await expect(
    page.locator('[data-field="language"] [data-value]'),
  ).toHaveCount(9);
  await expect(page.locator('[data-field="outputs"] [data-value]')).toHaveText([
    'Titles',
    'Description',
    'Tags',
    'Hashtags',
  ]);
});

test('[RDA-019] Image and Video forms follow the Autodraft fields: aspect ratios, style cards, reference image, Enhance prompt, count and Advanced; Video swaps first and last frame, Generate prompt writes one, and 1080p is plan-gated', async ({
  page,
}) => {
  // A plan with Video but without the 1080p feature (config): Creator.
  const config = defaultConfig();
  config.plans.find((p) => p.id === 'creator')!.features.push('studio-video');
  await page.addInitScript((c) => {
    localStorage.setItem(
      'aive.platformConfig',
      JSON.stringify({
        versions: [
          {
            version: 1,
            savedAt: new Date().toISOString(),
            note: 't',
            config: c,
          },
        ],
        live: 1,
      }),
    );
  }, config);
  await signUp(page);
  await setPlan(page, 'pro');
  await page.goto('/panel/#/studio/images');
  await expect(page.locator('[data-field="aspect"] [data-value]')).toHaveText([
    '1:1',
    '3:2',
    '2:3',
    '16:9',
    '9:16',
    '4:3',
    '3:4',
  ]);
  await expect(
    page.locator('[data-field="look"] .sf-card').first(),
  ).toBeVisible();
  await page.locator('[data-field="look"] [data-value="anime"]').click();
  await expect(
    page.locator('[data-field="look"] [data-value="anime"]'),
  ).toHaveAttribute('aria-checked', 'true');
  await page.locator('#sf-prompt').fill('A tiger in the rain');
  await page.locator('[data-field="prompt"] [data-act="enhance"]').click();
  await expect(page.locator('#sf-prompt')).toHaveValue(
    /A tiger in the rain, detailed/,
  );
  await page.locator('#sf-reference').setInputFiles({
    name: 'ref.png',
    mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
  });
  await expect(page.locator('[data-field="reference"]')).toContainText(
    'ref.png',
  );
  const advanced = page.locator('[data-group="advanced"]');
  await expect(advanced).not.toHaveAttribute('open', '');
  await advanced.locator('summary').click();
  await expect(page.locator('#sf-negative')).toHaveValue(/blurry/);
  await expect(page.locator('#sf-seed')).toHaveValue('-1');
  await expect(page.locator('#sf-nsfw')).toBeVisible();
  await page.locator('[data-field="count"] [data-value="2"]').click();
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-saved')).toBeVisible();
  await expect(page.locator('#studio-library h2')).toHaveText('My generations');
  // Voice Clone: how it works, a sample, and the consent tick before it runs.
  await page.goto('/panel/#/studio/voice-clone');
  await expect(page.locator('[data-field="how"] li')).toHaveCount(3);
  await page.locator('#sf-sample').setInputFiles({
    name: 'me.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('ID3'),
  });
  await page.locator('#sf-name').fill('My voice');
  await page.locator('#studio-run').click();
  await expect(page.locator('#consent-error')).toContainText('consent');
  await expect(page.locator('#studio-saved')).toHaveCount(0);
  // A file that is too big is refused under its field.
  await page.goto('/panel/#/studio/video');
  const big = Buffer.alloc(11 * 1024 * 1024);
  await page
    .locator('#sf-first')
    .setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: big });
  await page.locator('#sf-prompt').fill('x');
  await page.locator('#studio-run').click();
  await expect(page.locator('[data-error="first"]')).toContainText('10 MB');
  await page.locator('#sf-first').setInputFiles({
    name: 'first.png',
    mimeType: 'image/png',
    buffer: Buffer.from('a'),
  });
  await page.locator('#sf-last').setInputFiles({
    name: 'last.webp',
    mimeType: 'image/webp',
    buffer: Buffer.from('b'),
  });
  await page.locator('[data-field="first"] [data-act="swap"]').click();
  await expect(page.locator('[data-field="first"]')).toContainText('last.webp');
  await expect(page.locator('[data-field="last"]')).toContainText('first.png');
  await page.locator('[data-field="prompt"] [data-act="generate"]').click();
  await expect(page.locator('#sf-prompt')).toHaveValue(/smooth camera move/);
  await expect(
    page.locator('[data-field="resolution"] [data-value="1080p"]'),
  ).toBeEnabled();
  await expect(page.locator('[data-field="sound"]')).toHaveCount(0);
  await page.locator('[data-field="audio"] [data-value="on"]').click();
  await expect(page.locator('[data-field="sound"]')).toBeVisible();
  await setPlan(page, 'creator');
  await page.goto('/panel/#/studio/video');
  await expect(
    page.locator('[data-field="resolution"] [data-value="1080p"]'),
  ).toBeDisabled();
});

test('[RDA-019] Upscale and Remove Background show as Image tabs only once the owner assigns them a model', async ({
  page,
}) => {
  const config = defaultConfig();
  const image = config.models.find((m) => m.id === 'mock-image')!;
  image.roles.push('studio-image-upscale');
  config.assignments['studio-image-upscale'] = 'mock-image';
  await page.addInitScript((c) => {
    localStorage.setItem(
      'aive.platformConfig',
      JSON.stringify({
        versions: [
          {
            version: 1,
            savedAt: new Date().toISOString(),
            note: 't',
            config: c,
          },
        ],
        live: 1,
      }),
    );
  }, config);
  await signUp(page);
  await setPlan(page, 'pro');
  await page.goto('/panel/#/studio/images');
  await expect(page.locator('#studio-family-tabs [data-tab]')).toHaveText([
    'Image Generation',
    'Upscale',
  ]);
});

let stack: Stack | null = null;
test.afterEach(async () => {
  await stack?.close();
  stack = null;
});

test('[RDA-020] [RDA-002] with a gateway the server decides the limits; when the server is down a New project is refused in one sentence, nothing is made and the typed name stays', async ({
  page,
}) => {
  test.setTimeout(180_000);
  stack = await startStack(['ANTHROPIC_API_KEY'], (c) => {
    c.plans.find((p) => p.id === 'free')!.limits.projects = 1;
  });
  await stack.use(page);
  const gateway = stack.url;
  allowError(
    page,
    (m) => (m.includes('403') || m.includes('ERR_')) && m.includes(gateway),
    'The gateway refuses over-limit actions, and is stopped on purpose.',
  );
  allowError(
    page,
    (m) => m.includes('ERR_CONNECTION_REFUSED'),
    'The gateway is stopped on purpose to prove a limit never passes offline.',
  );
  await signUp(page);
  await newEditorProject(page, 'Server one');
  // The server refuses the second Project.
  await page.goto('/panel/#/projects?new=1');
  await page.locator('#np-name').fill('Server two');
  await page.locator('[data-option="editor"]').click();
  await expect(page.locator('#project-limit')).toContainText(
    'Your plan allows 1 projects.',
  );
  // The server goes down: still refused, nothing made, the name kept.
  await stack.close();
  stack = null;
  await page.locator('#np-name').fill('Offline try');
  await page.locator('[data-option="editor"]').click();
  await expect(page.locator('#project-limit')).toContainText(
    'could not be reached',
  );
  await expect(page.locator('#np-name')).toHaveValue('Offline try');
  await page.locator('#np-close').click();
  await expect(page.locator('#project-list [data-ws-project]')).toHaveCount(1);
});
