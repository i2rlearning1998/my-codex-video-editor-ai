import { z } from 'zod';
import { ProviderError } from '../providers/errors';
import { speechHttp, type PaidDependencies } from './http';
import { decodeSpeechAudio } from './base64';
import { filterVoices, languageBase } from './languages';
import { SpeechError, type TtsProvider } from './types';
export const SARVAM_LANGUAGES = [
  'hi-IN',
  'en-IN',
  'bn-IN',
  'gu-IN',
  'kn-IN',
  'ml-IN',
  'mr-IN',
  'od-IN',
  'pa-IN',
  'ta-IN',
  'te-IN',
] as const;
/** Curated subset of documented Bulbul v3 speakers, not cloned voices. */
export const SARVAM_SPEAKERS = ['shubh', 'aditya', 'ritu', 'priya'] as const;
export function createSarvam(deps: PaidDependencies = {}): TtsProvider {
  const http = speechHttp(deps);
  return {
    id: 'sarvam',
    name: 'Sarvam AI',
    kind: 'speech-tts',
    requiresKey: true,
    keyFields: [{ id: 'apiKey', label: 'API subscription key', secret: true }],
    async listVoices(lang) {
      return filterVoices(
        SARVAM_LANGUAGES.flatMap((lang) =>
          SARVAM_SPEAKERS.map((id) => ({ id, name: id, lang })),
        ),
        lang,
      );
    },
    async synthesize(r) {
      const lang = SARVAM_LANGUAGES.find(
        (l) => languageBase(l) === languageBase(r.lang),
      );
      if (!lang) throw new SpeechError('LANGUAGE_UNAVAILABLE');
      if (
        !r.text.trim() ||
        r.text.length > 2500 ||
        !SARVAM_SPEAKERS.some((s) => s === r.voiceId) ||
        !Number.isFinite(r.rate ?? 1) ||
        (r.rate ?? 1) < 0.5 ||
        (r.rate ?? 1) > 2
      )
        throw new SpeechError('INVALID_INPUT');
      if ((r.pitch ?? 1) !== 1) throw new SpeechError('NOT_AVAILABLE');
      const raw = await http.request(
        'https://api.sarvam.ai/text-to-speech',
        {
          method: 'POST',
          headers: {
            'api-subscription-key': http.key('sarvam'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: r.text,
            language_code: lang,
            speaker: r.voiceId,
            model: 'bulbul:v3',
            pace: r.rate ?? 1,
            output_audio_codec: 'wav',
            speech_sample_rate: 24000,
          }),
        },
        (r) => r.json(),
        r.signal,
      );
      const parsed = z
        .object({ audios: z.array(z.string()).length(1) })
        .safeParse(raw);
      if (!parsed.success) throw new ProviderError('BAD_RESPONSE');
      return decodeSpeechAudio(
        parsed.data.audios[0]!,
        'audio/wav',
        http.codec,
        r.signal,
      );
    },
  };
}
