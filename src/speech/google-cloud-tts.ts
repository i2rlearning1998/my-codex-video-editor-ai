import { z } from 'zod';
import { ProviderError } from '../providers/errors';
import { speechHttp, type PaidDependencies } from './http';
import { decodeSpeechAudio } from './base64';
import { filterVoices } from './languages';
import { SpeechError, type TtsProvider } from './types';
export function createGoogleCloudTts(deps: PaidDependencies = {}): TtsProvider {
  const http = speechHttp(deps),
    headers = () => ({
      'x-goog-api-key': http.key('google-cloud-tts'),
      'Content-Type': 'application/json',
    });
  return {
    id: 'google-cloud-tts',
    name: 'Google Cloud Text-to-Speech',
    kind: 'speech-tts',
    requiresKey: true,
    keyFields: [{ id: 'apiKey', label: 'Google Cloud API key', secret: true }],
    async listVoices(lang) {
      const url = new URL('https://texttospeech.googleapis.com/v1/voices');
      if (lang) url.searchParams.set('languageCode', lang);
      const raw = await http.request(url.href, { headers: headers() }, (r) =>
        r.json(),
      );
      const parsed = z
        .object({
          voices: z.array(
            z.object({ name: z.string(), languageCodes: z.array(z.string()) }),
          ),
        })
        .safeParse(raw);
      if (!parsed.success) throw new ProviderError('BAD_RESPONSE');
      return filterVoices(
        parsed.data.voices.flatMap((v) =>
          v.languageCodes.map((lang) => ({ id: v.name, name: v.name, lang })),
        ),
        lang,
      );
    },
    async synthesize(r) {
      const rate = r.rate ?? 1,
        pitch = r.pitch ?? 1;
      if (
        !r.text.trim() ||
        new TextEncoder().encode(r.text).length > 5000 ||
        !r.voiceId ||
        !r.lang ||
        !Number.isFinite(rate) ||
        rate < 0.25 ||
        rate > 4 ||
        !Number.isFinite(pitch) ||
        pitch <= 0 ||
        Math.abs(12 * Math.log2(pitch)) > 20
      )
        throw new SpeechError('INVALID_INPUT');
      const raw = await http.request(
        'https://texttospeech.googleapis.com/v1/text:synthesize',
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            input: { text: r.text },
            voice: { languageCode: r.lang, name: r.voiceId },
            audioConfig: {
              audioEncoding: 'LINEAR16',
              speakingRate: rate,
              pitch: 12 * Math.log2(pitch),
            },
          }),
        },
        (r) => r.json(),
        r.signal,
      );
      const parsed = z.object({ audioContent: z.string() }).safeParse(raw);
      if (!parsed.success) throw new ProviderError('BAD_RESPONSE');
      return decodeSpeechAudio(
        parsed.data.audioContent,
        'audio/wav',
        http.codec,
        r.signal,
      );
    },
  };
}
