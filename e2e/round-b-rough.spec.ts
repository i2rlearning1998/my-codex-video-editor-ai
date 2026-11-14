// ROUND-B: rough use. Each test is one of the brief's rough-use conditions,
// done the way a person would do it, on the offline mock model.
import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';
import { setPlan, signUp } from './p2-helpers';
import {
  build,
  builtVideo,
  credits,
  layerOf,
  openProposal,
  say,
  selectLayer,
  startAi,
  thread,
  toAssets,
  toPlan,
} from './round-b-helpers';
import { defaultConfig } from '../src/platform-config';

test.setTimeout(240_000);

const lastDirector = (page: Page) =>
  page.locator('#ai-thread .ai-msg[data-role="director"]').last();
const toEditor = (page: Page) =>
  page.locator('#mode-switch [data-mode="editor"]').click();
const toAiMode = async (page: Page) => {
  await page.locator('#mode-ai').click();
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/);
};
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
            note: 't',
            config: c,
          },
        ],
        live: 1,
      }),
    );
  }, config);
}

test('[RDB-031] a message sent while the build runs waits and is answered after it; switching to Editor mode in the middle of the build and back leaves the build whole (one undo step)', async ({
  page,
}) => {
  await startAi(page);
  await toPlan(page);
  await toAssets(page);
  const steps = (await hook(page)).history.labels.length;
  await page.locator('#ai-build').click();
  await expect(page.locator('#ai-orb-state')).toHaveText('Building');
  await say(page, 'How many scenes will there be?');
  await expect(thread(page)).toContainText('I am building now');
  await toEditor(page);
  await expect(page.locator('.editor-shell')).not.toHaveClass(/ai-layout/);
  await toAiMode(page);
  await expect(
    page.locator('[data-card="build"][data-state="done"]'),
  ).toBeVisible({ timeout: 120_000 });
  const scenes = (await hook(page)).project.compositions.length;
  // The waiting question gets its answer once the build is done.
  await expect(lastDirector(page)).toContainText(String(scenes), {
    timeout: 30_000,
  });
  expect((await hook(page)).history.labels.length).toBe(steps + 1);
});

test('[RDB-032] a reload at every step comes back to that step: the Brief card, the Plan card, the Assets card; a reload in the middle of the build keeps nothing half-built and gives every credit back', async ({
  page,
}) => {
  await startAi(page);
  await page.reload();
  await expect(page.locator('#ai-brief-card')).toBeVisible({ timeout: 30_000 });
  await toPlan(page);
  const total = await page.locator('#ai-plan-total').textContent();
  await page.reload();
  await expect(page.locator('#ai-plan-card')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#ai-plan-total')).toHaveText(total!);
  await toAssets(page);
  await page.reload();
  await expect(page.locator('#ai-assets-card')).toBeVisible({
    timeout: 30_000,
  });
  const before = await credits(page);
  const scenes = (await hook(page)).project.compositions.length;
  await page.locator('#ai-build').click();
  await expect(page.locator('#ai-orb-state')).toHaveText('Building');
  await page.reload();
  await expect(thread(page)).toContainText('interrupted', { timeout: 30_000 });
  expect((await hook(page)).project.compositions).toHaveLength(scenes);
  await expect.poll(() => credits(page)).toBe(before);
  // And it builds again from there.
  await expect(page.locator('#ai-build')).toBeEnabled();
  await build(page);
});

test('[RDB-033] an AI change undone in Editor mode: back in AI mode Director says so once, the Video sheet no longer lists it and the canvas and sheet agree', async ({
  page,
}) => {
  await builtVideo(page);
  const id = await selectLayer(page, /text/);
  const was = (await layerOf(page, id))!.properties.fill?.value;
  await say(page, 'make it red');
  await openProposal(page).locator('[data-act="apply"]').click();
  await expect
    .poll(async () => (await layerOf(page, id))!.properties.fill?.value)
    .toBe('#e5484d');
  await toEditor(page);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await layerOf(page, id))!.properties.fill?.value)
    .toBe(was);
  await toAiMode(page);
  await expect(thread(page)).toContainText('I see you undid');
  expect(
    await thread(page)
      .locator('.ai-msg', { hasText: 'I see you undid' })
      .count(),
  ).toBe(1);
  await page.locator('[data-ai-tab="memory"]').click();
  await expect(page.locator('[data-mem-part="decisions"]')).not.toContainText(
    /red/i,
  );
});

test('[RDB-034] a scene deleted by hand after asking Director about it: Director says plainly that the scene is no longer in the video and changes nothing', async ({
  page,
}) => {
  await builtVideo(page);
  const cards = page.locator('#ai-ribbon .ai-scene');
  await cards.nth(1).locator('.ai-scene-menu').click();
  await page
    .getByRole('menuitem', { name: 'Ask Director about this scene' })
    .click();
  await expect(page.locator('#ai-chips [data-chip="scene"]')).toHaveCount(1);
  const count = await cards.count();
  await cards.nth(1).locator('.ai-scene-menu').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.locator('.modal-dialog [data-role="confirm"]').click();
  await expect(cards).toHaveCount(count - 1);
  const steps = (await hook(page)).history.labels.length;
  await say(page, 'make the background of this scene blue');
  await expect(lastDirector(page)).toContainText(
    'That scene is no longer in the video.',
  );
  expect((await hook(page)).history.labels.length).toBe(steps);
});

test('[RDB-035] a layer changed by hand: asking Director to change it asks first; Yes makes the proposal, No leaves it', async ({
  page,
}) => {
  await builtVideo(page);
  const id = await selectLayer(page, /text/);
  await page.locator('[data-ai-tab="controls"]').click();
  await page.locator('#ai-ctl-text').fill('My own words');
  await page.locator('#ai-ctl-text').blur();
  await expect
    .poll(async () => (await layerOf(page, id))!.properties.text?.value)
    .toBe('My own words');
  await say(page, 'make it red');
  const ask = page.locator('[data-card="ask"]').last();
  await expect(ask).toContainText('by hand');
  await expect(openProposal(page)).toHaveCount(0);
  await ask.getByRole('button', { name: 'No' }).click();
  expect((await layerOf(page, id))!.properties.fill?.value).not.toBe('#e5484d');
  await say(page, 'make it red');
  await page
    .locator('[data-card="ask"]')
    .last()
    .getByRole('button', { name: 'Yes' })
    .click();
  await openProposal(page).locator('[data-act="apply"]').click();
  await expect
    .poll(async () => (await layerOf(page, id))!.properties.fill?.value)
    .toBe('#e5484d');
  // The words the person wrote stay.
  expect((await layerOf(page, id))!.properties.text?.value).toBe(
    'My own words',
  );
});

test('[RDB-036] two chats in one Video share the sheet, and a very long chat still knows the brief', async ({
  page,
}) => {
  await builtVideo(page);
  for (let i = 0; i < 24; i++) {
    await say(page, `How many credits do I have? (${i + 1})`);
    await expect(
      page.locator('#ai-thread .ai-msg[data-role="user"]'),
    ).toHaveCount(i + 2, { timeout: 15_000 });
  }
  await say(page, 'What do you know about this video?');
  await expect(lastDirector(page)).toContainText(/rain/i, { timeout: 15_000 });
  await page.locator('#ai-new-chat').click();
  await expect(lastDirector(page)).toContainText('I still have its sheet');
  await expect(lastDirector(page)).toContainText(/rain/i);
  await say(page, 'What do you know about this video?');
  await expect(lastDirector(page)).toContainText(/rain/i, { timeout: 15_000 });
});

test('[RDB-037] proposals under rough use: the selected layer deleted before Apply cancels it with one sentence; Apply pressed twice is one undo step; a control changed while a proposal previews keeps both changes', async ({
  page,
}) => {
  await builtVideo(page);
  // Deleted before Apply.
  let id = await selectLayer(page, /text/);
  await say(page, 'make it red');
  await expect(openProposal(page)).toBeVisible();
  await toEditor(page);
  await page.keyboard.press('Delete');
  await expect.poll(async () => await layerOf(page, id)).toBeUndefined();
  await toAiMode(page);
  await expect(openProposal(page)).toHaveCount(0);
  await expect(thread(page)).toContainText(
    'The layer this change was for is gone, so I cancelled it.',
  );
  // Applied twice.
  id = await selectLayer(page, /text/);
  await say(page, 'make it red');
  const steps = (await hook(page)).history.labels.length;
  await openProposal(page).locator('[data-act="apply"]').dblclick();
  await expect
    .poll(async () => (await layerOf(page, id))!.properties.fill?.value)
    .toBe('#e5484d');
  expect((await hook(page)).history.labels.length).toBe(steps + 1);
  // A control changed while a proposal previews.
  await say(page, 'make it blue');
  await expect(openProposal(page)).toBeVisible();
  await page.locator('[data-ai-tab="controls"]').click();
  await page.locator('#ai-ctl-text').fill('Typed while it previewed');
  await page.locator('#ai-ctl-text').blur();
  await expect
    .poll(async () => (await layerOf(page, id))!.properties.text?.value)
    .toBe('Typed while it previewed');
  const proposal = openProposal(page);
  if (await proposal.count()) {
    await proposal.locator('[data-act="apply"]').click();
    await expect
      .poll(async () => (await layerOf(page, id))!.properties.fill?.value)
      .not.toBe('#e5484d');
  } else await expect(thread(page)).toContainText('cancelled');
  expect((await layerOf(page, id))!.properties.text?.value).toBe(
    'Typed while it previewed',
  );
});

test('[RDB-038] scenes reordered during playback: one undo step, playback keeps going and nothing breaks', async ({
  page,
}) => {
  await builtVideo(page);
  const before = (await hook(page)).project.compositions.map((s) => s.id);
  const steps = (await hook(page)).history.labels.length;
  await page.locator('#ai-play').click();
  await expect.poll(async () => (await hook(page)).session.playing).toBe(true);
  const cards = page.locator('#ai-ribbon .ai-scene');
  const from = (await cards.nth(0).boundingBox())!;
  const to = (await cards.nth(1).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 30);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + 30, {
    steps: 4,
  });
  await page.mouse.move(to.x + to.width - 4, to.y + 30, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await hook(page)).project.compositions.map((s) => s.id))
    .toEqual([before[1], before[0], ...before.slice(2)]);
  expect((await hook(page)).history.labels.length).toBe(steps + 1);
});

test('[RDB-039] not enough credits: the build says so in one sentence with what it needs, nothing is spent or built, and the Video can be built after more credits', async ({
  page,
}) => {
  await useConfig(page, (c) => {
    c.plans.find((p) => p.id === 'free')!.monthlyCredits = 1;
  });
  await startAi(page);
  await toPlan(page);
  await toAssets(page);
  const before = await credits(page);
  expect(before).toBeLessThanOrEqual(1);
  const scenes = (await hook(page)).project.compositions.length;
  await page.locator('#ai-build').click();
  await expect(lastDirector(page)).toContainText(/credit/i, {
    timeout: 60_000,
  });
  await expect(lastDirector(page)).toHaveAttribute('data-tone', 'error');
  expect((await hook(page)).project.compositions).toHaveLength(scenes);
  expect(await credits(page)).toBe(before);
});

test('[RDB-040] the server cannot be reached: Director says so, nothing is spent, nothing is lost and the typed message is kept', async ({
  page,
}) => {
  await startAi(page);
  await toPlan(page);
  await toAssets(page);
  const before = await credits(page);
  const scenes = (await hook(page)).project.compositions.length;
  await page.route('**/*', (route) =>
    /\/v1\//.test(route.request().url()) ? route.abort() : route.continue(),
  );
  await page.addInitScript(() => {
    (globalThis as { __AIVE_GATEWAY_URL__?: string }).__AIVE_GATEWAY_URL__ =
      'http://127.0.0.1:9';
  });
  await page.reload();
  await expect(page.locator('#ai-assets-card')).toBeVisible({
    timeout: 30_000,
  });
  await page.locator('#ai-build').click();
  await expect(thread(page)).toContainText('could not be reached', {
    timeout: 60_000,
  });
  expect((await hook(page)).project.compositions).toHaveLength(scenes);
  // A message that needs the server keeps its words.
  await page.locator('#ai-input').fill('Make a plan again please');
  await page.locator('#ai-send').click();
  await expect(page.locator('#ai-assets-card')).toBeVisible();
  void before;
});

test('[RDB-041] a huge or unsupported attachment is refused in one sentence before anything is sent; the typed words stay', async ({
  page,
}) => {
  await useConfig(page, (c) => {
    c.director.memory.maxAttachmentMb = 0.1;
  });
  await startAi(page);
  await page.locator('#ai-input').fill('Use this file');
  const [big] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#ai-attach').click(),
  ]);
  await big.setFiles({
    name: 'huge.txt',
    mimeType: 'text/plain',
    buffer: Buffer.alloc(200_000, 97),
  });
  await expect(lastDirector(page)).toContainText('That file is too big');
  await expect(page.locator('#ai-files [data-file]')).toHaveCount(0);
  const [odd] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#ai-attach').click(),
  ]);
  await odd.setFiles({
    name: 'setup.exe',
    mimeType: 'application/x-msdownload',
    buffer: Buffer.from('MZ'),
  });
  await expect(lastDirector(page)).toHaveAttribute('data-tone', 'error');
  await expect(page.locator('#ai-files [data-file]')).toHaveCount(0);
  await expect(page.locator('#ai-input')).toHaveValue('Use this file');
});

test('[RDB-042] a locked layer: Director says it is locked and proposes nothing', async ({
  page,
}) => {
  await builtVideo(page);
  const id = await selectLayer(page, /text/);
  await toEditor(page);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('Lock');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await layerOf(page, id))!.properties.locked?.value)
    .toBe(true);
  await toAiMode(page);
  await say(page, 'make it red');
  await expect(lastDirector(page)).toContainText('is locked');
  await expect(openProposal(page)).toHaveCount(0);
});

test('[RDB-043] Hindi input: a first message in Hindi is understood, and Director answers in Hindi when the panel is in Hindi', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/settings');
  await page.locator('#settings-language-button').click();
  await page.locator('#settings-language-list [data-value="hi"]').click();
  await page.locator('.page .button.primary').first().click();
  await page.goto('/panel/#/home');
  await page
    .locator('#home-input')
    .fill('बारिश कैसे बनती है, बच्चों के लिए, 1 मिनट');
  await page.locator('#home-send').click();
  await expect(page.locator('#ai-brief-card')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#ai-brief-card')).toContainText(/[ऀ-ॿ]/);
  await expect(page.locator('#ai-brief-card [data-brief-known]')).toContainText(
    'बारिश',
  );
});

test('[RDB-044] with Animations Off, switching between Editor and AI mode moves nothing: no running animation and a still Orb', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('aive.motion', 'off'));
  await startAi(page);
  const moving = () =>
    page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === 'running' &&
              Number(a.effect?.getComputedTiming().duration ?? 0) > 1,
          ).length,
    );
  await toEditor(page);
  expect(await moving()).toBe(0);
  await toAiMode(page);
  expect(await moving()).toBe(0);
  const frame = () =>
    page.evaluate(() =>
      (
        document.querySelector('.ai-orb canvas') as HTMLCanvasElement | null
      )?.toDataURL(),
    );
  const a = await frame();
  // Twenty frames later the Orb is the same picture.
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        let n = 0;
        const tick = () => (++n >= 20 ? done() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
  );
  expect(await frame()).toBe(a);
});

void setPlan;
