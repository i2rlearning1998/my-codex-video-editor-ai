// ROUND-C1 F4 (C1.3.5): voices (text-to-speech) and captions (speech-to-text)
// by provider kind, through the same registry, REST descriptor, network
// guard and capability sheet as stock. A fake REST voice provider and a
// fake REST captions provider run on a local HTTP server; the owner adds
// them in Platform Config (no code), they show in the capability sheet,
// a plan names them, they disappear when disabled, and with none set the
// offline captions entry stays. Licence and attribution travel with them.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  defaultConfig,
  platformConfigSchema,
  planFor,
  type MediaProvider,
} from '../../src/platform-config';
import { liveCapabilitySheet } from '../../src/tools/capabilities';
import {
  speak,
  speechRunner,
  transcribe,
  speechFixtureRunner,
} from '../../src/tools/speech';
import { safeFetch } from '../../src/tools/net-guard';
import { checkPlanFully } from '../../src/director/llm-planner';
import { startServer, type Started } from '../server/helpers';

const VOICE_HOST = 'voice.fake-speech.test';
const STT_HOST = 'stt.fake-speech.test';
const PUBLIC_IP = '93.184.216.34';
const WAV = Buffer.from('RIFF0000WAVEfmt fake').toString('base64');
let server: Server;
let base = '';
const calls: { path: string; key: string; body: Record<string, string> }[] = [];
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      calls.push({
        path: req.url ?? '',
        key: String(
          req.headers['x-voice-key'] ?? req.headers.authorization ?? '',
        ),
        body,
      });
      const json = (v: unknown, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(v));
      };
      if (req.url === '/v1/say') {
        if (body.words === 'hang') return; // never answers
        if (body.words === 'move') {
          res.writeHead(307, { location: 'https://10.0.0.9/steal' });
          return res.end();
        }
        return json({
          result: { audio_b64: WAV, type: 'audio/wav' },
          licence: 'voice-licence',
          credit: 'Fake Voice Co',
        });
      }
      if (req.url === '/v1/hear')
        return json({
          transcript: 'Water moves fast',
          segments: [
            { w: 'Water', s: 0.1, e: 0.5 },
            { w: 'moves', s: 0.6, e: 0.9 },
            { w: 'fast', s: 1.0, e: 1.3 },
          ],
        });
      json({ error: 'no' }, 404);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
const fetchVia = (url: string, init: unknown) => {
  const u = new URL(url);
  return fetch(`${base}${u.pathname}${u.search}`, init as RequestInit);
};
const resolve = async (host: string) =>
  host.endsWith('.test') ? [PUBLIC_IP] : ['10.1.1.1'];

/** What the owner adds in Platform Config: two speech providers, no code. */
const voiceProvider = (over: Partial<MediaProvider> = {}): MediaProvider => ({
  id: 'fakevoice',
  name: 'Fake Voice',
  kinds: ['text-to-speech'],
  enabled: true,
  plans: [],
  costPerCall: 3,
  rateLimit: { perMinute: 60 },
  hint: { en: 'Warm narration voices.', hi: 'गर्म आवाज़ें।' },
  licences: [],
  adapter: {
    type: 'rest',
    descriptor: {
      baseUrl: `https://${VOICE_HOST}`,
      searchPath: '/',
      auth: {
        style: 'header',
        name: 'x-voice-key',
        prefix: '',
        keyRef: 'FAKEVOICE_KEY',
      },
      request: {
        query: 'q',
        orientation: '',
        page: '',
        limit: '',
        fixed: {},
        orientationValues: {
          landscape: 'landscape',
          portrait: 'portrait',
          square: 'square',
        },
      },
      speech: {
        path: '/v1/say',
        fields: {
          text: 'words',
          voice: 'speaker',
          lang: 'language',
          audio: 'audio',
          mime: 'mime',
        },
        response: {
          audio: 'result.audio_b64',
          mime: 'result.type',
          licence: 'licence',
          attribution: 'credit',
          wordText: 'text',
          wordStart: 'start',
          wordEnd: 'end',
        },
        defaultMime: 'audio/wav',
      },
      defaultLicence: 'provider-licence',
      timeoutMs: 1000,
      maxBytes: 1024 * 1024,
      maxItems: 40,
    },
  },
  ...over,
});
const sttProvider = (over: Partial<MediaProvider> = {}): MediaProvider => ({
  ...voiceProvider(),
  id: 'fakestt',
  name: 'Fake Captions',
  kinds: ['speech-to-text'],
  costPerCall: 0,
  hint: { en: 'Word timings for captions.' },
  adapter: {
    type: 'rest',
    descriptor: {
      ...(
        voiceProvider().adapter as unknown as {
          descriptor: Record<string, unknown>;
        }
      ).descriptor,
      baseUrl: `https://${STT_HOST}`,
      auth: { style: 'none', name: '', prefix: '' },
      speech: {
        path: '/v1/hear',
        fields: {
          text: 'text',
          voice: 'voice',
          lang: 'lang',
          audio: 'audio_b64',
          mime: 'content_type',
        },
        response: {
          text: 'transcript',
          words: 'segments',
          wordText: 'w',
          wordStart: 's',
          wordEnd: 'e',
        },
        defaultMime: 'audio/wav',
      },
    },
  } as unknown as MediaProvider['adapter'],
  ...over,
});
const config = (providers: MediaProvider[]) => {
  const c = defaultConfig();
  c.mediaProviders.push(...providers);
  return platformConfigSchema.parse(c);
};
const runner = speechRunner({
  fetch: fetchVia as never,
  resolve,
  key: (ref) => (ref === 'FAKEVOICE_KEY' ? 'voice-secret' : undefined),
});

describe('[RDC1-070] speech providers by kind in the registry and the capability sheet', () => {
  it('[RDC1-070] added in config they show in the sheet by kind; disabled they disappear; with none the offline captions stay', () => {
    const c = config([voiceProvider(), sttProvider()]);
    const sheet = liveCapabilitySheet(c, { planId: 'pro' }).text;
    expect(sheet).toMatch(
      /- text-to-speech: fakevoice \(Warm narration voices, 3 credits a call; 60\/min\)/,
    );
    expect(sheet).toMatch(
      /- speech-to-text: .*fakestt \(Word timings for captions; 60\/min\)/,
    );
    const off = config([
      voiceProvider({ enabled: false }),
      sttProvider({ enabled: false }),
    ]);
    const offSheet = liveCapabilitySheet(off, { planId: 'pro' }).text;
    expect(offSheet).not.toMatch(/fakevoice|fakestt/);
    expect(offSheet).toMatch(/- speech-to-text: offline-captions/);
    expect(offSheet).not.toMatch(/- text-to-speech:/);
    // The sheet's version changes with them, so the Director sees it next call.
    expect(liveCapabilitySheet(c).version).not.toBe(
      liveCapabilitySheet(off).version,
    );
  });
  it('[RDC1-070] a plan may name them; a provider that is missing or disabled is a plan error with a plain sentence', async () => {
    const plan = (voice?: string, captions?: string) => ({
      plan: {
        format: 'video-plan',
        version: 4,
        meta: { title: 'Water', language: 'en', aspect: '16:9' },
        voice: voice ? { provider: voice } : undefined,
        captions: captions ? { enabled: true, provider: captions } : undefined,
        scenes: [
          {
            id: 's1',
            title: 'Water',
            narration: 'Water moves fast.',
            durationHint: 4,
            notes: 'method:motion-graphics;source:ai',
            layers: [{ id: 't', kind: 'title', text: 'Water' }],
          },
        ],
      },
      upgrades: [],
    });
    const on = config([voiceProvider(), sttProvider()]);
    const pro = planFor(on, 'pro');
    expect(
      (await checkPlanFully(on, pro, plan('fakevoice', 'fakestt'))).ok,
    ).toBe(true);
    const off = config([voiceProvider({ enabled: false }), sttProvider()]);
    const r = await checkPlanFully(
      off,
      planFor(off, 'pro'),
      plan('fakevoice', 'fakestt'),
    );
    expect(r.ok).toBe(false);
    expect(r.ok || r.errors.join(' ')).toMatch(
      /The voice provider "fakevoice" is not available/,
    );
  });
});

describe('[RDC1-071] the speech runtime: POST through the guard, key from the vault, licence kept', () => {
  it('[RDC1-071] speak sends the text to the descriptor fields with the key and returns the audio with its licence and credit', async () => {
    const c = config([voiceProvider(), sttProvider()]);
    const said = await speak(
      { text: 'Water moves fast.', lang: 'en', voice: 'asha' },
      c.mediaProviders,
      'pro',
      runner,
    );
    expect(said).toMatchObject({
      provider: 'fakevoice',
      base64: WAV,
      mime: 'audio/wav',
      licence: 'voice-licence',
      attribution: 'Fake Voice Co',
    });
    const last = calls.at(-1)!;
    expect(last.path).toBe('/v1/say');
    expect(last.key).toBe('voice-secret');
    expect(last.body).toEqual({
      words: 'Water moves fast.',
      speaker: 'asha',
      language: 'en',
    });
    const heard = await transcribe(
      { audio: WAV, mime: 'audio/wav', lang: 'en' },
      c.mediaProviders,
      'pro',
      runner,
    );
    expect(heard.words).toEqual([
      { text: 'Water', start: 0.1, end: 0.5 },
      { text: 'moves', start: 0.6, end: 0.9 },
      { text: 'fast', start: 1.0, end: 1.3 },
    ]);
    expect(heard.licence).toBe('provider-licence');
    expect(heard.attribution).toBe('Fake Captions');
    expect(calls.at(-1)!.body).toEqual({
      audio_b64: WAV,
      content_type: 'audio/wav',
      lang: 'en',
    });
  });
  it('[RDC1-071] without its key, with a redirect, to a private address or with no answer, it fails with one sentence and sends nothing on', async () => {
    const c = config([voiceProvider()]);
    const noKey = speechRunner({
      fetch: fetchVia as never,
      resolve,
      key: () => undefined,
    });
    await expect(
      speak({ text: 'x', lang: 'en' }, c.mediaProviders, 'pro', noKey),
    ).rejects.toThrow('its key is not set on the server.');
    await expect(
      speak({ text: 'move', lang: 'en' }, c.mediaProviders, 'pro', runner),
    ).rejects.toThrow('The provider tried to redirect a request with data.');
    const inside = speechRunner({
      fetch: fetchVia as never,
      resolve: async () => ['192.168.1.2'],
      key: () => 'k',
    });
    await expect(
      speak({ text: 'x', lang: 'en' }, c.mediaProviders, 'pro', inside),
    ).rejects.toThrow(/private|not allowed|blocked/i);
    await expect(
      safeFetch(`https://${VOICE_HOST}/v1/say`, {
        fetch: fetchVia as never,
        resolve,
        hosts: [VOICE_HOST],
        post: JSON.stringify({ words: 'hang' }),
        timeoutMs: 300,
        maxBytes: 1024,
      }),
    ).rejects.toThrow('The site took too long to answer.');
    // A provider of another kind is not a voice; none set is said plainly.
    await expect(
      speak(
        { text: 'x', lang: 'en' },
        config([]).mediaProviders,
        'pro',
        runner,
      ),
    ).rejects.toThrow('No voice provider is set up.');
    await expect(
      speak(
        { text: 'x', lang: 'en', provider: 'fakevoice' },
        config([voiceProvider({ plans: ['studio'] })]).mediaProviders,
        'free',
        runner,
      ),
    ).rejects.toThrow('The voice provider "fakevoice" is not available.');
    // The offline fixture runner answers like the provider would.
    const fixture = speechFixtureRunner({
      fakevoice: { result: { audio_b64: WAV }, credit: 'Fixture' },
    });
    expect(
      (await speak({ text: 'x', lang: 'en' }, c.mediaProviders, 'pro', fixture))
        .attribution,
    ).toBe('Fixture');
  });
});

describe('[RDC1-072] speak and transcribe on the gateway', () => {
  let s: Started;
  let admin = '';
  beforeAll(async () => {
    s = await startServer({ FAKEVOICE_KEY: 'voice-secret' }, undefined, {
      toolRuntime: { fetch: fetchVia as never, resolve },
    });
    admin = s.token('admin-0000', { app_metadata: { role: 'admin' } });
    const c = defaultConfig();
    c.mediaProviders.push(voiceProvider(), sttProvider());
    const r = await s.api('/v1/config', {
      token: admin,
      body: { config: c, note: 'speech providers', publish: true },
    });
    expect(r.status).toBe(200);
  });
  afterAll(() => s.close());
  it('[RDC1-072] the person sends text, gets audio with its licence; the key never leaves the server; the voice is charged once', async () => {
    const user = s.token('user-speech-1');
    const before = (await s.api('/v1/balance', { token: user })).body
      .balance as number;
    const r = await s.api('/v1/tools/run', {
      token: user,
      body: {
        tool: 'speak',
        input: { text: 'Water moves fast.', lang: 'en' },
        videoId: 'v1',
      },
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.output).toMatchObject({
      provider: 'fakevoice',
      licence: 'voice-licence',
      attribution: 'Fake Voice Co',
    });
    expect(JSON.stringify(r.body)).not.toMatch(
      /voice-secret|fake-speech\.test/,
    );
    expect((await s.api('/v1/balance', { token: user })).body.balance).toBe(
      before - 3,
    );
    const heard = await s.api('/v1/tools/run', {
      token: user,
      body: {
        tool: 'transcribe',
        input: { audio: WAV, mime: 'audio/wav', lang: 'en' },
        videoId: 'v1',
      },
    });
    expect(heard.body.output.words).toHaveLength(3);
  });
});
