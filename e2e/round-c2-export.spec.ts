// ROUND-C2 Part 4 (RDC2-021, RDC2-022): export inside the chat. Claude (the
// MCP client) builds and approves a video, export_video shows the card in
// the harness host (sandboxed iframe, host CSP); the card renders on this
// device, plays the file, offers Download through the host, shows the
// credits line, counts the export once even when opened twice, and sends
// six frames back for get_frames.
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
const plan = {
  format: 'video-plan',
  version: 4,
  meta: { title: 'Shadows', language: 'en', aspect: '9:16', fps: 30 },
  captions: { enabled: false },
  scenes: [
    {
      id: 'one',
      title: 'Question',
      narration: 'Why are shadows longest in the morning?',
      durationHint: 3,
      layers: [
        {
          id: 't1',
          kind: 'title',
          text: 'Why are shadows long?',
          anchor: 'center',
        },
      ],
    },
    {
      id: 'two',
      title: 'Answer',
      narration: 'Because the Sun is low.',
      durationHint: 3,
      layers: [
        { id: 't2', kind: 'text', text: 'The Sun is low', anchor: 'center' },
      ],
    },
  ],
};
const text = (r: unknown) =>
  ((r as { content: unknown }).content as { type: string; text?: string }[])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

test('[RDC2-021] export_video renders on the device inside the chat card, plays, downloads through the host and shows the credits line; opened twice it is counted once', async ({
  page,
}) => {
  test.setTimeout(6 * 60_000);
  allowError(
    page,
    (m) => /Content Security Policy|blob:|Failed to load resource/i.test(m),
    'RDC2-021: the card first tries a blob: URL for the player; the host CSP refuses it and the card uses a data: URL (ROUND-C2-SPIKE.md item 5).',
  );
  stack = await startC2Stack();
  const claude = await stack.claude();
  const call = async (name: string, args: Record<string, unknown>) =>
    claude.callTool({ name, arguments: args });
  const p = text(await call('create_project', { name: 'Light' }));
  const projectId = /project_id (proj-[0-9a-f-]+)/.exec(p)![1]!;
  const v = text(
    await call('create_video', { project_id: projectId, name: 'Shadows' }),
  );
  const videoId = /video_id ([0-9a-f-]{36})/.exec(v)![1]!;
  expect(text(await call('submit_plan', { video_id: videoId, plan }))).toMatch(
    /^Built 2 scenes/,
  );
  // Export before approval is refused in one sentence.
  expect(text(await call('export_video', { video_id: videoId }))).toMatch(
    /^Approve the plan first/,
  );
  await call('get_plan_cost', { video_id: videoId });
  expect(text(await call('approve_plan', { video_id: videoId }))).toMatch(
    /^Approved/,
  );
  const result = await call('export_video', { video_id: videoId });
  expect(text(result)).toMatch(
    /^The export card is shown: the 6.2 s video renders on the person's device/,
  );
  const frame = await mountCard(page, stack, claude, result);
  await expect(frame.getByRole('button', { name: 'Download' })).toBeVisible({
    timeout: 4 * 60_000,
  });
  await expect(frame.locator('video')).toHaveCount(1);
  await expect
    .poll(() =>
      frame.locator('video').evaluate((el: HTMLVideoElement) => el.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await expect(frame.locator('#card')).toContainText(
    'Credits: everything in this video is your own or made here.',
  );
  await frame.getByRole('button', { name: 'Download' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__host.downloads.length))
    .toBe(1);
  expect(await page.evaluate(() => window.__host.downloads[0]!.name)).toMatch(
    /^file:\/\/\/Shadows\.(webm|mp4)$/,
  );
  await expect
    .poll(() => page.evaluate(() => window.__host.calls))
    .toEqual(['export_done', 'submit_frames']);
  const month = new Date().toISOString().slice(0, 7);
  const user = '00000000-0000-4000-8000-00000000d0e1';
  expect(await stack.store.exportsCount(user, month)).toBe(1);
  // Claude looks at its own work.
  const frames = await call('get_frames', { video_id: videoId });
  expect(
    (frames.content as { type: string }[]).filter((c) => c.type === 'image'),
  ).toHaveLength(6);
  // The same card opened a second time: rendered again, counted once.
  const second = await mountCard(page, stack, claude, result, {
    exposed: true,
  });
  await expect(second.getByRole('button', { name: 'Download' })).toBeVisible({
    timeout: 4 * 60_000,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__host.calls.filter((c) => c === 'export_done').length,
      ),
    )
    .toBe(2);
  expect(await stack.store.exportsCount(user, month)).toBe(1);
});

test('[RDC2-022] export limits: a video past mcp.exportMaxSeconds, a cancelled render and an ended ticket each get one plain sentence and nothing is counted', async ({
  page,
}) => {
  test.setTimeout(4 * 60_000);
  allowError(
    page,
    (m) => /Content Security Policy|blob:|Failed to load resource|404/i.test(m),
    'RDC2-022: the ended ticket answers 404 on purpose; the player tries blob: before data:.',
  );
  stack = await startC2Stack((c) => {
    c.mcp.exportMaxSeconds = 5;
  });
  const claude = await stack.claude();
  const call = async (name: string, args: Record<string, unknown>) =>
    claude.callTool({ name, arguments: args });
  const p = text(await call('create_project', { name: 'Light' }));
  const projectId = /project_id (proj-[0-9a-f-]+)/.exec(p)![1]!;
  const v = text(
    await call('create_video', { project_id: projectId, name: 'Long' }),
  );
  const videoId = /video_id ([0-9a-f-]{36})/.exec(v)![1]!;
  expect(text(await call('submit_plan', { video_id: videoId, plan }))).toMatch(
    /^Built/,
  );
  expect(text(await call('get_plan_cost', { video_id: videoId }))).toMatch(
    /^Approving/,
  );
  expect(text(await call('approve_plan', { video_id: videoId }))).toMatch(
    /^Approved/,
  );
  const long = await call('export_video', { video_id: videoId });
  expect(long.isError).toBe(true);
  expect(text(long)).toBe(
    "This video is 6.2 s long; the chat export makes videos up to 5 s. Options: shorten it with edit_video (remove or retime scenes), or the person opens it in the panel's editor and exports there.",
  );
  // Shorten with an edit, then export and cancel mid-render.
  await call('read_video', { video_id: videoId });
  expect(
    text(
      await call('edit_video', {
        video_id: videoId,
        ops: [{ op: 'remove_scene', scene: 2 }],
      }),
    ),
  ).toMatch(/^Done as one step/);
  const result = await call('export_video', { video_id: videoId });
  expect(result.isError).toBeFalsy();
  const frame = await mountCard(page, stack, claude, result);
  const cancel = frame.getByRole('button', { name: 'Cancel' });
  await cancel.click({ timeout: 60_000 });
  await expect(frame.locator('#status')).toHaveText(
    'Export cancelled. Nothing was counted.',
  );
  expect(
    await stack.store.exportsCount(
      '00000000-0000-4000-8000-00000000d0e1',
      new Date().toISOString().slice(0, 7),
    ),
  ).toBe(0);
  // A ticket that no longer exists (Claude disconnected and the server restarted).
  const ended = JSON.parse(JSON.stringify(result));
  ended._meta['aive/export'].ticket =
    'aaaaaaaa-0000-4000-8000-000000000000.9999999999999.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const gone = await mountCard(page, stack, claude, ended, { exposed: true });
  await expect(gone.locator('#status')).toHaveText(
    'This export has ended. Ask Claude to export the video again.',
  );
});
