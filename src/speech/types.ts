import type { Provider } from '../providers/types';
export type SpeechIdentity = Pick<
  Provider,
  'id' | 'name' | 'requiresKey' | 'keyFields'
>;
export interface WordTiming {
  start: number;
  end: number;
  text: string;
}
export interface Voice {
  id: string;
  name: string;
  lang: string;
}
export interface SpeechProgress {
  phase: 'download' | 'synthesis' | 'transcription';
  completed: number;
  total: number | null;
  file?: string;
}
export interface TtsRequest {
  text: string;
  voiceId: string;
  lang: string;
  rate?: number;
  pitch?: number;
  signal?: AbortSignal;
  onProgress?: (progress: SpeechProgress) => void;
}
export interface TtsResult {
  blob: Blob;
  mime: string;
  durationSec: number;
  wordTimings?: WordTiming[];
}
export interface TtsProvider extends SpeechIdentity {
  kind: 'speech-tts';
  listVoices(lang?: string): Promise<Voice[]>;
  synthesize(request: TtsRequest): Promise<TtsResult>;
  estimateCost?: (text: string) => { amount: number; currency: string };
}
export type SttRequest = (
  { blob: Blob; url?: never } | { url: string; blob?: never }
) & {
  lang?: string;
  signal?: AbortSignal;
  onProgress?: (progress: SpeechProgress) => void;
};
export interface Transcription {
  text: string;
  language: string;
  segments: WordTiming[];
  words?: WordTiming[];
}
export interface SttProvider extends SpeechIdentity {
  kind: 'speech-stt';
  languages: readonly string[];
  transcribe(request: SttRequest): Promise<Transcription>;
}
export interface PcmAudio {
  sampleRate: number;
  channels: Float32Array[];
}
export interface AudioCodec {
  decode(blob: Blob): Promise<PcmAudio>;
  encode(audio: PcmAudio): Blob;
}
export type SpeechErrorCode =
  | 'NOT_AVAILABLE'
  | 'INVALID_INPUT'
  | 'MODEL_UNAVAILABLE'
  | 'LANGUAGE_UNAVAILABLE'
  | 'INTEGRITY_FAILED';
export class SpeechError extends Error {
  constructor(readonly code: SpeechErrorCode) {
    super(
      {
        LANGUAGE_UNAVAILABLE:
          'This language is unavailable for this engine. Choose a cloud voice.',
        INTEGRITY_FAILED: 'The downloaded model failed its integrity check.',
        NOT_AVAILABLE: 'This voice, language or setting is not available.',
        INVALID_INPUT: 'The speech input is invalid.',
        MODEL_UNAVAILABLE: 'The local model could not be loaded.',
      }[code],
    );
    this.name = 'SpeechError';
  }
}
