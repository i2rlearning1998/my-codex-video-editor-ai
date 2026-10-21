// FINAL2: a mocked provider layer for the stock and key tests. No live
// network: every provider host is answered by Playwright from the synthetic
// fixtures in tests/providers/fixtures and the media fixtures.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';
import { allowError } from './fixtures';

export const GOOD_KEY = 'good-key-1234';
export interface StockMock {
  /** ok answers normally; rate answers 429; cors fails every download;
   *  server answers 503; down fails every search request (FIX1). */
  mode: 'ok' | 'rate' | 'cors' | 'server' | 'down';
  requests: string[];
  /** FIX1 F9: every media download the page asked for. */
  downloads: string[];
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
  const state: StockMock = {
    mode: 'ok',
    requests: [],
    downloads: [],
    ...initial,
  };
  allowError(
    page,
    (m) =>
      /http (401|403|429|503)|status of (401|403|429|503)/.test(m) ||
      /(requestfailed|Failed to load resource).*https:\/\/(pixabay\.com\/(api|get)|api\.pexels|images\.pexels|videos\.pexels|player\.vimeo|cdn\.pixabay|api\.iconify|cdn\.freesound)/.test(
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
    if (state.mode === 'down') return route.abort('internetdisconnected');
    if (state.mode === 'server')
      return route.fulfill({ status: 503, headers: cors, body: '{}' });
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
    state.downloads.push(route.request().url());
    if (state.mode === 'cors') return route.abort('failed');
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': mime },
      body: media(file),
    });
  };
  await page.route('https://api.pexels.com/**', (route) => {
    // FINAL3 A2: the deprecated /videos/... paths (without /v1) answer 404,
    // like the real API's retired routes.
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/videos/'))
      return route.fulfill({ status: 404, headers: cors, body: '{}' });
    return api(
      route,
      () =>
        fixture(
          route.request().url().includes('/videos/')
            ? 'pexels-videos.json'
            : 'pexels-photos.json',
        ),
      route.request().headers()['authorization'] === GOOD_KEY,
    );
  });
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
  // FIX1 F9: a real-shaped Iconify answer for each query: the sticker
  // sets answer ten emoji named after the word (repeated across noto and
  // noto-v1, like the real sets); icons answer the fixture.
  await page.route('https://api.iconify.design/search**', (route) =>
    api(
      route,
      () => {
        const url = new URL(route.request().url());
        const prefixes = url.searchParams.get('prefixes');
        if (!prefixes) return fixture('iconify.json');
        const query = url.searchParams.get('query') ?? 'x';
        const start = Number(url.searchParams.get('start') ?? 0);
        const names = Array.from(
          { length: 10 },
          (_, i) => `${query}-${start + i}`,
        );
        const collection = (spdx: string) => ({
          name: spdx,
          height: 128,
          author: { name: 'Artist', url: 'https://example.org/artist' },
          license: { title: spdx, spdx, url: 'https://example.org/l' },
        });
        return JSON.stringify({
          icons: [
            ...names.map((n) => `noto:${n}`),
            ...names.map((n) => `noto-v1:${n}`),
            'openmoji:shared-alike',
          ],
          total: 32,
          limit: 32,
          start: 0,
          collections: {
            noto: collection('Apache-2.0'),
            'noto-v1': collection('Apache-2.0'),
            openmoji: collection('CC-BY-SA-4.0'),
          },
        });
      },
      true,
    ),
  );
  // Each icon is its own SVG (distinct bytes, like the real service).
  await page.route('https://api.iconify.design/*/*.svg', (route) => {
    const name = new URL(route.request().url()).pathname;
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'image/svg+xml' },
      body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><!-- ${name} --><path fill="currentColor" d="M2 2h20v20H2z"/></svg>`,
    });
  });
  await page.route(/https:\/\/images\.pexels\.com\/.*/, (route) =>
    bytes(route, 'image_testsrc_1200x800.jpg', 'image/jpeg'),
  );
  await page.route(/https:\/\/pixabay\.com\/get\/.*/, (route) =>
    bytes(route, 'image_testsrc_1200x800.jpg', 'image/jpeg'),
  );
  await page.route(/https:\/\/cdn\.pixabay\.com\/.*/, (route) =>
    route.request().url().includes('.mp4')
      ? bytes(route, 'video_testsrc_720p_2s_vp9_opus.webm', 'video/webm')
      : bytes(route, 'image_testsrc_1200x800.jpg', 'image/jpeg'),
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
