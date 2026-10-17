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
import { registerSpeechProviders, type SpeechProvider } from '../speech';

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
  return speech;
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
