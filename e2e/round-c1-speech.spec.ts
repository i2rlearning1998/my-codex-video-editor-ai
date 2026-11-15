// ROUND-C1 F4 (C1.3.5): voices and captions by provider kind. The owner adds
// a REST voice provider and a REST captions provider in Platform Config (no
// code); a v4 plan names them; the build speaks the narration with the
// voice (its licence kept on the narration file) and times the captions
// with the captions provider. Disabled, a plan that names them is refused
// in plain words, and the offline captions still work with none. Offline
// model with scripted answers; the providers answer from test fixtures.
import { readFileSync } from 'node:fs';
import { test, expect, hook } from './fixtures';
import {
  build,
  lastDirector,
  startAi,
  toAssets,
  toPlan,
} from './round-b-helpers';
import { proofConfig, stage } from './round-c1-helpers';

const speechDescriptor = (path: string, audioField: string) => ({
  baseUrl: `https://${path.slice(1)}.fake-speech.test`,
  searchPath: '/',
  auth: { style: 'none', name: '', prefix: '' },
  request: {},
  speech: {
    path,
    fields: { audio: audioField },
    response: {
      audio: 'result.audio_b64',
      mime: 'result.type',
      licence: 'licence',
      attribution: 'credit',
      text: 'transcript',
      words: 'segments',
      wordText: 'w',
      wordStart: 's',
      wordEnd: 'e',
    },
  },
});
const provider = (id: string, name: string, kind: string, enabled = true) => ({
  id,
  name,
  kinds: [kind],
  enabled,
  plans: [],
  costPerCall: 0,
  rateLimit: { perMinute: 60 },
  hint: { en: name, hi: name },
  licences: [],
  adapter: {
    type: 'rest',
    descriptor: speechDescriptor(
      id === 'fakevoice' ? '/say' : '/hear',
      'audio',
    ),
  },
});
const withSpeech = (enabled: boolean) =>
  proofConfig((c) => {
    c.mediaProviders.push(
      provider('fakevoice', 'Fake Voice', 'text-to-speech', enabled),
      provider('fakestt', 'Fake Captions', 'speech-to-text', enabled),
    );
  });
const WAV = readFileSync(
  'tests/fixtures/media/audio_tone_440hz_3s.wav',
).toString('base64');
const answers = {
  fakevoice: {
    result: { audio_b64: WAV, type: 'audio/wav' },
    licence: 'voice-licence',
    credit: 'Fake Voice Co',
  },
  fakestt: {
    transcript: 'Water moves fast.',
    segments: [
      { w: 'Water', s: 0.1, e: 0.5 },
      { w: 'moves', s: 0.6, e: 0.9 },
      { w: 'fast.', s: 1.0, e: 1.3 },
    ],
  },
};
const plan = (named: boolean) => ({
  format: 'video-plan',
  version: 4,
  meta: {
    title: 'Water',
    language: 'en',
    aspect: '16:9',
    videoType: 'explainer',
  },
  ...(named
    ? {
        voice: { provider: 'fakevoice' },
        captions: { enabled: true, provider: 'fakestt' },
      }
    : { captions: { enabled: true } }),
  scenes: [
    {
      id: 's1',
      title: 'Water',
      narration: 'Water moves fast.',
      durationHint: 4,
      notes: 'method:motion-graphics;source:ai',
      layers: [{ id: 't', kind: 'title', text: 'Water', anchor: 'top' }],
    },
  ],
});
const MESSAGE = 'Explain how water moves, 1 minute, in English';
const speechFixtures = (page: import('@playwright/test').Page) =>
  page.addInitScript((a) => {
    (window as { __AIVE_E2E_SPEECH__?: unknown }).__AIVE_E2E_SPEECH__ = a;
  }, answers);
const cues = async (page: import('@playwright/test').Page) =>
  (await hook(page)).project.compositions
    .flatMap((s) => s.layers.flatMap((l) => [l, ...(l.children ?? [])]))
    .map((l) => l.properties.captionCue?.value)
    .filter((v): v is string => typeof v === 'string')
    .map((v) => JSON.parse(v) as { words: { text: string; start: number }[] });

test("[RDC1-073] a plan names the config-added voice and captions providers: the narration is spoken by the voice (licence kept) and the captions take the provider's word times", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await stage(page, plan(true), withSpeech(true));
  await speechFixtures(page);
  await startAi(page, MESSAGE);
  await toPlan(page);
  await toAssets(page);
  await build(page);
  const h = await hook(page);
  const narration = h.project.assets.find(
    (a) => a.type === 'audio' && /Narration/.test(a.name),
  );
  expect(narration).toBeTruthy();
  expect(JSON.stringify(narration!.metadata)).toMatch(/Fake Voice Co/);
  expect(JSON.stringify(narration!.metadata)).toMatch(/voice-licence/);
  const words = (await cues(page)).flatMap((c) => c.words);
  expect(words.map((w) => w.text)).toEqual(['Water', 'moves', 'fast.']);
  expect(words[0]!.start).toBeCloseTo(0.1, 2);
  await page
    .locator('.editor-shell')
    .screenshot({ path: 'reports/round-c1/f4-voice-captions.png' });
});

test('[RDC1-073] disabled, a plan that names them is refused in plain words; with none configured the offline captions still work', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await stage(page, null, withSpeech(false), [
    { plan: plan(true), upgrades: [] },
    { plan: plan(true), upgrades: [] },
  ]);
  await speechFixtures(page);
  await startAi(page, MESSAGE);
  await page.locator('#ai-brief-card .ai-btn.primary').click();
  await expect(lastDirector(page)).toContainText(
    'I could not make a plan I trust from this brief.',
    { timeout: 60_000 },
  );
  // The same Video with a plan that names none: offline captions from the
  // narration text, no provider voice.
  await stage(page, plan(false), withSpeech(false));
  await page.reload();
  await expect(page.locator('#ai-brief-card')).toBeVisible({ timeout: 30_000 });
  await toPlan(page);
  await toAssets(page);
  await build(page);
  const words = (await cues(page)).flatMap((c) => c.words);
  expect(words.map((w) => w.text)).toEqual(['Water', 'moves', 'fast.']);
  expect(words[0]!.start).not.toBeCloseTo(0.1, 2);
  // The voice is the editor's own engine (no provider licence on it).
  const narration = (await hook(page)).project.assets.find((a) =>
    /Narration/.test(a.name),
  );
  expect(narration).toBeTruthy();
  expect(JSON.stringify(narration!.metadata)).not.toMatch(/Fake Voice/);
});

test('[RDC1-097] the named voice provider fails during the build: the video is still built, silent, with one plain reason; the captions keep the narration text', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await stage(page, plan(true), withSpeech(true));
  // The captions provider answers; the voice provider does not.
  await page.addInitScript((a) => {
    (window as { __AIVE_E2E_SPEECH__?: unknown }).__AIVE_E2E_SPEECH__ = {
      fakestt: a,
    };
  }, answers.fakestt);
  await startAi(page, MESSAGE);
  await toPlan(page);
  await toAssets(page);
  await build(page);
  const h = await hook(page);
  expect(h.project.assets.some((a) => /Narration/.test(a.name))).toBe(false);
  const words = (await cues(page)).flatMap((c) => c.words);
  expect(words.map((w) => w.text)).toEqual(['Water', 'moves', 'fast.']);
  await expect(page.locator('#ai-thread')).toContainText(/silent/i);
});
