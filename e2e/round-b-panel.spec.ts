// ROUND-B B5: the panel UI pass. Layout that uses the width, one colour
// system, Studio style cards from the owner's pictures only, Studio tools in
// the reference layout, and no native-looking controls.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { setPlan, signUp } from './p2-helpers';
import { defaultConfig } from '../src/platform-config';

test.setTimeout(180_000);

async function useConfig(
  page: Page,
  change: (c: ReturnType<typeof defaultConfig>) => void,
) {
  const config = defaultConfig();
  change(config);
  await page.addInitScript((c) => {
    localStorage.setItem(
      'aive.platformConfig',
      JSON.stringify({
        versions: [
          {
            version: 1,
            savedAt: new Date().toISOString(),
            note: 'test',
            config: c,
          },
        ],
        live: 1,
      }),
    );
  }, config);
}
/** A Pro person with one Project (one empty Video). Returns the Project id. */
async function proWithProject(page: Page) {
  await signUp(page);
  await setPlan(page, 'pro');
  await page.goto('/panel/#/projects?new=1');
  await page.locator('#np-name').fill('Monsoon science');
  await page.locator('[data-option="editor"]').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page).toHaveURL(/\/panel\/#\/project\//);
  return /#\/project\/([^/?]+)/.exec(page.url())![1]!;
}
const open = async (page: Page, hash: string) => {
  await page.goto(`/panel/${hash}`);
  await expect(page.locator(`#outlet .page`)).toBeVisible();
};

test('[RDB-026] no panel page is a left-hugging column: at 1440 px every page fills its width or is a centred composition, the Project page and the Asset Library have a real second column; at 390 px everything stacks with no sideways scroll', async ({
  page,
}) => {
  const projectId = await proWithProject(page);
  const pages = [
    '#/home',
    '#/styles',
    '#/projects',
    `#/project/${projectId}`,
    `#/project/${projectId}/style`,
    `#/project/${projectId}/assets`,
    `#/project/${projectId}/memory`,
    '#/assets',
    '#/studio',
    '#/studio/images',
    '#/studio/story',
    '#/studio/voice',
    '#/credits',
    '#/brand',
    '#/settings',
    '#/learn',
  ];
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const hash of pages) {
    await open(page, hash);
    const m = await page.evaluate(() => {
      const pageEl = document.querySelector('#outlet .page')!;
      const box = pageEl.getBoundingClientRect();
      let left = Infinity;
      let right = -Infinity;
      for (const el of pageEl.querySelectorAll<HTMLElement>('*')) {
        if (el.children.length && !el.matches('button, a, input, textarea'))
          continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
      }
      return {
        width: box.width,
        leftGap: left - box.left,
        rightGap: box.right - right,
      };
    });
    const filled = m.rightGap <= m.width * 0.2;
    const centred = Math.abs(m.leftGap - m.rightGap) <= 48;
    expect(filled || centred, `${hash}: ${JSON.stringify(m)}`).toBe(true);
  }
  // A real second column.
  await open(page, `#/project/${projectId}`);
  const aside = page.locator('#project-aside');
  await expect(aside.locator('#aside-style')).toBeVisible();
  await expect(aside.locator('#aside-numbers')).toContainText('Videos');
  const main = (await page.locator('#video-list').boundingBox())!;
  const side = (await aside.boundingBox())!;
  expect(side.x).toBeGreaterThan(main.x + main.width - 1);
  await aside.locator('#aside-style-open').click();
  await expect(page).toHaveURL(/\/style$/);
  await open(page, '#/assets');
  await expect(
    page.locator('#library-aside [data-count="images"]'),
  ).toBeVisible();

  // A phone: one column, nothing wider than the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const hash of pages) {
    await open(page, hash);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    );
    expect(over, hash).toBeLessThanOrEqual(1);
  }
  await open(page, `#/project/${projectId}`);
  const list = (await page.locator('#video-list').boundingBox())!;
  const below = (await page.locator('#project-aside').boundingBox())!;
  expect(below.y).toBeGreaterThan(list.y + list.height - 1);
  await open(page, '#/studio/images');
  const controls = (await page.locator('#studio-controls').boundingBox())!;
  const work = (await page.locator('#studio-work').boundingBox())!;
  expect(work.y).toBeGreaterThan(controls.y + controls.height - 1);
});

test('[RDB-027] one colour system: the selected menu item, tab, Studio tab, chip, segmented button, selectable card, radio row and list option all compute the same selection colours (the gold tokens), in dark and light; the primary action is gold and the aurora gradient stays with Director', async ({
  page,
}) => {
  const projectId = await proWithProject(page);
  const read = async (selector: string) => {
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 400))),
    );
    return readNow(selector);
  };
  const readNow = (selector: string) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const s = getComputedStyle(el);
      return { color: s.color, bg: s.backgroundColor, line: s.borderTopColor };
    }, selector);
  const token = () =>
    page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.cssText =
        'color:var(--sel-text);background:var(--sel-bg);border:1px solid var(--sel-line)';
      document.body.append(probe);
      const s = getComputedStyle(probe);
      const out = {
        color: s.color,
        bg: s.backgroundColor,
        line: s.borderTopColor,
      };
      probe.remove();
      return out;
    });
  for (const theme of ['dark', 'light'] as const) {
    const kinds: Record<string, unknown> = {};
    const setTheme = () =>
      page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        document.documentElement.dataset.motion = 'off';
      }, theme);
    await open(page, `#/project/${projectId}`);
    await setTheme();
    const want = await token();
    kinds.menu = await read('.nav-item[aria-current]');
    kinds.tab = await read('.rda-tabs .tab[aria-selected="true"]');
    await open(page, '#/studio/voice');
    await setTheme();
    kinds.studioTab = await read('.tool-tab[aria-current="page"]');
    kinds.chip = await read(
      '[data-field="emotion"] .chip[aria-pressed="true"]',
    );
    kinds.segmented = await read('.sf-toggle .chip[aria-pressed="true"]');
    kinds.radioRow = await read('.sf-voice[aria-checked="true"]');
    await page.locator('#studio-model-button').click();
    kinds.option = await read('.ctl-option[aria-selected="true"]');
    await page.keyboard.press('Escape');
    await open(page, '#/studio/images');
    await setTheme();
    kinds.card = await read('.sf-card[aria-checked="true"]');
    for (const [kind, got] of Object.entries(kinds))
      expect(got, `${theme} ${kind}`).toEqual(want);
    // (Each read happens after the page settled: motion is off.)
    // Gold is also the primary action; it is not the aurora gradient.
    const primary = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('#studio-run')!);
      return s.backgroundImage + s.backgroundColor;
    });
    expect(primary).not.toContain('124, 92, 255');
    // Warm (gold) stops: red channel full, blue lower than red.
    expect(primary).toMatch(/srgb 1 0\.\d+ 0\.\d+|255, \d+, \d+/);
    expect(primary).not.toContain('34, 211, 238');
  }
  // The aurora is Director's: the Home start box and the Style chat.
  await open(page, '#/home');
  await expect(page.locator('#director-start.ai-moment')).toBeVisible();
});

test("[RDB-028] Studio style cards show a picture only from the config's thumb: the default Image styles are the owner's names as neutral tiles, a thumb set in the config shows that picture, and Video styles and voice avatars follow the same rule (no generated art)", async ({
  page,
}) => {
  const THUMB =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#0a7"/></svg>',
    );
  await useConfig(page, (c) => {
    const look = c.studios
      .find((s) => s.id === 'images')!
      .inputs.find((f) => f.id === 'look')!;
    look.options.find((o) => o.value === 'anime')!.thumb = THUMB;
  });
  await signUp(page);
  await setPlan(page, 'pro');
  await open(page, '#/studio/images');
  const cards = page.locator('[data-field="look"] .sf-card');
  await expect(cards.locator('.sf-card-name')).toHaveText([
    'None',
    'Dream Style',
    'Rural',
    'Horror 2',
    'Anime',
    'Realistic',
    '3D',
    'Village Style 2',
    '3D Kids Animation Style',
    'Cartoon Style',
    'Kids Animation Style',
    'Village Style',
  ]);
  // No picture: a neutral tile with the name and nothing drawn.
  const plain = cards.filter({ hasNot: page.locator('img') });
  await expect(plain).toHaveCount(11);
  await expect(cards.locator('svg')).toHaveCount(0);
  await expect(page.locator('.sf-card[data-value="rural"]')).toHaveAttribute(
    'data-thumb',
    'none',
  );
  // The owner's picture shows on its card only.
  const anime = page.locator('.sf-card[data-value="anime"]');
  await expect(anime).toHaveAttribute('data-thumb', 'picture');
  await expect(anime.locator('img')).toHaveAttribute('src', THUMB);
  // Video styles and voice avatars.
  await open(page, '#/studio/video');
  const video = page.locator('[data-field="look"] .sf-card');
  await expect(video).toHaveCount(5);
  await expect(video.locator('img, svg')).toHaveCount(0);
  await open(page, '#/studio/voice');
  await expect(
    page.locator('.sf-voice .sf-avatar[data-thumb="none"]'),
  ).toHaveCount(4);
  await expect(page.locator('.sf-voice svg.wave')).toHaveCount(0);
  await expect(page.locator('.sf-voice .sf-avatar img')).toHaveCount(0);
});

const TOOLS: {
  id: string;
  controls: string[];
  work: string[];
  action: 'controls' | 'main';
  empty?: string;
}[] = [
  {
    id: 'images',
    controls: ['model', 'aspect', 'look', 'count'],
    work: ['prompt'],
    action: 'main',
  },
  {
    id: 'story',
    controls: ['plot', 'form', 'language', 'category', 'duration'],
    work: ['ideas'],
    action: 'controls',
    empty: 'Craft a story in seconds',
  },
  {
    id: 'video',
    controls: [
      'first',
      'last',
      'prompt',
      'look',
      'resolution',
      'aspect',
      'duration',
      'audio',
    ],
    work: [],
    action: 'controls',
    empty: 'Start creating now',
  },
  {
    id: 'voice',
    controls: ['model'],
    work: ['script', 'voice', 'quality', 'emotion'],
    action: 'main',
  },
  {
    id: 'sfx',
    controls: ['model'],
    work: ['prompt', 'seconds'],
    action: 'main',
  },
  {
    id: 'voice-change',
    controls: ['voice'],
    work: ['sample', 'tips'],
    action: 'main',
  },
  {
    id: 'voice-clone',
    controls: ['name'],
    work: ['sample', 'how'],
    action: 'main',
  },
  {
    id: 'seo',
    controls: ['title', 'description', 'language', 'category', 'outputs'],
    work: [],
    action: 'controls',
    empty: 'Your SEO output awaits',
  },
];

test('[RDB-029] every Studio tool follows the reference layout: a controls column on the left and a wide workspace on the right with the main input where the reference has it, the credit cost on the action button, a history list, tips panels or an empty state; language chips are in their own script', async ({
  page,
}) => {
  await signUp(page);
  await setPlan(page, 'pro');
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const tool of TOOLS) {
    await open(page, `#/studio/${tool.id}`);
    const controls = page.locator('#studio-controls');
    const work = page.locator('#studio-work');
    const c = (await controls.boundingBox())!;
    const w = (await work.boundingBox())!;
    expect(c.x + c.width, tool.id).toBeLessThanOrEqual(w.x);
    expect(w.width, tool.id).toBeGreaterThan(c.width * 1.4);
    for (const f of tool.controls)
      await expect(
        controls.locator(`[data-field="${f}"]`),
        `${tool.id} ${f}`,
      ).toBeVisible();
    for (const f of tool.work)
      await expect(
        work.locator(`.sf-main [data-field="${f}"]`),
        `${tool.id} ${f}`,
      ).toBeVisible();
    // The action button carries the cost, in the column the reference has it.
    const run = page.locator('#studio-run');
    await expect(
      (tool.action === 'controls' ? controls : work).locator('#studio-run'),
    ).toBeVisible();
    const cost = (await page.locator('#studio-cost').textContent())!.replace(
      /\D+/g,
      '',
    );
    await expect(run.locator('#studio-run-cost')).toHaveText(cost);
    // History, and the empty state before the first result.
    await expect(work.locator('#studio-library h2')).toBeVisible();
    if (tool.empty)
      await expect(work.locator('#studio-empty')).toContainText(tool.empty);
  }
  // Language chips: each in its own script, whatever the panel language.
  await open(page, '#/studio/story');
  await expect(page.locator('[data-field="language"] .chip')).toHaveText([
    'English',
    'हिन्दी',
    'मराठी',
    'తెలుగు',
    'বাংলা',
    'ગુજરાતી',
    'தமிழ்',
    'ಕನ್ನಡ',
  ]);
  await open(page, '#/studio/seo');
  await expect(page.locator('[data-field="language"] .chip')).toHaveText([
    'हिन्दी',
    'বাংলা',
    'मराठी',
    'ଓଡ଼ିଆ',
    'తెలుగు',
    'English',
    'ಕನ್ನಡ',
    'മലയാളം',
    'தமிழ்',
  ]);
  // The cost on the button follows the choices.
  await open(page, '#/studio/images');
  const before = await page.locator('#studio-run-cost').textContent();
  await page.locator('[data-field="count"] .chip[data-value="4"]').click();
  await expect(page.locator('#studio-run-cost')).not.toHaveText(before!);
  // Tips panels sit in the workspace.
  await open(page, '#/studio/voice-change');
  await expect(page.locator('#studio-work .sf-info')).toContainText('quiet');
  // A result replaces the empty state and joins the history.
  await open(page, '#/studio/seo');
  await page.locator('#sf-title').fill('How rain forms');
  await page
    .locator('#sf-description')
    .fill('A short science explainer for children');
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-result')).not.toBeEmpty({
    timeout: 30_000,
  });
  await expect(page.locator('#studio-empty')).toBeHidden();
});

test('[RDB-030] no native-looking controls in the panel: every select is the shared list (mouse and keyboard), checkboxes, radios and colour inputs are drawn by the panel, and file inputs are a button with the file name (New project dialog, Studio forms, Style tab, Settings, Brand Kit)', async ({
  page,
}) => {
  const projectId = await proWithProject(page);
  const pages = [
    '#/settings',
    '#/brand',
    '#/projects?new=1',
    '#/studio/images',
    '#/studio/voice',
    '#/studio/voice-clone',
    '#/styles',
    `#/project/${projectId}/style`,
  ];
  for (const hash of pages) {
    await open(page, hash);
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll('select')) {
        const s = getComputedStyle(el);
        if (
          !el.parentElement?.classList.contains('ctl-select') ||
          s.opacity !== '0'
        )
          out.push(`select#${el.id}`);
      }
      for (const el of document.querySelectorAll<HTMLInputElement>(
        'input[type=checkbox], input[type=radio], input[type=color]',
      )) {
        const s = getComputedStyle(el);
        if (s.appearance !== 'none') out.push(`${el.type}#${el.id}`);
      }
      for (const el of document.querySelectorAll<HTMLInputElement>(
        'input[type=file]',
      )) {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const shown =
          s.display !== 'none' &&
          s.opacity !== '0' &&
          r.width > 2 &&
          r.height > 2;
        if (shown) out.push(`file#${el.id}`);
      }
      return out;
    });
    expect(bad, hash).toEqual([]);
  }
  // The shared list: by mouse.
  await open(page, '#/projects?new=1');
  await page.locator('#np-aspect-button').click();
  await expect(page.locator('#np-aspect-list')).toBeVisible();
  await page.locator('#np-aspect-list [data-value="9:16"]').click();
  await expect(page.locator('#np-aspect-list')).toBeHidden();
  await expect(page.locator('#np-aspect-button')).toContainText('9:16');
  await expect(page.locator('#np-aspect')).toHaveValue('9:16');
  // Escape closes the list, not the dialog.
  await page.locator('#np-aspect-button').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#np-aspect-list')).toBeHidden();
  await expect(page.locator('.np-dialog')).toBeVisible();
  // By keyboard, and the value is the form's value.
  await open(page, '#/settings');
  await page.locator('#settings-theme-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#settings-theme-list')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#settings-theme')).toHaveValue('light');
  await expect(page.locator('#settings-theme-button')).toContainText('Light');
  // A file: our button, and the chosen file's name beside it.
  await open(page, '#/brand');
  await expect(page.locator('#brand-logo-button')).toBeVisible();
  await page.locator('#brand-logo').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(page.locator('.ctl-file-name')).toHaveText('logo.png');
  // A drawn checkbox still works as one.
  await open(page, '#/styles');
  const box = page.locator('.page input[type="checkbox"]').first();
  await box.check();
  await expect(box).toBeChecked();
});
