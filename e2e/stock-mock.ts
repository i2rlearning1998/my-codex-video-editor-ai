// FINAL2: a mocked provider layer for the stock and key tests. No live
// network: every provider host is answered by Playwright from the synthetic
// fixtures in tests/providers/fixtures and the media fixtures.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';
import { allowError } from './fixtures';

export const GOOD_KEY = 'good-key-1234';
export interface StockMock {
  /** ok answers normally; rate answers 429; cors fails every download. */
  mode: 'ok' | 'rate' | 'cors';
  requests: string[];
}
const fixture = (name: string) =>
  readFileSync(path.resolve('tests/providers/fixtures', name), 'utf8');
const media = (name: string) =>
  readFileSync(path.resolve('tests/fixtures/media', name));
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
};

export async function mockStock(
  page: Page,
  initial: Partial<StockMock> = {},
): Promise<StockMock> {
  const state: StockMock = { mode: 'ok', requests: [], ...initial };
  allowError(
    page,
    (m) =>
      /http (401|403|429)|requestfailed: https:\/\/(images|videos)\.pexels|requestfailed: https:\/\/(cdn\.pixabay|api\.iconify|cdn\.freesound)/.test(
        m,
      ) ||
      /Failed to load resource: the server responded with a status of (401|403|429)/.test(
        m,
      ),
    'The mocked providers answer bad keys, rate limits and blocked downloads on purpose.',
  );
  const api = async (route: Route, body: () => string, keyOk: boolean) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors });
    state.requests.push(route.request().url());
    if (!keyOk)
      return route.fulfill({ status: 401, headers: cors, body: '{}' });
    if (state.mode === 'rate')
      return route.fulfill({
        status: 429,
        headers: { ...cors, 'retry-after': '30' },
        body: '{}',
      });
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: body(),
    });
  };
  const bytes = async (route: Route, file: string, mime: string) => {
    if (state.mode === 'cors') return route.abort('failed');
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': mime },
      body: media(file),
    });
  };
  await page.route('https://api.pexels.com/**', (route) =>
    api(
      route,
      () =>
        fixture(
          route.request().url().includes('/videos/')
            ? 'pexels-videos.json'
            : 'pexels-photos.json',
        ),
      route.request().headers()['authorization'] === GOOD_KEY,
    ),
  );
  await page.route('https://pixabay.com/api/**', (route) =>
    api(
      route,
      () =>
        fixture(
          route.request().url().includes('/videos/')
            ? 'pixabay-videos.json'
            : 'pixabay-images.json',
        ),
      new URL(route.request().url()).searchParams.get('key') === GOOD_KEY,
    ),
  );
  await page.route('https://freesound.org/apiv2/**', (route) =>
    api(
      route,
      () => fixture('freesound.json'),
      (route.request().headers()['authorization'] ?? '').includes(GOOD_KEY),
    ),
  );
  await page.route('https://api.iconify.design/search**', (route) =>
    api(route, () => fixture('iconify.json'), true),
  );
  await page.route('https://api.iconify.design/*/*.svg', (route) =>
    bytes(route, 'image_vector_logo.svg', 'image/svg+xml'),
  );
  await page.route(/https:\/\/images\.pexels\.com\/.*/, (route) =>
    bytes(route, 'image_testsrc_1200x800.jpg', 'image/jpeg'),
  );
  await page.route(/https:\/\/cdn\.pixabay\.com\/.*/, (route) =>
    bytes(route, 'image_testsrc_1200x800.jpg', 'image/jpeg'),
  );
  await page.route(
    /https:\/\/(videos\.pexels\.com|player\.vimeo\.com)\/.*/,
    (route) =>
      bytes(route, 'video_testsrc_720p_2s_vp9_opus.webm', 'video/webm'),
  );
  await page.route(/https:\/\/cdn\.freesound\.org\/.*/, (route) =>
    route.request().url().endsWith('.png')
      ? bytes(route, 'image_alpha_logo_512.png', 'image/png')
      : bytes(route, 'audio_tone_440hz_3s.ogg', 'audio/ogg'),
  );
  return state;
}
