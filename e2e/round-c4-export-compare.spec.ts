// ROUND-C4 Part 0.4 (RDC4-004): card export versus editor export, MEASURED.
// One short video with a Tier B block and a Tier C free-code scene, made by
// Claude through the connector, is exported once through the chat card and
// once through the editor's own Export dialog. The same 5 moments of both
// files are decoded in the browser, scaled to the same size and compared:
// the mean absolute difference per channel and the share of pixels that
// differ by more than 8. The numbers are written to the test output and to
// reports/round-c4/export-compare.json either way.
//
// ROUND-C5 (0.1): the C4 measurement was a bug (RDC4-004, test.fail). A
// per-frame sweep of all 96 frames showed the card and the editor agreeing
// everywhere except a 0.5 s window around the scene cut (frames 42 to 53,
// up to 12.8/255 and 24% of pixels over 8, best match two frames earlier
// before the cut and two later after it). Cause: the chat export job gave the
// shared render job neither the scene cuts nor the scenes' own backgrounds,
// so the card cut hard where the editor faded. The job now carries both
// (server/mcp/tools.ts, src/mcp-card/card.ts). The editor is exported at
// the card's size (720p) so only the export path differs. Numbers:
// reports/round-c5/export-compare.json.
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test, expect, allowError, hook } from './fixtures';
import { signUp } from './p2-helpers';
import {
  ensureCardBuild,
  mountCard,
  startC2Stack,
  type C2Stack,
} from './round-c2-stack';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
let stack: C2Stack | null = null;
test.beforeAll(() => ensureCardBuild());
test.afterEach(async () => {
  await stack?.close();
  stack = null;
});
const BARS = readFileSync('tests/fixtures/round-c1/bar-rise.block.js', 'utf8');
const ORBIT = readFileSync(
  'tests/fixtures/round-c1/orbit-ring.free.js',
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
  ],
};
const text = (r: unknown) =>
  (r as { content: { text?: string }[] }).content[0]?.text ?? '';
/** The moments compared (seconds into the 4 s video). */
const MOMENTS = [0.5, 1.2, 1.9, 2.6, 3.4];

test('[RDC4-004] [RDC5-001] the chat card and the editor export the same Claude video (Tier B block + Tier C scene, a scene cut): every frame decoded, compared and reported', async ({
  page,
}, testInfo) => {
  test.setTimeout(10 * 60_000);
  stack = await startC2Stack();
  const url = stack.url;
  await page.addInitScript((u) => {
    (window as { __AIVE_GATEWAY_URL__?: string }).__AIVE_GATEWAY_URL__ = u;
  }, url);
  await page.route('https://claude.ai/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }),
  );
  allowError(
    page,
    (m) =>
      /401|404|Failed to load resource|Content Security Policy|blob:|sandboxed|Blocked/i.test(
        m,
      ),
    'RDC4-004: the panel reads the connector state before sign-in; the card tries a blob: player first and the sandbox refuses what it should.',
  );
  // The person signs up and connects Claude (the real OAuth steps).
  await signUp(page);
  const reg = (await (
    await fetch(`${url}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Claude',
        redirect_uris: [CALLBACK],
      }),
    })
  ).json()) as { client_id: string };
  const verifier = randomBytes(32).toString('base64url');
  const auth = await fetch(
    `${url}/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: CALLBACK,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state: 'c4',
    })}`,
    { redirect: 'manual' },
  );
  await page.goto(
    auth.headers.get('location')!.replace(/^https?:\/\/[^/]+/, ''),
  );
  await page.locator('#claude-allow').click();
  await expect(page).toHaveURL(/code=/);
  const tok = (await (
    await fetch(`${url}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: new URL(page.url()).searchParams.get('code')!,
        redirect_uri: CALLBACK,
        client_id: reg.client_id,
        code_verifier: verifier,
      }),
    })
  ).json()) as { access_token: string };
  const claude = await stack.claude(tok.access_token);
  const call = async (name: string, args: Record<string, unknown>) =>
    claude.callTool({ name, arguments: args });
  const p = text(await call('create_project', { name: 'Compare' }));
  const projectId = /project_id (proj-[0-9a-f-]+)/.exec(p)![1]!;
  const v = text(
    await call('create_video', { project_id: projectId, name: 'Compare' }),
  );
  const videoId = /video_id ([0-9a-f-]{36})/.exec(v)![1]!;
  const scene = (id: string, block: string) => ({
    id,
    title: id,
    narration: 'A graphic.',
    durationHint: 2,
    layers: [{ id: `${id}-g`, kind: 'block', block, name: 'Graphic' }],
  });
  expect(
    text(
      await call('submit_plan', {
        video_id: videoId,
        plan: {
          format: 'video-plan',
          version: 4,
          meta: { title: 'Compare', language: 'en', aspect: '9:16', fps: 24 },
          captions: { enabled: false },
          defs: {
            blocks: [
              { id: 'bar-rise', tier: 'B', source: BARS, summary: 'Bars.' },
              {
                id: 'orbit-ring',
                tier: 'C',
                source: ORBIT,
                meta: ORBIT_META,
                summary: 'Dots.',
              },
            ],
          },
          scenes: [scene('bars', 'bar-rise'), scene('orbit', 'orbit-ring')],
        },
      }),
    ),
  ).toMatch(/^Built/);
  await call('get_plan_cost', { video_id: videoId });
  await call('approve_plan', { video_id: videoId });

  // 1. The chat card, on its own page (the host harness).
  const host = page;
  const result = await call('export_video', { video_id: videoId });
  const frame = await mountCard(host, stack, claude, result);
  await expect(frame.getByRole('button', { name: 'Download' })).toBeVisible({
    timeout: 6 * 60_000,
  });
  await frame.getByRole('button', { name: 'Download' }).click();
  await expect
    .poll(() => host.evaluate(() => window.__host.downloads.length))
    .toBe(1);
  const cardFile = await host.evaluate(
    () => window.__host.downloads[0]!.blob ?? '',
  );
  expect(cardFile.length).toBeGreaterThan(1000);

  // 2. The editor's own export of the same saved video.
  await page.goto('/panel/#/projects');
  await expect(page.locator(`[data-ws-project="${projectId}"]`)).toBeVisible({
    timeout: 30_000,
  });
  await page.evaluate(() => localStorage.setItem('aive.e2e.noAutoLogin', '1'));
  await page.goto(`/?open=${encodeURIComponent(videoId)}`);
  await expect.poll(async () => (await hook(page)).project.id).toBe(videoId);
  await page.locator('#export').click();
  const dialog = page.locator('.modal-dialog');
  await expect(dialog.locator('#export-form')).toBeVisible();
  await expect(dialog.locator('#export-format')).not.toHaveText(/Checking/);
  // The card's output size (the plan's height limit): compare paths, not scaling.
  await dialog.locator('#export-resolution').selectOption('720');
  const downloading = page.waitForEvent('download', { timeout: 6 * 60_000 });
  await dialog.locator('#export-start-button').click();
  const download = await downloading;
  const editorPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(editorPath);
  const editorFile = readFileSync(editorPath).toString('base64');

  // 3. Decode the same 5 moments of both and compare at one size.
  const numbers = await host.evaluate(
    async ({ a, b, moments }) => {
      const W = 180,
        H = 320;
      const open = async (data: string, type: string) => {
        const v = document.createElement('video');
        v.muted = true;
        v.src = `data:${type};base64,${data}`;
        await new Promise((r, x) => {
          v.onloadeddata = r;
          v.onerror = () => x(new Error('decode'));
        });
        return v;
      };
      const grab = async (v: HTMLVideoElement, t: number) => {
        await new Promise((r) => {
          v.onseeked = r;
          v.currentTime = t;
        });
        const c = new OffscreenCanvas(W, H);
        const g = c.getContext('2d')!;
        g.drawImage(v, 0, 0, W, H);
        return g.getImageData(0, 0, W, H).data;
      };
      const va = await open(a, 'video/webm');
      const vb = await open(b, 'video/webm');
      const diff = (x: Uint8ClampedArray, y: Uint8ClampedArray) => {
        let sum = 0,
          over = 0,
          max = 0,
          n = 0;
        for (let i = 0; i < x.length; i += 4) {
          let pixelMax = 0;
          for (let k = 0; k < 3; k++) {
            const d = Math.abs(x[i + k]! - y[i + k]!);
            sum += d;
            n++;
            pixelMax = Math.max(pixelMax, d);
          }
          max = Math.max(max, pixelMax);
          if (pixelMax > 8) over++;
        }
        return {
          mean: sum / n,
          largest: max,
          overShare: over / (x.length / 4),
        };
      };
      const info = {
        card: { w: va.videoWidth, h: va.videoHeight, duration: va.duration },
        editor: {
          w: vb.videoWidth,
          h: vb.videoHeight,
          duration: vb.duration,
        },
      };
      const frames = [];
      // Every frame of the video, read at its centre ((i + 0.5) / fps).
      const fps = 24;
      const count = Math.floor(Math.min(va.duration, vb.duration) * fps);
      const editorFrames: Uint8ClampedArray[] = [];
      for (let i = 0; i < count; i++)
        editorFrames.push(await grab(vb, (i + 0.5) / fps));
      for (let i = 0; i < count; i++) {
        const x = await grab(va, (i + 0.5) / fps);
        const same = diff(x, editorFrames[i]!);
        // The nearest editor frame, to see an offset in time.
        let best = { offset: 0, mean: same.mean };
        for (const o of [-2, -1, 1, 2]) {
          const y = editorFrames[i + o];
          if (!y) continue;
          const m = diff(x, y).mean;
          if (m < best.mean) best = { offset: o, mean: m };
        }
        frames.push({
          frame: i,
          t: (i + 0.5) / fps,
          ...same,
          bestOffset: best.offset,
        });
      }
      void moments;
      return { info, frames };
    },
    { a: cardFile, b: editorFile, moments: MOMENTS },
  );
  const out = {
    measuredAt: new Date().toISOString(),
    browser: 'Playwright Chromium (Linux sandbox)',
    size: '180 x 320 (both files scaled to it before comparing)',
    rule: 'pass: mean < 1.5 of 255 per channel and no frame with more than 0.5% of pixels differing by more than 8',
    files: numbers.info,
    frames: numbers.frames,
  };
  mkdirSync('reports/round-c5', { recursive: true });
  writeFileSync(
    'reports/round-c5/export-compare.json',
    `${JSON.stringify(out, null, 2)}\n`,
  );
  await testInfo.attach('export-compare.json', {
    body: JSON.stringify(out, null, 2),
    contentType: 'application/json',
  });
  for (const f of numbers.frames) {
    expect(f.mean, `mean at frame ${f.frame}`).toBeLessThan(1.5);
    expect(
      f.overShare,
      `pixels over 8 at frame ${f.frame}`,
    ).toBeLessThanOrEqual(0.005);
  }
});
