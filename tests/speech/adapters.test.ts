import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createKeyStore } from '../../src/providers/keys';
import {
  createElevenLabs,
  createMiniMax,
  createDeepgram,
  encodeWav,
  type AudioCodec,
} from '../../src/speech';
import type { FetchLike } from '../../src/providers';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
  );
const codec: AudioCodec = {
  encode: encodeWav,
  decode: async () => ({
    sampleRate: 8000,
    channels: [new Float32Array(4000)],
  }),
};
function setup(responses: Response[]) {
  const keys = createKeyStore(() => undefined);
  keys.setKey('elevenlabs', 'apiKey', 'secret-eleven');
  keys.setKey('minimax', 'apiKey', 'secret-mini');
  keys.setKey('deepgram', 'apiKey', 'secret-deep');
  const fetch = vi.fn<FetchLike>(async () => {
    const next = responses.shift();
    if (!next) throw Error('Unexpected request');
    return next;
  });
  return { keys, fetch, codec };
}
const request = { text: 'Hello.', voiceId: 'voice_en', lang: 'en' };

describe('paid adapters with documented response fixtures', () => {
  it('lists ElevenLabs voices without inventing their languages', async () => {
    const deps = setup([Response.json(fixture('elevenlabs'))]);
    const voices = await createElevenLabs(deps).listVoices('hi');
    expect(voices.map((v) => v.lang)).toEqual(['en', 'hi']);
    expect(deps.fetch.mock.calls[0]?.[1]?.headers).toEqual({
      'xi-api-key': 'secret-eleven',
    });
  });
  it('sends ElevenLabs text by POST with a header key and measures audio', async () => {
    const deps = setup([new Response(new Uint8Array([73, 68, 51]))]);
    const result = await createElevenLabs(deps).synthesize(request);
    expect(result.durationSec).toBe(0.5);
    expect(result.mime).toBe('audio/mpeg');
    const [url, init] = deps.fetch.mock.calls[0]!;
    expect(url).not.toContain('secret');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('xi-api-key')).toBe('secret-eleven');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      text: 'Hello.',
      language_code: 'en',
      model_id: 'eleven_multilingual_v2',
    });
  });
  it('rejects unsupported pitch before a paid request', async () => {
    const deps = setup([]);
    await expect(
      createElevenLabs(deps).synthesize({ ...request, pitch: 2 }),
    ).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it('lists MiniMax voices and decodes the hex audio response', async () => {
    const deps = setup([
      Response.json(fixture('minimax-voices')),
      Response.json(fixture('minimax-audio')),
    ]);
    const provider = createMiniMax(deps);
    expect(await provider.listVoices()).toEqual([
      { id: 'English_Example', name: 'Example', lang: 'und' },
    ]);
    const result = await provider.synthesize(request);
    expect(Array.from(new Uint8Array(await result.blob.arrayBuffer()))).toEqual(
      [73, 68, 51, 1],
    );
    expect(result.durationSec).toBe(0.5);
    const [url, init] = deps.fetch.mock.calls[1]!;
    expect(url).not.toContain('secret');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer secret-mini',
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      output_format: 'hex',
      voice_setting: { voice_id: 'voice_en' },
    });
  });
  it('maps MiniMax application-level key failures without exposing response text', async () => {
    const deps = setup([
      Response.json({
        base_resp: {
          status_code: 1004,
          status_msg: 'secret-mini leaked upstream',
        },
      }),
    ]);
    await expect(createMiniMax(deps).synthesize(request)).rejects.toMatchObject(
      {
        code: 'KEY_INVALID',
        message: expect.not.stringContaining('secret-mini'),
      },
    );
  });
  it('rejects malformed MiniMax audio', async () => {
    const deps = setup([
      Response.json({ base_resp: { status_code: 0 }, data: { audio: 'zz' } }),
    ]);
    await expect(createMiniMax(deps).synthesize(request)).rejects.toMatchObject(
      { code: 'BAD_RESPONSE' },
    );
  });
  it('preserves Hindi word timestamps from Deepgram', async () => {
    const deps = setup([Response.json(fixture('deepgram'))]);
    const blob = new Blob(['fixture'], { type: 'audio/wav' });
    const result = await createDeepgram(deps).transcribe({ blob, lang: 'hi' });
    expect(result.language).toBe('hi');
    expect(result.text).toBe('नमस्ते दुनिया');
    expect(result.words).toEqual([
      { start: 0, end: 0.4, text: 'नमस्ते' },
      { start: 0.5, end: 1, text: 'दुनिया' },
    ]);
    expect(result.segments).toEqual([
      { start: 0, end: 1, text: 'नमस्ते दुनिया' },
    ]);
    const [url, init] = deps.fetch.mock.calls[0]!;
    expect(new URL(url).searchParams.get('language')).toBe('hi');
    expect(init?.body).toBe(blob);
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Token secret-deep',
    );
  });
  it('supports Deepgram URL input without moving its key into the URL', async () => {
    const deps = setup([Response.json(fixture('deepgram'))]);
    await createDeepgram(deps).transcribe({
      url: 'https://example.test/audio.wav',
    });
    const [url, init] = deps.fetch.mock.calls[0]!;
    expect(url).not.toContain('secret');
    expect(JSON.parse(String(init?.body))).toEqual({
      url: 'https://example.test/audio.wav',
    });
  });
  it('rejects a malformed transcription', async () => {
    const deps = setup([Response.json({ results: { channels: [] } })]);
    await expect(
      createDeepgram(deps).transcribe({ blob: new Blob() }),
    ).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
  it('fails before fetch when no key exists', async () => {
    const deps = setup([]);
    deps.keys.clearKey('elevenlabs');
    await expect(
      createElevenLabs(deps).synthesize(request),
    ).rejects.toMatchObject({ code: 'KEY_MISSING' });
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it('respects Retry-After without making or waiting for a retry', async () => {
    const deps = {
      ...setup([
        new Response('secret-eleven', {
          status: 429,
          headers: { 'Retry-After': '20' },
        }),
      ]),
      now: () => 1000,
    };
    const provider = createElevenLabs(deps);
    await expect(provider.synthesize(request)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAt: 21000,
    });
    await expect(provider.synthesize(request)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAt: 21000,
    });
    expect(deps.fetch).toHaveBeenCalledTimes(1);
  });
  it('maps malformed JSON to BAD_RESPONSE', async () => {
    const deps = setup([new Response('{')]);
    await expect(createElevenLabs(deps).listVoices()).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    });
  });
  it('sanitizes fetch errors', async () => {
    const deps = setup([]);
    deps.fetch.mockRejectedValueOnce(new Error('secret-eleven'));
    await expect(
      createElevenLabs(deps).synthesize(request),
    ).rejects.toMatchObject({
      code: 'NETWORK',
      message: expect.not.stringContaining('secret-eleven'),
    });
  });
  it('aborts an in-flight request even when the fetch fake ignores its signal', async () => {
    const deps = setup([]);
    deps.fetch.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const promise = createElevenLabs(deps).synthesize({
      ...request,
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
    expect(deps.fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
