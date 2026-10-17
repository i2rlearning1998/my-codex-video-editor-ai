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
    name: 'Local Whisper (unavailable)',
    kind: 'speech-stt',
    requiresKey: false,
    keyFields: [],
    languages: ['en', 'hi'],
    transcribe: async () => {
      throw new SpeechError('MODEL_UNAVAILABLE');
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
        if (local)
          return {
            id: p.id,
            state: 'unavailable',
            reason: local.blocker ?? 'No verified runner',
          };
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
