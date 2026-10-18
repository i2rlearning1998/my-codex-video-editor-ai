import {
  createProviderRegistry,
  registry as sharedRegistry,
} from '../providers/registry';
import { keyStore, type KeyStore } from '../providers/keys';
import { ProviderError } from '../providers/errors';
import { createSarvam } from './sarvam';
import { createGoogleCloudTts } from './google-cloud-tts';
import { createElevenLabs } from './elevenlabs';
import { createMiniMax } from './minimax';
import { createDeepgram } from './deepgram';
import { LOCAL_MODELS } from './models';
import { SpeechError, type TtsProvider, type SttProvider } from './types';
import type { PaidDependencies } from './http';
export type SpeechProvider = TtsProvider | SttProvider;
/** FINAL2 U11: local models whose files are stored and checked. */
const readyModels = new Set<string>();
const localTranscribers = new Map<string, SttProvider['transcribe']>();
export function setLocalModelReady(id: string, ready: boolean): void {
  if (ready) readyModels.add(id);
  else readyModels.delete(id);
}
export function setLocalTranscriber(
  id: string,
  transcribe: SttProvider['transcribe'] | null,
): void {
  if (transcribe) localTranscribers.set(id, transcribe);
  else localTranscribers.delete(id);
}
export type SpeechStatus =
  | { id: string; state: 'ready' }
  | { id: string; state: 'needs-key' }
  | { id: string; state: 'needs-download'; sizeBytes: number }
  | { id: string; state: 'unavailable'; reason: string };
export type VoiceListResult =
  | { status: 'ready'; voices: Awaited<ReturnType<TtsProvider['listVoices']>> }
  | {
      status: 'unavailable';
      code: 'LANGUAGE_UNAVAILABLE' | 'MODEL_UNAVAILABLE';
      voices: [];
    };
/** Empty voice list stays compatible; this wrapper supplies a typed explanation. */
export async function listSpeechVoices(
  provider: TtsProvider,
  lang?: string,
): Promise<VoiceListResult> {
  const voices = await provider.listVoices(lang);
  if (voices.length) return { status: 'ready', voices };
  return {
    status: 'unavailable',
    code: lang ? 'LANGUAGE_UNAVAILABLE' : 'MODEL_UNAVAILABLE',
    voices: [],
  };
}
export function createSpeechRegistry(
  deps: PaidDependencies = {},
  catalog: ReturnType<typeof createProviderRegistry> = createProviderRegistry(),
) {
  const keys: KeyStore = deps.keys ?? keyStore;
  const tts: TtsProvider = {
    id: 'local-tts',
    name: 'Local English TTS (unavailable)',
    kind: 'speech-tts',
    requiresKey: false,
    keyFields: [],
    listVoices: async () => [],
    synthesize: async (r) => {
      throw new SpeechError(
        r.lang.split('-')[0] === 'en'
          ? 'MODEL_UNAVAILABLE'
          : 'LANGUAGE_UNAVAILABLE',
      );
    },
  };
  const stt: SttProvider = {
    id: 'local-whisper',
    name: 'Offline Whisper',
    kind: 'speech-stt',
    requiresKey: false,
    keyFields: [],
    languages: ['en', 'hi'],
    // FINAL2 U11: a runner set by the app (or a test fake) once downloaded.
    transcribe: async (request) => {
      const runner = localTranscribers.get('local-whisper');
      if (!runner || !readyModels.has('local-whisper'))
        throw new SpeechError('MODEL_UNAVAILABLE');
      return runner(request);
    },
  };
  const entries: SpeechProvider[] = [
    createSarvam(deps),
    createGoogleCloudTts(deps),
    createElevenLabs(deps),
    createMiniMax(deps),
    createDeepgram(deps),
    tts,
    stt,
  ];
  for (const p of entries)
    catalog.register({
      ...p,
      kinds: [p.kind],
      attribution: { text: p.name, url: '' },
      search: async () => {
        throw new ProviderError('BAD_RESPONSE');
      },
      getDownload: async () => {
        throw new ProviderError('BAD_RESPONSE');
      },
    });
  return {
    catalog,
    list: () => [...entries],
    get: (id: string) => entries.find((p) => p.id === id),
    getSpeechStatus: (): SpeechStatus[] =>
      entries.map((p) => {
        const local = LOCAL_MODELS.find((m) => m.id === p.id);
        if (local) {
          if (local.blocker || !local.files.length)
            return {
              id: p.id,
              state: 'unavailable',
              reason: local.blocker ?? 'No verified runner',
            };
          if (readyModels.has(p.id)) return { id: p.id, state: 'ready' };
          const known = local.files.every((f) => f.sizeBytes !== null);
          return {
            id: p.id,
            state: 'needs-download',
            sizeBytes: known
              ? local.files.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0)
              : (local.approxBytes ?? 0),
          };
        }
        return { id: p.id, state: keys.hasKeys(p) ? 'ready' : 'needs-key' };
      }),
  };
}
/** Explicit startup call, avoiding registration as an import side effect. Call once. */
export const registerSpeechProviders = (deps: PaidDependencies = {}) =>
  createSpeechRegistry(deps, sharedRegistry);
export function getSpeechStatus(
  registry: ReturnType<typeof createSpeechRegistry>,
): SpeechStatus[] {
  return registry.getSpeechStatus();
}
