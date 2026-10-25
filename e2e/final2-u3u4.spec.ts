import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, seekKeep } from './fixtures';

// FINAL2 U3 (Voice-over) and U4 (camera and screen recording) in the left
// Record & create panel. The voice-over runs on the dev/test-only fake
// speech engine (`__AIVE_E2E_SPEECH__`: a real WAV per text); the camera
// and microphone are Chromium's fake devices (playwright.config.ts); the
// screen is a stand-in canvas stream, because headless Chromium has no
// screen picker (a stub of the browser API, not of the editor).
test.use({ viewport: { width: 1920, height: 1080 } });
test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as { __AIVE_E2E_SPEECH__?: boolean }).__AIVE_E2E_SPEECH__ = true;
    let refuse = false;
    (
      window as unknown as { __refuseScreen: (v: boolean) => void }
    ).__refuseScreen = (value) => {
      refuse = value;
    };
    navigator.mediaDevices.getDisplayMedia = async () => {
      if (refuse) throw new DOMException('Denied', 'NotAllowedError');
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const g = canvas.getContext('2d')!;
      let frame = 0;
      const paint = () => {
        g.fillStyle = `hsl(${(frame++ * 12) % 360} 60% 50%)`;
        g.fillRect(0, 0, 640, 360);
      };
      paint();
      setInterval(paint, 40);
      return canvas.captureStream(25);
    };
  });
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
});

const panel = (page: Page) => page.locator('#library-record');
const scene = async (page: Page) => (await hook(page)).project.compositions[0]!;
const assets = async (page: Page) =>
  (await hook(page)).project.assets as unknown as {
    id: string;
    type: string;
    name: string;
    width?: number;
    metadata: Record<string, unknown>;
  }[];

test('[F2-010][F2-011] Voice-over: type, Preview, Save to Media (the WAV is in Media with its speech details), Add to timeline at the playhead; an engine without a key and Hindi without a paid voice offer Settings', async ({
  page,
}) => {
  await showCategory(page, 'Record');
  // FIX1 F3: the one Text to speech card opens the tool.
  await panel(page).locator('[data-record="tts"]').click();
  const vo = panel(page).locator('.voiceover');
  await expect(vo.locator('#vo-engine')).toHaveValue('test-speech');
  await expect(vo.locator('.voiceover-status')).toHaveText('Ready');
  await expect(vo.locator('#vo-voice')).toHaveValue('test-ava');
  await expect(vo.locator('[data-action="vo-save"]')).toBeDisabled();
  await vo.locator('#vo-text').click();
  await page.keyboard.type('Welcome to the lesson.');
  await vo.locator('[data-action="vo-preview"]').click();
  await expect(vo.locator('.voiceover-message')).toHaveText(
    'Playing the preview…',
  );
  const before = (await assets(page)).length;
  await vo.locator('[data-action="vo-save"]').click();
  await expect(vo.locator('.voiceover-message')).toHaveText('Saved to Media.');
  const all = await assets(page);
  expect(all.length).toBe(before + 1);
  const speech = all.at(-1)!;
  expect(speech.type).toBe('audio');
  expect(speech.metadata.speech).toMatchObject({
    providerId: 'test-speech',
    voiceId: 'test-ava',
    text: 'Welcome to the lesson.',
  });
  // Add to timeline reuses the saved file (no second import).
  await seekKeep(page, 1);
  const lanes = (await scene(page)).tracks.length;
  await vo.locator('[data-action="vo-add"]').click();
  await expect
    .poll(async () => (await scene(page)).tracks.length)
    .toBe(lanes + 1);
  expect((await assets(page)).length).toBe(before + 1);
  const lane = (await scene(page)).tracks.find(
    (track) => track.name === 'Speech 1',
  )!;
  expect(lane.type).toBe('audio');
  expect(lane.clips[0]!.assetId).toBe(speech.id);
  expect(lane.clips[0]!.startTime).toBeCloseTo(1, 6);
  expect((await hook(page)).history.labels.at(-1)).toBe('Add timeline clip');

  // No key: the status says so and the button opens Settings › keys.
  await vo.locator('#vo-engine').selectOption('sarvam');
  await expect(vo.locator('.voiceover-status')).toContainText('Needs a key');
  await expect(vo.locator('[data-action="vo-save"]')).toBeDisabled();
  await vo.locator('[data-action="vo-fix"]').click();
  await expect(page.locator('.modal-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-dialog')).toBeHidden();
  // Hindi without a paid key.
  await vo.locator('#vo-language').selectOption('hi-IN');
  await expect(vo.locator('.voiceover-hint')).toContainText(
    'Hindi needs a paid voice (Sarvam / Google / ElevenLabs)',
  );
  await vo.locator('#vo-text').fill('नमस्ते');
  await vo.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'reports/final-ui/u3-voiceover.png' });
  await vo.locator('[data-action="vo-hindi-key"]').click();
  await expect(page.locator('.modal-dialog')).toBeVisible();
});

test('[F2-012][F2-013][MED-034] Recorder: Camera with countdown, level, Pause / Resume, Stop, review, Save to Media and the timeline; Screen and camera saves two files with the camera as picture-in-picture; a refused screen is explained with Retry', async ({
  page,
}) => {
  await showCategory(page, 'Record');
  await seekKeep(page, 1);
  // Camera.
  await panel(page).locator('[data-record="camera"]').click();
  await expect(panel(page).locator('#rec-camera')).toBeVisible();
  await expect(panel(page).locator('#rec-mic')).toBeVisible();
  await expect(panel(page).locator('#rec-to-timeline')).toBeChecked();
  await panel(page).locator('[data-action="rec-start"]').click();
  await expect(panel(page).locator('.record-countdown')).toBeVisible();
  await expect(panel(page).locator('[data-action="rec-stop"]')).toBeDisabled();
  await expect(panel(page).locator('.record-time')).toBeVisible({
    timeout: 8000,
  });
  await expect(panel(page).locator('.record-time')).toHaveText('00:00:01', {
    timeout: 5000,
  });
  await panel(page).locator('[data-action="rec-pause"]').click();
  await expect(panel(page).locator('[data-action="rec-pause"]')).toHaveText(
    'Resume',
  );
  await panel(page).locator('[data-action="rec-pause"]').click();
  await expect(panel(page).locator('.record-time')).toHaveText('00:00:02', {
    timeout: 5000,
  });
  await panel(page).locator('[data-action="rec-stop"]').click();
  await expect(panel(page).locator('.rec-preview')).toBeVisible({
    timeout: 10000,
  });
  const before = (await assets(page)).length;
  const lanes = (await scene(page)).tracks.length;
  await panel(page).locator('[data-action="rec-save"]').click();
  await expect(panel(page).locator('.record-card')).toHaveCount(5);
  await expect.poll(async () => (await assets(page)).length).toBe(before + 1);
  const camera = (await assets(page)).at(-1)!;
  expect(camera.type).toBe('video');
  expect(camera.name).toContain('Camera recording 1');
  await expect
    .poll(async () => (await scene(page)).tracks.length)
    .toBe(lanes + 1);
  const clip = (await scene(page)).tracks
    .flatMap((track) => track.clips)
    .find((item) => item.assetId === camera.id)!;
  expect(clip.startTime).toBeCloseTo(1, 6);
  expect((await hook(page)).history.labels.at(-1)).toBe('Add recording');

  // Screen and camera: two files, the camera on its own lane in a corner.
  await panel(page).locator('[data-record="screen-camera"]').click();
  await expect(panel(page).locator('.rec-flow')).toContainText(
    'picture in picture',
  );
  await panel(page).locator('[data-action="rec-start"]').click();
  await expect(panel(page).locator('.record-time')).toHaveText('00:00:01', {
    timeout: 9000,
  });
  await panel(page).locator('[data-action="rec-stop"]').click();
  await expect(panel(page).locator('.rec-pip')).toBeVisible({
    timeout: 10000,
  });
  await page.screenshot({ path: 'reports/final-ui/u4-recorder.png' });
  await panel(page).locator('[data-action="rec-save"]').click();
  await expect.poll(async () => (await assets(page)).length).toBe(before + 3);
  const [screen, pip] = (await assets(page)).slice(-2);
  expect(screen!.name).toContain('Screen and camera 1');
  expect(pip!.name).toContain('camera');
  await expect
    .poll(async () =>
      (await scene(page)).layers.some((layer) => layer.assetId === pip!.id),
    )
    .toBe(true);
  const pipLayer = (await scene(page)).layers.find(
    (layer) => layer.assetId === pip!.id,
  )!;
  const { width } = await scene(page);
  expect(pipLayer.transform.position.value[0]).toBeCloseTo(0.72 * width, 3);
  expect(pipLayer.transform.scale.value[0]).toBeLessThan(1);

  // A refused screen: plain help and Retry.
  await page.evaluate(() =>
    (
      window as unknown as { __refuseScreen: (v: boolean) => void }
    ).__refuseScreen(true),
  );
  await panel(page).locator('[data-record="screen"]').click();
  await expect(panel(page).locator('#rec-with-mic')).not.toBeChecked();
  await panel(page).locator('[data-action="rec-start"]').click();
  await expect(panel(page).locator('.record-problem')).toContainText(
    'Recording was not allowed',
  );
  await expect(panel(page).locator('[data-action="rec-retry"]')).toBeVisible();
});
