// ROUND-C2 Part 1 (RDC2-001): the export-card spike. Claude (an MCP client
// in this process) calls the dev-only proof tool; a chat host (the harness
// page) embeds the card resource in a sandboxed iframe on another origin
// under the host's CSP and talks to it over postMessage (ext-apps
// AppBridge). The card renders on "the person's device" (this browser) and
// reports what worked. The numbers go to reports/round-c2/spike-*.json and
// reports/ROUND-C2-SPIKE.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Frame, Page } from '@playwright/test';
import { test, expect, allowError } from './fixtures';
import {
  ensureCardBuild,
  hostCsp,
  startC2Stack,
  type C2Stack,
} from './round-c2-stack';

let stack: C2Stack | null = null;
test.beforeAll(() => ensureCardBuild());
test.afterEach(async () => {
  await stack?.close();
  stack = null;
});

const OUT = 'reports/round-c2';
const save = (name: string, data: unknown) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
};

/**
 * The card's probes start a worker that the host's CSP refuses (that is
 * what is measured), and a sandboxed frame without allow-same-origin logs
 * its refused storage. Those console lines are the measurement, not a bug.
 */
function allowSpikeNoise(page: Page) {
  allowError(
    page,
    (m) =>
      /Content Security Policy|Refused to (create a worker|load)|worker|probe-worker|SecurityError|opaque origin|sandboxed|blob:|data:video|aive-card-probe|Failed to load resource|ERR_|MEDIA_ERR|Uncaught \(in promise\)/i.test(
        m,
      ),
    'RDC2-001 spike: the card probes a blob worker, a cross-origin worker, OPFS, IndexedDB and a blob: video under the host CSP; the browser logs each refusal it measures.',
  );
}

async function openCard(
  page: Page,
  o: {
    seconds: number;
    sandbox: string;
    downloadFile?: boolean;
    h264?: boolean;
  },
) {
  stack = await startC2Stack((c) => {
    c.mcp.proofTools = true;
  });
  const claude = await stack.claude();
  const tools = await claude.listTools();
  expect(tools.tools.map((t) => t.name)).toContain('proof_export_card');
  const result = await claude.callTool({
    name: 'proof_export_card',
    arguments: { seconds: o.seconds, ...(o.h264 ? { h264: true } : {}) },
  });
  const resource = await claude.readResource({
    uri: 'ui://aive/export-card.html',
  });
  const content = resource.contents[0] as unknown as {
    text: string;
    mimeType: string;
    _meta: {
      ui: { csp: { connectDomains: string[]; resourceDomains: string[] } };
    };
  };
  expect(content.mimeType).toBe('text/html;profile=mcp-app');
  const src = stack.serveCard(content.text, hostCsp(content._meta.ui.csp));
  await page.exposeFunction('__callTool', (params: unknown) =>
    claude.callTool(params as never),
  );
  await page.goto('/e2e/mcp-host/host.html');
  await page.waitForFunction(() => typeof window.startCard === 'function');
  await page.evaluate((a) => window.startCard(a), {
    src,
    sandbox: o.sandbox,
    toolResult: result,
    downloadFile: o.downloadFile ?? true,
    updateModelContext: true,
  });
  const frame = await expect
    .poll(() => page.frames().find((f) => f.url().startsWith(src)) ?? null)
    .not.toBeNull()
    .then(() => page.frames().find((f) => f.url().startsWith(src))!);
  return { frame, claude };
}
const measure = (frame: Frame) =>
  frame.evaluate(
    () =>
      (window as unknown as { __CARD__?: Record<string, unknown> }).__CARD__,
  );
async function finished(frame: Frame, timeout: number) {
  await expect
    .poll(
      async () => {
        const m = await measure(frame);
        return m?.finished === true || typeof m?.error === 'string';
      },
      { timeout, intervals: [1000] },
    )
    .toBe(true);
  return (await measure(frame))!;
}

async function tenSeconds(page: Page, sandbox: string) {
  test.setTimeout(10 * 60_000);
  allowSpikeNoise(page);
  const { frame, claude } = await openCard(page, { seconds: 10, sandbox });
  const m = await finished(frame, 9 * 60_000);
  const host = await page.evaluate(() => window.__host);
  // Item 4: downloads of growing size through the host.
  const downloads: unknown[] = [];
  if (m.finished)
    for (const mb of [1, 10, 50, 100])
      downloads.push({
        mb,
        ...((await frame.evaluate(
          (n) =>
            (
              window as unknown as {
                __CARD_DOWNLOAD__(n: number): Promise<unknown>;
              }
            ).__CARD_DOWNLOAD__(n),
          mb,
        )) as object),
      });
  const frames = await claude.callTool({
    name: 'get_frames',
    arguments: { video_id: 'proof' },
  });
  const images = (frames.content as { type: string }[]).filter(
    (c) => c.type === 'image',
  ).length;
  save(
    `spike-10s-${sandbox.includes('same-origin') ? 'same-origin' : 'scripts-only'}`,
    {
      browser: page.context().browser()?.version(),
      sandbox,
      card: { ...m, progress: (m.progress as unknown[]).length },
      host: {
        calls: host.calls,
        contextUpdates: host.context.length,
        downloads: host.downloads.length,
      },
      downloads,
      framesForClaude: images,
    },
  );
  // What must hold for the decision rule (items 1, 2, 3, 5).
  expect(m.error).toBeUndefined();
  expect(m.webcodecs).toBe(true);
  expect(m.bytes).toBeGreaterThan(10_000);
  expect(['blob', 'data']).toContain(m.player);
  expect(images).toBe(6);
}
test('[RDC2-001] export card spike, 10 s 1080x1920 in an iframe with sandbox="allow-scripts"', async ({
  page,
}) => tenSeconds(page, 'allow-scripts'));
test('[RDC2-001] export card spike, 10 s 1080x1920 in an iframe with sandbox="allow-scripts allow-same-origin"', async ({
  page,
}) => tenSeconds(page, 'allow-scripts allow-same-origin'));

async function longClip(page: Page, seconds: number) {
  test.setTimeout(40 * 60_000);
  allowSpikeNoise(page);
  const { frame } = await openCard(page, {
    seconds,
    sandbox: 'allow-scripts allow-same-origin',
  });
  const m = await finished(frame, 38 * 60_000);
  save(`spike-${seconds}s`, {
    browser: page.context().browser()?.version(),
    card: { ...m, progress: (m.progress as unknown[]).length },
  });
  expect(m.error).toBeUndefined();
  expect(m.bytes).toBeGreaterThan(10_000);
}
test('[RDC2-001] export card spike, 60 s 1080x1920 (sandbox allow-scripts allow-same-origin)', async ({
  page,
}) => longClip(page, 60));
test('[RDC2-001] export card spike, 120 s 1080x1920 (sandbox allow-scripts allow-same-origin)', async ({
  page,
}) => longClip(page, 120));

test('[RDC2-001] export card spike: the 1080p H.264 source loads under the CSP and is decoded or named', async ({
  page,
}) => {
  test.setTimeout(10 * 60_000);
  allowSpikeNoise(page);
  const { frame, claude } = await openCard(page, {
    seconds: 10,
    sandbox: 'allow-scripts allow-same-origin',
    h264: true,
  });
  const m = await finished(frame, 9 * 60_000);
  await expect
    .poll(() => page.evaluate(() => window.__host.calls.length))
    .toBe(2);
  const shot = (
    await claude.callTool({
      name: 'get_frames',
      arguments: { video_id: 'proof' },
    })
  ).content as { type: string; data?: string }[];
  const png = shot.find((c) => c.type === 'image')?.data;
  if (png)
    writeFileSync(`${OUT}/spike-h264-frame.png`, Buffer.from(png, 'base64'));
  const media = await frame.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('/mcp/card/media/'))
      .map((e) => ({
        bytes: (e as PerformanceResourceTiming).decodedBodySize,
        ms: Math.round(e.duration),
      })),
  );
  save('spike-10s-h264-source', {
    browser: page.context().browser()?.version(),
    media,
    renderMs: m.renderMs,
    bytes: m.bytes,
    error: m.error ?? null,
  });
  // The 1080p file (499,480 bytes) arrived through the host's CSP.
  expect(media.some((x) => x.bytes === 499_480)).toBe(true);
});

test('[RDC2-001] export card spike: hidden and scrolled away mid-render, and a host without downloadFile', async ({
  page,
}) => {
  test.setTimeout(15 * 60_000);
  allowSpikeNoise(page);
  const { frame } = await openCard(page, {
    seconds: 60,
    sandbox: 'allow-scripts allow-same-origin',
    downloadFile: false,
  });
  const at = async () =>
    ((await measure(frame))?.progress as { done: number }[] | undefined)?.at(-1)
      ?.done ?? 0;
  await expect.poll(at, { timeout: 5 * 60_000 }).toBeGreaterThan(30);
  const t0 = Date.now();
  const before = await at();
  await page.evaluate(() => {
    (document.querySelector('#card') as HTMLElement).style.display = 'none';
  });
  await page.waitForTimeout(5000); // a fixed hide time is what is measured
  const hiddenDone = (await at()) - before;
  await page.evaluate(() => {
    (document.querySelector('#card') as HTMLElement).style.display = '';
    (document.querySelector('#spacer') as HTMLElement).style.height = '6000px';
    window.scrollTo(0, 5000);
  });
  const beforeScroll = await at();
  await page.waitForTimeout(5000); // a fixed scrolled-away time is what is measured
  const scrolledDone = (await at()) - beforeScroll;
  const m = await finished(frame, 10 * 60_000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await frame.getByRole('button', { name: 'Download' }).click();
  await expect(frame.locator('#status')).toContainText(
    'cannot save files from here',
  );
  save('spike-hidden', {
    framesWhileHidden5s: hiddenDone,
    framesWhileScrolledAway5s: scrolledDone,
    seconds: Math.round((Date.now() - t0) / 1000),
    downloadCapability: m.downloadCapability,
  });
  expect(m.downloadCapability).toBe(false);
});
