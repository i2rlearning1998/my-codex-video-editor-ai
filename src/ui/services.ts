// FINAL2 U1: one place that registers the optional engines the UI uses
// (stock providers and speech engines), once, on first use. Nothing makes a
// request here; adapters only call out when the user searches or tests.
import {
  registry,
  createPixabay,
  createPexels,
  createIconify,
  createFreesound,
  type Provider,
  type StockKind,
} from '../providers';
import {
  registerSpeechProviders,
  setLocalModelReady,
  setLocalTranscriber,
  SpeechError,
  type SpeechProvider,
} from '../speech';
import { createWhisperRunner, type WhisperRunner } from '../speech/whisper';
import {
  refreshLocalEngines,
  registerLocalEngineDriver,
} from './local-engines';

let speech: ReturnType<typeof registerSpeechProviders> | undefined;

function ensure() {
  if (speech) return speech;
  for (const make of [
    createPixabay,
    createPexels,
    createIconify,
    createFreesound,
  ])
    registry.register(make());
  speech = registerSpeechProviders();
  wireWhisper();
  return speech;
}

/** A dev/test-only stand-in: a short fake download and fixed words. */
function fakeWhisper(): WhisperRunner {
  let ready = false;
  return {
    isReady: async () => ready,
    async download(onProgress, signal) {
      for (const step of [0.25, 0.5, 0.75, 1]) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        if (signal.aborted) throw new SpeechError('INVALID_INPUT');
        onProgress(step);
      }
      ready = true;
    },
    async remove() {
      ready = false;
    },
    async transcribe(request) {
      const words = ['Hello', 'from', 'offline', 'captions'].map((text, i) => ({
        text,
        start: i * 0.5,
        end: i * 0.5 + 0.45,
      }));
      return {
        text: words.map((w) => w.text).join(' '),
        language: (request.lang ?? 'en').split('-')[0]!,
        segments: [
          { text: words.map((w) => w.text).join(' '), start: 0, end: 2 },
        ],
        words,
      };
    },
  };
}

/** FINAL2 U11: the offline Whisper engine (Settings › Offline voice & captions). */
function wireWhisper() {
  const fake =
    (import.meta.env.DEV || import.meta.env.MODE === 'e2e') &&
    typeof window !== 'undefined' &&
    (window as { __AIVE_E2E_WHISPER__?: string }).__AIVE_E2E_WHISPER__ ===
      'fake';
  const runner = fake ? fakeWhisper() : createWhisperRunner();
  setLocalTranscriber('local-whisper', (request) => runner.transcribe(request));
  registerLocalEngineDriver('local-whisper', {
    async download(onProgress, signal) {
      await runner.download(onProgress, signal);
      setLocalModelReady('local-whisper', true);
    },
    async remove() {
      await runner.remove();
      setLocalModelReady('local-whisper', false);
    },
  });
  void runner
    .isReady()
    .then((ready) => {
      setLocalModelReady('local-whisper', ready);
      refreshLocalEngines();
    })
    .catch(() => {});
}

/** Stock providers in the order Settings lists them. */
export const STOCK_ORDER = ['pixabay', 'pexels', 'freesound', 'iconify'];
/** Voice services in the order Settings lists them. */
export const VOICE_ORDER = [
  'sarvam',
  'google-cloud-tts',
  'elevenlabs',
  'minimax',
  'deepgram',
];

export function stockProviders(): Provider[] {
  ensure();
  return STOCK_ORDER.map((id) => registry.get(id)).filter((p): p is Provider =>
    Boolean(p),
  );
}
export function stockProvidersFor(kind: StockKind): Provider[] {
  return stockProviders().filter((p) => p.kinds.includes(kind));
}
export function stockProvider(id: string): Provider | undefined {
  ensure();
  return registry.get(id);
}
export function speechRegistry() {
  return ensure();
}
export function voiceServices(): SpeechProvider[] {
  const all = ensure().list();
  return VOICE_ORDER.map((id) => all.find((p) => p.id === id)).filter(
    (p): p is SpeechProvider => Boolean(p),
  );
}

/** Fired on document when a provider key is saved or cleared. */
export const KEYS_CHANGED = 'aive-keys-changed';
