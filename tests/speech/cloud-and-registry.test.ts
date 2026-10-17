import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createSarvam,
  createGoogleCloudTts,
  createSpeechRegistry,
  listSpeechVoices,
  toCaptionCues,
  encodeWav,
} from '../../src/speech';
import { createKeyStore } from '../../src/providers/keys';
import type { FetchLike } from '../../src/providers';
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
  );
function setup(response: unknown) {
  const keys = createKeyStore(() => undefined);
  keys.setKey('sarvam', 'apiKey', 'secret');
  keys.setKey('google-cloud-tts', 'apiKey', 'secret');
  const fetch = vi.fn<FetchLike>(async () => Response.json(response));
  return {
    keys,
    fetch,
    codec: {
      encode: encodeWav,
      decode: async () => ({
        sampleRate: 8000,
        channels: [new Float32Array(8000)],
      }),
    },
  };
}
it('Sarvam uses its subscription header and Hindi request shape', async () => {
  const deps = setup(fixture('sarvam'));
  const p = createSarvam(deps);
  expect((await p.listVoices('hi')).every((v) => v.lang === 'hi-IN')).toBe(
    true,
  );
  expect(await p.listVoices('fr')).toEqual([]);
  expect(
    (await p.synthesize({ text: 'नमस्ते', voiceId: 'shubh', lang: 'hi' }))
      .durationSec,
  ).toBe(1);
  const [url, init] = deps.fetch.mock.calls[0]!;
  expect(url).not.toContain('secret');
  expect(new Headers(init?.headers).get('api-subscription-key')).toBe('secret');
  expect(JSON.parse(String(init?.body))).toMatchObject({
    language_code: 'hi-IN',
    model: 'bulbul:v3',
    output_audio_codec: 'wav',
  });
});
it('Sarvam rejects pitch and unsupported languages before requests', async () => {
  const deps = setup({});
  const p = createSarvam(deps);
  await expect(
    p.synthesize({ text: 'x', voiceId: 'shubh', lang: 'hi', pitch: 2 }),
  ).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
  await expect(
    p.synthesize({ text: 'x', voiceId: 'shubh', lang: 'xx' }),
  ).rejects.toMatchObject({ code: 'LANGUAGE_UNAVAILABLE' });
  expect(deps.fetch).not.toHaveBeenCalled();
});
it('Google filters voices and uses header key with no credential in query', async () => {
  const deps = setup(fixture('google-voices'));
  expect(await createGoogleCloudTts(deps).listVoices('hi')).toEqual([
    { id: 'hi-IN-Standard-A', name: 'hi-IN-Standard-A', lang: 'hi-IN' },
  ]);
  const [url, init] = deps.fetch.mock.calls[0]!;
  expect(new URL(url).searchParams.get('languageCode')).toBe('hi');
  expect(url).not.toContain('secret');
  expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('secret');
});
it('Google maps Hindi synthesis to LINEAR16 and pitch semitones', async () => {
  const deps = setup(fixture('google-audio'));
  const result = await createGoogleCloudTts(deps).synthesize({
    text: 'नमस्ते',
    voiceId: 'hi-IN-Standard-A',
    lang: 'hi-IN',
    pitch: 2,
  });
  expect(result.mime).toBe('audio/wav');
  expect(JSON.parse(String(deps.fetch.mock.calls[0]?.[1]?.body))).toMatchObject(
    {
      voice: { languageCode: 'hi-IN' },
      audioConfig: { audioEncoding: 'LINEAR16', pitch: 12 },
    },
  );
});
it('cloud responses reject invalid base64 and missing keys without leaking text', async () => {
  const deps = setup({ audioContent: 'not audio' });
  await expect(
    createGoogleCloudTts(deps).synthesize({
      text: 'x',
      voiceId: 'en-US-Standard-A',
      lang: 'en-US',
    }),
  ).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  deps.keys.clearKey('sarvam');
  await expect(
    createSarvam(deps).synthesize({ text: 'x', voiceId: 'shubh', lang: 'hi' }),
  ).rejects.toMatchObject({ code: 'KEY_MISSING' });
});
it('C1 registry discovers all speech kinds and live key status; local engines are explicitly unavailable', async () => {
  const deps = setup({});
  const r = createSpeechRegistry(deps);
  expect(r.catalog.listByKind('speech-tts')).toHaveLength(5);
  expect(r.catalog.listByKind('speech-stt')).toHaveLength(2);
  expect(r.getSpeechStatus().find((s) => s.id === 'sarvam')?.state).toBe(
    'ready',
  );
  deps.keys.clearKey('sarvam');
  expect(r.getSpeechStatus().find((s) => s.id === 'sarvam')?.state).toBe(
    'needs-key',
  );
  expect(r.getSpeechStatus().find((s) => s.id === 'local-tts')?.state).toBe(
    'unavailable',
  );
  const p = r.get('local-tts')!;
  if (p.kind !== 'speech-tts') throw Error('wrong kind');
  expect(await listSpeechVoices(p, 'hi')).toEqual({
    status: 'unavailable',
    code: 'LANGUAGE_UNAVAILABLE',
    voices: [],
  });
  expect(deps.fetch).not.toHaveBeenCalled();
});
it('long segment-only captions split proportionally and mark approximation', () => {
  const cues = toCaptionCues(
    {
      text: 'one two six ten',
      language: 'en',
      segments: [{ start: 0, end: 8, text: 'one two six ten' }],
    },
    { maxCharsPerLine: 3, maxDuration: 4 },
  );
  expect(cues.map((c) => [c.start, c.end])).toEqual([
    [0, 4],
    [4, 8],
  ]);
  expect(cues.every((c) => c.approximate && c.words.length === 0)).toBe(true);
  expect(cues.flatMap((c) => c.lines).join(' ')).toBe('one two six ten');
});
it('long aligned segments split on words without estimated timestamps', () => {
  const words = [
    { start: 0, end: 2, text: 'one' },
    { start: 2, end: 4, text: 'two' },
    { start: 4, end: 6, text: 'six' },
  ];
  const cues = toCaptionCues(
    {
      text: 'one two six',
      language: 'en',
      segments: [{ start: 0, end: 6, text: 'one two six' }],
      words,
    },
    { maxDuration: 4 },
  );
  expect(cues.flatMap((c) => c.words)).toEqual(words);
  expect(cues.every((c) => !c.approximate)).toBe(true);
});
