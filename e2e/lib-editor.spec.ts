import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CDPSession, Page } from '@playwright/test';
import { test, expect, hook, showCategory, allowError } from './fixtures';
import {
  OWNER,
  ownerCode,
  startOwnerStack,
  type OwnerStack,
} from './lib-owner-helpers';

// Phase 1 library, Part D (P1-20 to P1-29): the editor reads every library
// item from the owner's signed catalog. The catalog here is the owner app's
// own catalog server (its seed plus one published video and photo), so the
// editor is tested against what the owner really serves.
test.describe.configure({ mode: 'serial' });
let stack: OwnerStack;
const cli = (...args: string[]) => {
  const run = spawnSync(
    process.execPath,
    ['owner/run.mjs', '/owner/cli.ts', ...args],
    {
      env: stack.env,
      encoding: 'utf8',
    },
  );
  if (run.status !== 0) throw new Error(run.stderr || run.stdout);
  return run.stdout;
};
test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startOwnerStack(2);
  const media = path.join(stack.root, 'media');
  mkdirSync(media, { recursive: true });
  copyFileSync(
    'tests/fixtures/media/video_testsrc_720p_2s_vp9_opus.webm',
    path.join(media, 'clip.webm'),
  );
  copyFileSync(
    'tests/fixtures/media/image_testsrc_1200x800.jpg',
    path.join(media, 'photo.jpg'),
  );
  const meta = (id: string, en: string, hi: string) =>
    JSON.stringify({
      id,
      name: { en, hi },
      tags: ['test'],
      license: { name: 'Original', credit: 'Test fixture' },
    });
  writeFileSync(
    path.join(media, 'clip.webm.meta.json'),
    meta('video-test-clip', 'Test clip', 'टेस्ट क्लिप'),
  );
  writeFileSync(
    path.join(media, 'photo.jpg.meta.json'),
    meta('photo-test', 'Test photo', 'टेस्ट फ़ोटो'),
  );
  // A Creator Pack style, published by the owner, shows in AI › Styles.
  copyFileSync(
    'examples/creator-packs/style-documentary.json',
    path.join(media, 'style-documentary.json'),
  );
  const out = cli('publish', media);
  if (!/Catalog version \d+ is live/.test(out)) throw new Error(out);
  // A plan key (Phase 2 sets these in the manager): the heart shape.
  const itemsFile = path.join(stack.env.LIBRARY_DATA_DIR!, 'items.json');
  const items = JSON.parse(readFileSync(itemsFile, 'utf8')) as {
    items: { id: string; planKey?: string | null }[];
  };
  items.items.find((item) => item.id === 'shape-heart')!.planKey = 'pro';
  writeFileSync(itemsFile, JSON.stringify(items));
  cli('build');
});
test.afterAll(() => stack?.stop());

async function openEditor(page: Page) {
  await page.addInitScript((url) => {
    (window as { __AIVE_LIBRARY_CATALOG__?: string }).__AIVE_LIBRARY_CATALOG__ =
      url;
  }, stack.catalogUrl);
  await page.goto('/');
  await hook(page);
}
/** The editor's catalog client (the same module instance the editor uses). */
const clientStatus = (page: Page) =>
  page.evaluate(async () => {
    const mod = (await import('/src/library-client/index.ts' as string)) as {
      libraryClient(): {
        status: {
          source: string;
          catalogVersion: number | null;
          problem: string | null;
        };
      };
    };
    return mod.libraryClient().status;
  });
const layerCount = async (page: Page) =>
  (await hook(page)).project.compositions[0]!.layers.length;

test('[LIB-022][LIB-020][LIB-023][LIB-029] every library category loads from the signed catalog: shapes, flowchart (Draw), text, templates, sounds, themes, styles, videos and photos; cards show a placeholder before their picture, and a plan item shows locked', async ({
  page,
}) => {
  const asked: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(stack.catalogUrl)) asked.push(request.url());
  });
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  expect(asked.some((url) => url.endsWith('manifest.json'))).toBe(true);
  // No library file comes from the editor's own server any more.
  const own = await page.request.get('/library/index.json');
  expect(await own.text()).not.toContain('shape-star-5');

  await showCategory(page, 'Elements');
  const elements = page.locator('#library-elements');
  await expect(
    elements.locator('[data-item-id="shape-star-5"]').first(),
  ).toBeVisible();
  await expect(
    elements.locator('[data-catalog-id="video-test-clip"]'),
  ).toBeVisible();
  await expect(
    elements.locator('[data-catalog-id="photo-test"]'),
  ).toBeVisible();
  await elements.locator('.browse-search-input').fill('terminator');
  await expect(
    elements.locator('[data-item-id="shape-flow-terminator"]'),
  ).toBeVisible();
  await elements.locator('.browse-search-input').fill('');

  await showCategory(page, 'Text');
  await expect(
    page.locator('#library-text [data-item-id^="combo-"]').first(),
  ).toBeVisible();
  await showCategory(page, 'Templates');
  await expect(
    page.locator('#library-templates [data-item-id^="template-"]').first(),
  ).toBeVisible();
  await showCategory(page, 'Audio');
  await expect(page.locator('#library-audio .sound-tile')).toHaveCount(12);
  await showCategory(page, 'Theme');
  await expect(
    page.locator('#library-extras-Theme [data-kind="theme"]'),
  ).toHaveCount(8);
  await expect(
    page.locator('#library-extras-Theme [data-card-id="theme-dark-neon"]'),
  ).toBeVisible();
  await showCategory(page, 'AI');
  await expect(
    page.locator('#library-ai .shelf-tab[data-tab="style"]'),
  ).toBeVisible();
});

test('[LIB-021] with no catalog and no saved copy the editor still opens with the tiny fallback pack and says why', async ({
  page,
}) => {
  allowError(
    page,
    (message) =>
      message.includes(stack.catalogUrl) || /ERR_FAILED|net::/.test(message),
    'The catalog is made unreachable on purpose to show the fallback pack.',
  );
  await page.route(`${stack.catalogUrl}**`, (route) => route.abort());
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('fallback');
  await showCategory(page, 'Elements');
  const elements = page.locator('#library-elements');
  await expect(
    elements.locator('[data-item-id="fallback-star"]').first(),
  ).toBeVisible();
  await expect(elements.locator('[data-item-id="shape-star-5"]')).toHaveCount(
    0,
  );
  await expect(elements.locator('.browse-status-error')).toContainText(
    'only a few basic items',
  );
  // A fallback card still inserts (one step).
  const before = await layerCount(page);
  await elements.locator('[data-item-id="fallback-star"]').first().click();
  await expect.poll(() => layerCount(page)).toBe(before + 1);
});

test('[LIB-021][LIB-006] a catalog with a wrong signature is rejected and the saved copy keeps working', async ({
  page,
}) => {
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  const version = (await clientStatus(page)).catalogVersion;
  // The next manifest is tampered with: one byte of the signed text.
  await page.route(`${stack.catalogUrl}manifest.json`, async (route) => {
    const response = await route.fetch({
      headers: { 'cache-control': 'no-cache' },
    });
    const wrapper = JSON.parse(await response.text()) as { signed: string };
    wrapper.signed = wrapper.signed.replace(
      /"catalogVersion":(\d+)/,
      (_, n: string) => `"catalogVersion":${Number(n) + 5}`,
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(wrapper),
    });
  });
  await page.reload();
  await hook(page);
  await expect
    .poll(async () => (await clientStatus(page)).problem ?? '')
    .toContain('signature is wrong');
  const status = await clientStatus(page);
  expect(status.source).toBe('cache');
  expect(status.catalogVersion).toBe(version);
  await showCategory(page, 'Elements');
  await expect(
    page.locator('#library-elements [data-item-id="shape-star-5"]').first(),
  ).toBeVisible();
});

let released = 0;
/** Times one insert in the page: from the release to the first frame drawn with the new layer. */
async function timeInsert(page: Page, act: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __lib?: {
        t0: number;
        t1: number;
        layers: number;
        draws: number;
        frames: number;
      };
      __AIVE__: {
        getProject(): { compositions: { layers: unknown[] }[] };
        getCanvas(): { draws: number };
      };
    };
    const count = () =>
      w.__AIVE__
        .getProject()
        .compositions.reduce((sum, scene) => sum + scene.layers.length, 0);
    const state = {
      t0: 0,
      t1: 0,
      layers: count(),
      draws: w.__AIVE__.getCanvas().draws,
      frames: 0,
    };
    w.__lib = state;
    const mark = () => (state.t0 = performance.now());
    window.addEventListener('pointerup', mark, { capture: true, once: true });
    window.addEventListener('click', () => state.t0 || mark(), {
      capture: true,
      once: true,
    });
    const watch = () => {
      if (state.t0) state.frames++;
      if (
        state.t0 &&
        count() > state.layers &&
        w.__AIVE__.getCanvas().draws > state.draws
      ) {
        state.t1 = performance.now();
        return;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  const requests: { url: string; at: number }[] = [];
  const onRequest = (request: { url(): string }) => {
    if (!/^(data|blob):/.test(request.url()))
      requests.push({ url: request.url(), at: Date.now() });
  };
  page.on('request', onRequest);
  const started = Date.now();
  released = 0;
  await act();
  const done = await page.waitForFunction(() => {
    const state = (
      window as unknown as { __lib: { t0: number; t1: number; frames: number } }
    ).__lib;
    return state.t1
      ? {
          ms: state.t1 - state.t0,
          frames: state.frames,
          drawnAt: performance.timeOrigin + state.t1,
        }
      : null;
  });
  // Requests made after the release and before the layer was drawn (the
  // critical path); a drag's own early work happens before the release.
  const from = released || started;
  page.off('request', onRequest);
  const { ms, frames, drawnAt } = (await done.jsonValue()) as {
    ms: number;
    frames: number;
    drawnAt: number;
  };
  const critical = requests
    .filter((request) => request.at >= from && request.at <= drawnAt)
    .map((request) => request.url);
  return { ms, frames, critical };
}
async function throttle(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 1500,
    downloadThroughput: 20 * 1024,
    uploadThroughput: 20 * 1024,
  });
  return cdp;
}
const stage = async (page: Page) => {
  const box = (await page.locator('#composition-canvas').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
async function drag(page: Page, from: string, to: { x: number; y: number }) {
  await page.locator(from).first().scrollIntoViewIfNeeded();
  const source = (await page.locator(from).first().boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source.x + source.width / 2 + 30,
    source.y + source.height / 2 + 10,
    { steps: 4 },
  );
  await page.mouse.move(to.x, to.y, { steps: 8 });
  released = Date.now();
  await page.mouse.up();
}

test('[LIB-024][LIB-025] on a throttled network every category places at once, by click and by drag, with no request on the critical path; a video shows its poster at once and swaps to the full file without moving', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  // Show every category once, so their cards (and prefetches) are in place.
  for (const category of ['Templates', 'Text', 'Audio', 'Elements'])
    await showCategory(page, category);
  const elements = page.locator('#library-elements');
  await expect(
    elements.locator('[data-catalog-id="video-test-clip"]'),
  ).toBeVisible();
  // P1-24: the shown cards made their proxies and posters local.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const mod = (await import(
          '/src/library-client/index.ts' as string
        )) as {
          libraryClient(): {
            entry(id: string): {
              media?: { proxy?: unknown; poster?: { sha256: string } };
            };
            has(ref: unknown, key?: string): Promise<boolean>;
            poster(sha: string): unknown;
          };
          catalogMediaKey(sha: string): string;
        };
        const client = mod.libraryClient();
        const ok = [];
        for (const id of ['video-test-clip', 'sound-ding', 'sound-chime']) {
          const media = client.entry(id).media as {
            proxy: { sha256: string };
            poster?: { sha256: string };
          };
          ok.push(
            await client.has(
              media.proxy,
              mod.catalogMediaKey(media.proxy.sha256),
            ),
          );
          if (id === 'video-test-clip')
            ok.push(!!client.poster(media.poster!.sha256));
        }
        return ok.every(Boolean);
      }),
    )
    .toBe(true);
  await page.waitForLoadState('networkidle');
  await throttle(page);
  const results: Record<string, { ms: number; frames: number }> = {};
  // The new layer is in the first frame the editor draws after the release
  // (nothing waits on the network or a decode); the time is recorded.
  const check = async (name: string, act: () => Promise<void>) => {
    const { ms, frames, critical } = await timeInsert(page, act);
    results[name] = { ms: Math.round(ms * 10) / 10, frames };
    expect(critical, `${name}: requests on the critical path`).toEqual([]);
    expect(
      frames,
      `${name}: frames from release to the first drawn frame`,
    ).toBeLessThanOrEqual(1);
  };
  const center = await stage(page);

  // Elements: a shape, by click and by drag.
  await check('elements click', () =>
    elements.locator('[data-item-id="shape-star-5"]').first().click(),
  );
  await elements.locator('.browse-search-input').fill('hexagon');
  await check('elements drag', () =>
    drag(page, '#library-elements [data-item-id="shape-polygon-6"]', center),
  );
  // Draw: a flowchart shape.
  await elements.locator('.browse-search-input').fill('terminator');
  await expect(
    elements.locator('[data-item-id="shape-flow-terminator"]'),
  ).toBeVisible();
  await check('draw click', () =>
    elements.locator('[data-item-id="shape-flow-terminator"]').click(),
  );
  await check('draw drag', () =>
    drag(
      page,
      '#library-elements [data-item-id="shape-flow-terminator"]',
      center,
    ),
  );
  await elements.locator('.browse-search-input').fill('');
  // Text: a font combination.
  await showCategory(page, 'Text');
  await check('text click', () =>
    page.locator('#library-text [data-item-id^="combo-"]').first().click(),
  );
  await check('text drag', () =>
    drag(page, '#library-text [data-item-id^="combo-"]', center),
  );
  // Audio: a sound effect.
  await showCategory(page, 'Audio');
  await check('audio click', () =>
    page
      .locator('#library-audio .sound-tile[data-sound="ding"] .sound-tile-add')
      .click(),
  );
  await check('audio drag', () =>
    drag(
      page,
      '#library-audio .sound-tile[data-sound="chime"] .sound-tile-add',
      center,
    ),
  );
  // Elements: a video (heavy media): the poster is drawn at once.
  await showCategory(page, 'Elements');
  const centrePixel = () =>
    page
      .locator('#composition-canvas')
      .evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext('2d')!;
        return [
          ...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1)
            .data,
        ];
      });
  const empty = await centrePixel();
  await check('video click', () =>
    elements.locator('[data-catalog-id="video-test-clip"]').click(),
  );
  const corners = async () =>
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __AIVE__: { getCanvas(): { corners: unknown } };
          }
        ).__AIVE__.getCanvas().corners,
    );
  const before = await corners();
  expect(before).not.toBeNull();
  // The poster is drawn at once: the centre of the canvas changed.
  expect(await centrePixel()).not.toEqual(empty);
  // The full file arrives later (throttled) and replaces the proxy in place.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const mod = (await import(
            '/src/library-client/index.ts' as string
          )) as {
            libraryClient(): {
              entry(id: string): { media?: { full: { sha256: string } } };
              has(ref: unknown, key?: string): Promise<boolean>;
            };
            catalogMediaKey(sha: string): string;
          };
          const full = mod.libraryClient().entry('video-test-clip').media!.full;
          return mod
            .libraryClient()
            .has(full, mod.catalogMediaKey(full.sha256));
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(await corners()).toEqual(before);
  const video = (await hook(page)).project.assets.find(
    (asset) =>
      (asset.metadata as { catalog?: { id: string } }).catalog?.id ===
      'video-test-clip',
  );
  expect(video?.source.reference).toMatch(/^media\/[0-9a-f]{32}$/);
  expect(
    (await hook(page)).project.compositions[0]!.layers.some(
      (layer) => (layer as { assetId?: string }).assetId === video!.id,
    ),
  ).toBe(true);
  // The video drag (a second copy) and the photo.
  await check('video drag', () =>
    drag(page, '#library-elements [data-catalog-id="video-test-clip"]', center),
  );
  await check('photo click', () =>
    elements.locator('[data-catalog-id="photo-test"]').click(),
  );
  await check('photo drag', () =>
    drag(page, '#library-elements [data-catalog-id="photo-test"]', center),
  );
  // Templates: a template as a new scene (the dialog's choice, then Enter).
  await showCategory(page, 'Templates');
  await page
    .locator('#library-templates [data-item-id^="template-"]')
    .first()
    .click();
  await expect(page.locator('.modal-dialog')).toBeVisible();
  await check('templates click', () =>
    page.locator('.modal-dialog [data-action="template-confirm"]').click(),
  );
  await expect(page.locator('.modal-dialog')).toHaveCount(0);

  writeFileSync(
    testInfo.outputPath('instant-insert.json'),
    JSON.stringify(results, null, 2),
  );
  testInfo.annotations.push({
    type: 'release-to-first-frame-ms',
    description: JSON.stringify(results),
  });
});

test('[LIB-026] a failed download never blocks: the video is placed from its proxy, a toast offers Retry, and Retry fetches the full file', async ({
  page,
}) => {
  allowError(
    page,
    (message) =>
      message.includes(`${stack.catalogUrl}files/`) &&
      /ERR_FAILED|failed/i.test(message),
    'The full video file is blocked on purpose to show the Retry toast.',
  );
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  const full = await page.evaluate(async () => {
    const mod = (await import('/src/library-client/index.ts' as string)) as {
      libraryClient(): {
        entry(id: string): { media: { full: { url: string } } };
      };
    };
    return mod.libraryClient().entry('video-test-clip').media.full.url;
  });
  let blocked = true;
  await page.route(`${stack.catalogUrl}${full}`, (route) =>
    blocked ? route.abort() : route.continue(),
  );
  await showCategory(page, 'Elements');
  const before = await layerCount(page);
  await page
    .locator('#library-elements [data-catalog-id="video-test-clip"]')
    .click();
  await expect.poll(() => layerCount(page)).toBe(before + 1);
  const toast = page.locator('.toast:not(.toast-leaving)');
  await expect(toast).toContainText('could not be downloaded');
  blocked = false;
  await toast.getByRole('button', { name: 'Retry' }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const mod = (await import(
          '/src/library-client/index.ts' as string
        )) as {
          libraryClient(): {
            entry(id: string): { media: { full: { sha256: string } } };
            has(ref: unknown, key?: string): Promise<boolean>;
          };
          catalogMediaKey(sha: string): string;
        };
        const ref = mod.libraryClient().entry('video-test-clip').media.full;
        return mod.libraryClient().has(ref, mod.catalogMediaKey(ref.sha256));
      }),
    )
    .toBe(true);
  expect(await layerCount(page)).toBe(before + 1);
});

test('[LIB-023][LIB-017] what the owner hides, features, orders, schedules or unpublishes in the manager shows in the editor after a refresh', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await openEditor(page);
  await showCategory(page, 'Audio');
  const tiles = page.locator('#library-audio .sound-tile');
  await expect(tiles).toHaveCount(12);
  const names = async () =>
    tiles.evaluateAll((items) =>
      items.map((item) => (item as HTMLElement).dataset.sound!),
    );
  expect((await names())[0]).not.toBe('riser');

  // The owner, in the manager (its own page and login).
  // (The error guard watches the editor page only; the manager's own
  // 401/403 answers are on purpose.)
  const owner = await context.newPage();
  await owner.goto(stack.ownerUrl);
  await owner.locator('#email').fill(OWNER.email);
  await owner.locator('#password').fill(OWNER.password);
  await owner.locator('#code').fill(ownerCode());
  await owner.getByRole('button', { name: 'Log in' }).click();
  await expect(owner.locator('[data-tab="library"]')).toBeVisible();
  await owner.locator('#tree [data-node="Audio"] .tree-label').click();
  const card = (id: string) => owner.locator(`.item[data-id="${id}"]`);
  const edit = async (id: string) => {
    const details = card(id).locator('details.edit');
    if (!(await details.evaluate((node: HTMLDetailsElement) => node.open)))
      await card(id).locator('summary').click();
  };
  const save = async (id: string) => {
    const status = owner.locator('#status');
    const before = (await status.textContent()) ?? '';
    await edit(id);
    await card(id).locator('[data-action="save"]').click();
    await expect(status).not.toHaveText(before);
    await expect(status).toContainText(/Catalog version \d+ is live/);
  };
  await edit('sound-ding');
  await card('sound-ding').locator('[data-field="hidden"]').check();
  await save('sound-ding');
  await edit('sound-riser');
  await card('sound-riser').locator('[data-field="featured"]').check();
  await save('sound-riser');
  await edit('sound-pop');
  await card('sound-pop').locator('[data-field="order"]').fill('-5');
  await save('sound-pop');
  await edit('sound-click');
  await card('sound-click')
    .locator('[data-field="publish-at"]')
    .fill('2030-01-01T09:00');
  await save('sound-click');
  // Unpublish asks for the password and a fresh code.
  await card('sound-thud').locator('[data-action="unpublish"]').click();
  await expect(owner.locator('#reauth')).toBeVisible();
  await owner.locator('#reauth-password').fill(OWNER.password);
  await owner.locator('#reauth-code').fill(ownerCode());
  await owner.locator('#reauth-confirm').click();
  await expect(card('sound-thud').locator('[data-state]')).toContainText(
    'Not published',
  );

  // The editor, refreshed.
  await page.bringToFront();
  await page.reload();
  await hook(page);
  await showCategory(page, 'Audio');
  await expect.poll(names).not.toContain('thud');
  const shown = await names();
  expect(shown).not.toContain('ding');
  expect(shown).not.toContain('click');
  expect(shown[0]).toBe('riser'); // Featured first.
  expect(shown[1]).toBe('pop'); // Then by order.
  expect(shown).toHaveLength(9);
});

test('[FIX7-017][FIX7-021] a category and sub-categories the owner adds appear in the editor with their assets: a new rail category, a new Elements tile, and an asset moved into them, with no release', async ({
  page,
}) => {
  const itemsFile = path.join(stack.env.LIBRARY_DATA_DIR!, 'items.json');
  const data = JSON.parse(readFileSync(itemsFile, 'utf8')) as {
    items: { id: string; place?: unknown }[];
    config?: unknown;
  };
  const name = (en: string, hi: string) => ({ en, hi });
  data.config = {
    format: 'aive-config',
    version: 1,
    controls: {},
    categories: [
      {
        id: 'x-festivals',
        name: name('Festivals', 'त्योहार'),
        icon: 'elements',
        hidden: false,
        order: 0,
        subs: [
          {
            id: 'diwali',
            name: name('Diwali', 'दिवाली'),
            hidden: false,
            order: 0,
            sections: [],
          },
        ],
      },
      {
        id: 'Elements',
        name: name('Elements', 'एलिमेंट'),
        icon: 'elements',
        hidden: false,
        order: 0,
        subs: [
          {
            id: 'lanterns',
            name: name('Lanterns', 'लालटेन'),
            hidden: false,
            order: 0,
            sections: [],
          },
        ],
      },
    ],
  };
  (data.config as { categories: unknown[] }).categories.push({
    id: 'Audio',
    name: name('Audio', 'ऑडियो'),
    icon: 'audio',
    hidden: false,
    order: 0,
    subs: [
      {
        id: 'ambience',
        name: name('Ambience', 'माहौल'),
        hidden: false,
        order: 0,
        sections: [],
      },
    ],
  });
  data.items.find((item) => item.id === 'shape-star-5')!.place = {
    category: 'x-festivals',
    sub: 'diwali',
    section: null,
  };
  data.items.find((item) => item.id === 'shape-heart')!.place = {
    category: 'Elements',
    sub: 'lanterns',
    section: null,
  };
  writeFileSync(itemsFile, JSON.stringify(data));
  cli('build');
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  const rail = page.locator('#rail-left [data-category="x-festivals"]');
  await expect(rail).toBeVisible();
  await rail.click();
  const panel = page.locator('#library-x-festivals');
  await expect(panel).toBeVisible();
  await panel.locator('[data-tile="x-festivals-diwali"]').click();
  await expect(panel.locator('[data-item-id="shape-star-5"]')).toBeVisible();
  await page.screenshot({ path: 'reports/fix7-editor-custom-category.png' });
  // The star left Basic shapes; the new Lanterns tile lists the heart.
  await showCategory(page, 'Elements');
  const elements = page.locator('#library-elements');
  await elements.locator('[data-tile="Elements-lanterns"]').click();
  await expect(elements.locator('[data-item-id="shape-heart"]')).toBeVisible();
  await page.screenshot({ path: 'reports/fix7-editor-custom-sub.png' });
  // The same works under every editor panel: Audio lists the new sub-category.
  await showCategory(page, 'Audio');
  await expect(
    page.locator('#library-extras-Audio [data-tile="Audio-ambience"]'),
  ).toBeVisible();
  await page.screenshot({ path: 'reports/fix7-editor-audio-extra.png' });
  await expect(page.locator('#library-extras-Theme')).toBeHidden();
});

test('[FIX7-018] what the owner switches off for a kind of selection disappears from the editor: a right-panel tab, a toolbar button and a right-click entry, for shapes only', async ({
  page,
}) => {
  const itemsFile = path.join(stack.env.LIBRARY_DATA_DIR!, 'items.json');
  const data = JSON.parse(readFileSync(itemsFile, 'utf8')) as {
    config: { controls: unknown };
  };
  data.config.controls = {
    off: ['panel.shape.Effects', 'toolbar.shape.fill', 'menu.shape.lock'],
  };
  writeFileSync(itemsFile, JSON.stringify(data));
  cli('build');
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  await showCategory(page, 'Elements');
  await page.locator('[data-shape="rectangle"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  const tabs = page.locator('#rail-right button[data-section]:visible');
  await expect(tabs.filter({ hasText: /Animate/ })).toHaveCount(1);
  await expect(
    page.locator('#rail-right [data-section="Effects"]'),
  ).toBeHidden();
  await expect(
    page.locator('#context-toolbar [data-control="fill"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('#context-toolbar [data-control="position"]'),
  ).toHaveCount(1);
  const canvas = (await page.locator('#composition-canvas').boundingBox())!;
  await page.mouse.click(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height / 2,
    { button: 'right' },
  );
  await expect(
    page.locator('#canvas-context-menu [data-action="duplicate"]'),
  ).toBeVisible();
  await expect(
    page.locator('#canvas-context-menu [data-action="lock"]'),
  ).toHaveCount(0);
  await page.screenshot({ path: 'reports/fix7-editor-controls-off.png' });
  await page.keyboard.press('Escape');
  // Text keeps all of its own controls.
  await showCategory(page, 'Text');
  await page.locator('#add-text-box').click();
  await expect(
    page.locator('#context-toolbar [data-control="font"]'),
  ).toHaveCount(1);
});

test('[FIX7-022][FIX7-023] an AI-made pack the owner publishes works wherever it is placed: a plan card moved into a new Templates sub-category and copied to Audio opens its card menu (Review & swap, Build again) and builds, and it leaves the AI category', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const packs = path.join(stack.root, 'packs');
  mkdirSync(packs, { recursive: true });
  copyFileSync(
    'examples/creator-packs/composition.json',
    path.join(packs, 'plan.json'),
  );
  const out = cli('publish', packs);
  if (!/Published/.test(out)) throw new Error(out);
  const itemsFile = path.join(stack.env.LIBRARY_DATA_DIR!, 'items.json');
  const data = JSON.parse(readFileSync(itemsFile, 'utf8')) as {
    items: { id: string; kind: string; place?: unknown; alsoIn?: unknown }[];
    config: { categories: { id: string; subs: unknown[] }[] };
  };
  const plan = data.items.find((item) => item.kind === 'composition')!;
  expect(plan, out).toBeTruthy();
  data.config ??= {
    format: 'aive-config',
    version: 1,
    controls: {},
    categories: [],
  } as never;
  data.config.categories.push({
    id: 'Templates',
    name: { en: 'Templates', hi: 'टेम्पलेट' },
    icon: 'templates',
    hidden: false,
    order: 0,
    subs: [
      {
        id: 'documentary',
        name: { en: 'Documentary', hi: 'डॉक्यूमेंट्री' },
        hidden: false,
        order: 0,
        sections: [],
      },
    ],
  } as never);
  plan.place = { category: 'Templates', sub: 'documentary', section: null };
  plan.alsoIn = [{ category: 'Audio', sub: null, section: null }];
  writeFileSync(itemsFile, JSON.stringify(data));
  cli('build');
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  const cardId = `catalog--${plan.id}`;
  await showCategory(page, 'Templates');
  const templates = page.locator('#library-extras-Templates');
  await templates.locator('[data-tile="Templates-documentary"]').click();
  const card = templates.locator(`[data-item-id="${cardId}"]`);
  await expect(card).toBeVisible();
  await page.screenshot({ path: 'reports/fix7-ai-card-in-templates.png' });
  await card.click({ button: 'right' });
  await expect(page.locator('[data-action="ai-review"]')).toBeVisible();
  await expect(page.locator('[data-action="ai-rebuild"]')).toBeVisible();
  await page.keyboard.press('Escape');
  // The copy under Audio.
  await showCategory(page, 'Audio');
  await expect(
    page.locator(`#library-extras-Audio [data-item-id="${cardId}"]`),
  ).toBeVisible();
  // It left the AI category.
  await showCategory(page, 'AI');
  await expect(page.locator(`#library-ai [data-item="${cardId}"]`)).toHaveCount(
    0,
  );
});

test('[FIX7-024] a photo, a sound and a theme the owner places in another category show there and work, and a sound moved out of Audio leaves the Audio list', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const itemsFile = path.join(stack.env.LIBRARY_DATA_DIR!, 'items.json');
  const data = JSON.parse(readFileSync(itemsFile, 'utf8')) as {
    items: { id: string; kind: string; place?: unknown; alsoIn?: unknown }[];
    config?: { categories: { id: string; subs: unknown[] }[] };
  };
  data.config ??= {
    format: 'aive-config',
    version: 1,
    controls: {},
    categories: [],
  } as never;
  if (!data.config!.categories.some((c) => c.id === 'Text'))
    data.config!.categories.push({
      id: 'Text',
      name: { en: 'Text', hi: 'टेक्स्ट' },
      icon: 'text',
      hidden: false,
      order: 0,
      subs: [],
    } as never);
  data.config!.categories.push({
    id: 'Scene',
    name: { en: 'Scene', hi: 'सीन' },
    icon: 'layers',
    hidden: false,
    order: 0,
    subs: [
      {
        id: 'moods',
        name: { en: 'Moods', hi: 'मूड' },
        hidden: false,
        order: 0,
        sections: [],
      },
    ],
  } as never);
  const photo = data.items.find((item) => item.kind === 'image')!;
  const sound = data.items.find((item) => item.kind === 'sound');
  expect(photo).toBeTruthy();
  photo.alsoIn = [{ category: 'Text', sub: 'plain', section: null }];
  if (sound) sound.place = { category: 'Text', sub: 'plain', section: null };
  writeFileSync(itemsFile, JSON.stringify(data));
  cli('build');
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  await showCategory(page, 'Scene');
  await expect(
    page.locator('#library-extras-Scene [data-tile="Scene-moods"]'),
  ).toBeVisible();
  await showCategory(page, 'Text');
  const text = page.locator('#library-text');
  await text
    .locator('[data-tile="Text-plain"], [data-card-id]')
    .first()
    .waitFor();
  await text
    .getByText('Plain text')
    .first()
    .click()
    .catch(() => undefined);
  await page.screenshot({ path: 'reports/fix7-cross-placement.png' });
  await expect(
    text.locator(`[data-catalog-id="${photo.id}"]`).first(),
  ).toBeVisible();
  if (sound) {
    await expect(
      text.locator(`[data-catalog-id="${sound.id}"]`).first(),
    ).toBeVisible();
    await showCategory(page, 'Audio');
    await expect(
      page.locator(
        `#library-audio [data-sound-id="${sound.id}"], #library-audio [data-id="${sound.id}"]`,
      ),
    ).toHaveCount(0);
  }
});

test('[LIB-027][LIB-008] a rollback in the catalog never changes a project that already uses an item', async ({
  page,
}) => {
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  await showCategory(page, 'Elements');
  const elements = page.locator('#library-elements');
  await elements.locator('[data-catalog-id="video-test-clip"]').click();
  await elements.locator('[data-item-id="shape-star-5"]').first().click();
  await expect.poll(() => layerCount(page)).toBeGreaterThan(1);
  const before = await hook(page);
  // The owner rolls the catalog back to the seed (before the video).
  const live = (await clientStatus(page)).catalogVersion!;
  cli('rollback', '1');
  await page.reload();
  await hook(page);
  await expect
    .poll(async () => (await clientStatus(page)).catalogVersion)
    .toBeGreaterThan(live);
  await showCategory(page, 'Elements');
  await expect(
    elements.locator('[data-catalog-id="video-test-clip"]'),
  ).toHaveCount(0);
  const after = await hook(page);
  expect(after.project.compositions[0]!.layers).toEqual(
    before.project.compositions[0]!.layers,
  );
  expect(after.project.assets).toEqual(before.project.assets);
});

test('[FIX7-028] filters, effects and transitions the owner publishes as recipes show in the right panel as Library tiles and apply: a filter and an effect on a picture, with only built-in ids stored', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const packs = path.join(stack.root, 'fx-packs');
  mkdirSync(packs, { recursive: true });
  copyFileSync(
    'examples/creator-packs/fx-recipes.json',
    path.join(packs, 'fx.json'),
  );
  const out = cli('publish', packs);
  if (!/Published/.test(out)) throw new Error(out);
  expect(out).not.toMatch(/rejected/i);
  cli('build');
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles(['tests/fixtures/media/image_testsrc_1200x800.jpg']);
  await expect(page.locator('#media-import')).toBeHidden();
  await page
    .locator(
      '.media-item:has(.media-card[data-name="image_testsrc_1200x800.jpg"]) .media-card',
    )
    .click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  const tab = (name: string) =>
    page.locator(`#rail-right [data-section="${name}"]`);
  await tab('Filters').click();
  const tile = page.locator('#right-section .fx-tile', {
    hasText: 'Documentary warm',
  });
  await expect(tile).toBeVisible();
  await tile.click();
  const fxIds = async () => {
    const state = await hook(page);
    const scene = state.project.compositions.find(
      (item) => item.id === state.session.compositionId,
    )!;
    return (
      scene.tracks.flatMap((track) => track.clips)[0]!.metadata as {
        fx?: { stack: { id: string }[] };
      }
    ).fx?.stack.map((entry) => entry.id);
  };
  await expect.poll(fxIds).toEqual(['filter.retro', 'adjust.contrast']);
  await page.screenshot({ path: 'reports/fix7-library-filter.png' });
  await tab('Effects').click();
  const effect = page.locator('#right-section .fx-tile', {
    hasText: 'Dream glow',
  });
  await expect(effect).toBeVisible();
  await effect.click();
  await expect
    .poll(fxIds)
    .toEqual(['filter.retro', 'adjust.contrast', 'effect.glow']);
  await page.screenshot({ path: 'reports/fix7-library-effect.png' });
});

test('[FIX7-029] built-in filter and effect tiles the owner switches off for photos disappear from the right panel; the others stay', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const itemsFile = path.join(stack.env.LIBRARY_DATA_DIR!, 'items.json');
  const data = JSON.parse(readFileSync(itemsFile, 'utf8')) as {
    config: { controls: unknown };
  };
  data.config ??= {
    format: 'aive-config',
    version: 1,
    controls: {},
    categories: [],
  } as never;
  data.config.controls = {
    off: ['fx.image.filter:retro', 'fx.image.effect:effect.glow'],
  };
  writeFileSync(itemsFile, JSON.stringify(data));
  cli('build');
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (
    await chooser
  ).setFiles(['tests/fixtures/media/image_testsrc_1200x800.jpg']);
  await expect(page.locator('#media-import')).toBeHidden();
  await page
    .locator(
      '.media-item:has(.media-card[data-name="image_testsrc_1200x800.jpg"]) .media-card',
    )
    .click({ button: 'right' });
  await page.locator('#media-menu [data-action="media-add"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  await page.locator('#rail-right [data-section="Filters"]').click();
  await expect(
    page.locator('#right-section .fx-tile[data-tile="golden-hour"]'),
  ).toBeVisible();
  await expect(
    page.locator('#right-section .fx-tile[data-tile="retro"]'),
  ).toHaveCount(0);
  await page.locator('#rail-right [data-section="Effects"]').click();
  await expect(
    page.locator('#right-section .fx-tile[data-tile="effect.flash"]'),
  ).toBeVisible();
  await expect(
    page.locator('#right-section .fx-tile[data-tile="effect.glow"]'),
  ).toHaveCount(0);
  await page.screenshot({ path: 'reports/fix7-fx-tiles-off.png' });
});

test('[FIX7-030] a font file the owner publishes joins the font picker under Library fonts, sets the text and survives a reload from the cache', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const fonts = path.join(stack.root, 'font-pack');
  mkdirSync(fonts, { recursive: true });
  copyFileSync(
    'public/fonts/poppins/poppins-latin-600-normal.woff2',
    path.join(fonts, 'brand.woff2'),
  );
  writeFileSync(
    path.join(fonts, 'brand.woff2.meta.json'),
    JSON.stringify({
      id: 'font-owner-brand',
      name: { en: 'Owner Brand Sans', hi: 'ओनर ब्रांड सैंस' },
      tags: ['font'],
      license: { name: 'OFL', credit: 'Poppins' },
    }),
  );
  writeFileSync(
    path.join(fonts, 'fake.ttf'),
    'this is not a font file at all, just words. '.repeat(5),
  );
  writeFileSync(
    path.join(fonts, 'fake.ttf.meta.json'),
    JSON.stringify({ license: { name: 'OFL' } }),
  );
  const out = cli('publish', fonts);
  expect(out).toMatch(/Published/);
  expect(out).toMatch(/not a real \.ttf/);
  cli('build');
  await openEditor(page);
  await expect
    .poll(async () => (await clientStatus(page)).source)
    .toBe('catalog');
  await showCategory(page, 'Text');
  await page.locator('#add-text-box').click();
  await page.keyboard.insertText('Library font');
  await page.keyboard.press('Escape');
  await page.locator('#toolbar-font').click();
  const panel = page.locator('[data-tool-panel="font"]');
  const mine = panel.locator('[data-font="Owner Brand Sans"]');
  await expect(mine).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator('[data-font-section="library"]')).toBeVisible();
  await page.screenshot({ path: 'reports/fix7-library-font.png' });
  await mine.click();
  await expect
    .poll(async () =>
      page.evaluate(() => document.fonts.check('16px "Owner Brand Sans"')),
    )
    .toBe(true);
});
