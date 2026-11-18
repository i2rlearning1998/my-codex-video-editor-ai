// ROUND-C5 Part 2 in the browser. (1) Admin › Appearance used like the
// owner: find a slot, start it, upload a picture, click the focus, save.
// (2) What a person sees: the owner's picture on the Credits hero, a Style
// card's video with its poster (only the poster with reduced motion or data
// saving), a broken picture falls back to today's drawing, a hidden plan
// card. (3) The crawl: every card and hero of the panel and the website is a
// slot or names why it is not.
import { mkdirSync, readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, allowError } from './fixtures';
import { PASSWORD } from './p2-helpers';
import {
  OWNER,
  ownerCode,
  startOwnerStack,
  type OwnerStack,
} from './lib-owner-helpers';
import { startC2Stack, type C2Stack } from './round-c2-stack';
import type { PlatformConfig } from '../src/platform-config';

const SHOTS = 'reports/round-c5/screens';
mkdirSync(SHOTS, { recursive: true });
const PNG = readFileSync('tests/fixtures/media/image_alpha_logo_512.png');
const PNG2 = readFileSync('tests/fixtures/media/image_gradient_1920x1080.png');
const WEBM = readFileSync(
  'tests/fixtures/media/video_testsrc_720p_2s_vp9_opus.webm',
);
const SELECTOR =
  '.card, .poster, .credit-hero, .start-hero, .site-section.hero, .empty-state';

test.describe('Admin › Appearance', () => {
  let stack: OwnerStack;
  test.beforeAll(async () => {
    stack = await startOwnerStack(19);
  });
  test.afterAll(() => stack?.stop());

  test('[RDC5-019] the owner finds the Credits hero slot, starts it, uploads a picture, sets the focus by clicking it and saves; the slot shows as set', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    allowError(
      page,
      (m) => m.includes(stack.ownerUrl) && /40\d|50\d/.test(m),
      'The owner app answers 401 before login, on purpose.',
    );
    await page.goto(stack.ownerUrl);
    await page.locator('#email').fill(OWNER.email);
    await page.locator('#password').fill(OWNER.password);
    await page.locator('#code').fill(ownerCode());
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.locator('[data-tab="appearance"]').click();
    await expect(page.locator('#appearance-screen')).toBeVisible();
    await page.locator('#appearance-search').fill('credits');
    const slot = page.locator('[data-slot-card="hero:credits"]');
    await expect(slot).toBeVisible();
    await slot.locator('[data-slot-start="hero:credits"]').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-upload="slot-hero-credits-image"]').click();
    await (
      await chooser
    ).setFiles({ name: 'hero.png', mimeType: 'image/png', buffer: PNG2 });
    await expect(page.locator('#slot-hero-credits-image')).toHaveValue(
      /\/files\/[0-9a-f]{64}\.png$/,
    );
    // The preview is drawn on the next redraw (the search box redraws).
    await page.locator('#appearance-search').fill('credit');
    const img = page.locator('[data-slot-preview="hero:credits"] img');
    await expect(img).toBeVisible();
    const box = (await img.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.75);
    await expect(
      page.locator('[data-slot-focus="hero:credits"]'),
    ).toContainText('25%, 75%');
    await page.screenshot({ path: `${SHOTS}/appearance.png`, fullPage: true });
    await page.locator('#appearance-save').click();
    await expect(page.locator('#status')).toContainText(
      'Saved as config version',
    );
    await expect(page.locator('[data-slot-set="hero:credits"]')).toBeVisible();
  });
});

test.describe('the panel and the website', () => {
  let stack: C2Stack | null = null;
  test.afterEach(async () => {
    await stack?.close();
    stack = null;
  });
  const slot = (o: Record<string, unknown>) => ({
    fit: 'cover',
    focus: { x: 50, y: 50 },
    play: 'auto',
    enabled: true,
    ...o,
  });
  async function start(page: Page, edit: (c: PlatformConfig) => void) {
    stack = await startC2Stack(edit, { CONFIG_TTL_MS: '0' });
    await page.addInitScript((u) => {
      (window as { __AIVE_GATEWAY_URL__?: string }).__AIVE_GATEWAY_URL__ = u;
    }, stack.url);
    await page.route('**/c5-media/**', (r) => {
      const name = r.request().url().split('/').pop()!;
      if (name === 'hero.png' || name === 'poster.png')
        return r.fulfill({ body: PNG, contentType: 'image/png' });
      if (name === 'loop.webm')
        return r.fulfill({ body: WEBM, contentType: 'video/webm' });
      return r.fulfill({ status: 404, body: '' });
    });
    allowError(
      page,
      (m) => /401|403|404|Failed to load resource/.test(m),
      'RDC5: the panel reads the connector state before sign-in; the broken picture answers 404 on purpose.',
    );
  }
  async function signUp(page: Page) {
    await page.goto('/site/#/signup');
    await page.locator('#auth-email').fill(`look-${Date.now()}@example.com`);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.locator('#auth-submit').click();
    await expect(page).toHaveURL(/\/panel\//);
  }
  const dress = (c: PlatformConfig) => {
    const style = c.styles[0]!.id;
    const studio = c.studios.find((s) => s.enabled)!.id;
    c.appearance = {
      slots: {
        'hero:credits': slot({ image: '/c5-media/hero.png' }) as never,
        [`style:${style}`]: slot({
          video: '/c5-media/loop.webm',
          poster: '/c5-media/poster.png',
        }) as never,
        [`studio:${studio}`]: slot({ image: '/c5-media/missing.png' }) as never,
        'plan:free': slot({ hide: true }) as never,
      },
    };
    return { style, studio };
  };

  test("[RDC5-020] the owner's picture shows on the Credits hero; a Style card plays its video with the poster; a broken picture falls back to today's drawing; a hidden plan card is not shown; with reduced motion and with data saving only the poster shows", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    let ids = { style: '', studio: '' };
    await start(page, (c) => {
      ids = dress(c);
    });
    await signUp(page);
    await page.goto('/panel/#/credits');
    await expect(
      page.locator('#credit-hero img[data-slot-media="hero:credits"]'),
    ).toBeVisible();
    await expect(page.locator('[data-plan="free"]')).toBeHidden();
    await page.screenshot({ path: `${SHOTS}/panel-credits-slot.png` });
    await page.goto('/panel/#/styles');
    const video = page.locator(
      `[data-style="${ids.style}"] video[data-slot-media="style:${ids.style}"]`,
    );
    await expect(video).toHaveAttribute('poster', '/c5-media/poster.png');
    await expect(video).toHaveJSProperty('muted', true);
    await page.screenshot({ path: `${SHOTS}/panel-style-video.png` });
    await page.goto('/panel/#/studio');
    const studio = page.locator(`[data-studio="${ids.studio}"]`);
    await expect(studio).toHaveAttribute('data-slot', `studio:${ids.studio}`);
    await expect(studio.locator('[data-slot-media]')).toHaveCount(0);
    await expect(studio.locator('.tool-ico')).toBeVisible();
    // Reduced motion: the poster only.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/panel/#/styles');
    await expect(
      page.locator(`[data-style="${ids.style}"] img[data-slot-media]`),
    ).toHaveAttribute('src', '/c5-media/poster.png');
    await expect(page.locator(`[data-style="${ids.style}"] video`)).toHaveCount(
      0,
    );
  });

  test('[RDC5-021] data saving: the Style card shows only its poster; the website shows the same slot', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    let ids = { style: '', studio: '' };
    await start(page, (c) => {
      ids = dress(c);
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true },
      });
    });
    await page.goto('/site/#/styles');
    await expect(
      page.locator(`[data-style="${ids.style}"] img[data-slot-media]`).first(),
    ).toHaveAttribute('src', '/c5-media/poster.png');
  });

  test('[RDC5-022] the crawl: every card, poster, hero and empty state on the panel and website pages is a slot or names why it is not', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await start(page, () => {});
    const check = async (where: string) => {
      await expect
        .poll(
          () =>
            page.evaluate(
              (sel) =>
                [...document.querySelectorAll<HTMLElement>(sel)]
                  .filter((el) => !el.dataset.slot && !el.dataset.slotExempt)
                  .map((el) => el.className),
              SELECTOR,
            ),
          { message: where },
        )
        .toEqual([]);
      const counted = await page.evaluate(
        (sel) => document.querySelectorAll(sel).length,
        SELECTOR,
      );
      return counted;
    };
    let seen = 0;
    for (const h of ['#/', '#/styles', '#/claude']) {
      await page.goto(`/site/${h}`);
      await page.locator('#site-footer, .site-main').first().waitFor();
      seen += await check(`site ${h}`);
    }
    await signUp(page);
    for (const h of [
      '#/home',
      '#/styles',
      '#/studio',
      '#/credits',
      '#/learn',
      '#/assets',
      '#/projects',
    ]) {
      await page.goto(`/panel/${h}`);
      await page.locator('#sign-out').waitFor();
      await page.waitForLoadState('networkidle');
      seen += await check(`panel ${h}`);
    }
    expect(seen).toBeGreaterThan(10);
  });
});
