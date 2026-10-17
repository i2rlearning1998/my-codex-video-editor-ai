import { z } from 'zod';
import { ProviderError } from '../providers/errors';
import { speechHttp, type PaidDependencies } from './http';
import { SpeechError, type TtsProvider } from './types';
export function createElevenLabs(deps: PaidDependencies = {}): TtsProvider {
  const http = speechHttp(deps);
  return {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    kind: 'speech-tts',
    requiresKey: true,
    keyFields: [{ id: 'apiKey', label: 'API key', secret: true }],
    async listVoices(_lang) {
      const raw = await http.request(
        'https://api.elevenlabs.io/v1/voices',
        { headers: { 'xi-api-key': http.key('elevenlabs') } },
        (r) => r.json(),
      );
      const parsed = z
        .object({
          voices: z.array(
            z.object({
              voice_id: z.string(),
              name: z.string(),
              labels: z.record(z.string()).optional(),
            }),
          ),
        })
        .safeParse(raw);
      if (!parsed.success) throw new ProviderError('BAD_RESPONSE');
      return parsed.data.voices.map((v) => ({
        id: v.voice_id,
        name: v.name,
        lang: v.labels?.language ?? 'und',
      }));
    },
    async synthesize(r) {
      if (
        !r.text.trim() ||
        !r.voiceId ||
        !Number.isFinite(r.rate ?? 1) ||
        (r.rate ?? 1) < 0.7 ||
        (r.rate ?? 1) > 1.2
      )
        throw new SpeechError('INVALID_INPUT');
      if ((r.pitch ?? 1) !== 1) throw new SpeechError('NOT_AVAILABLE');
      const blob = await http.request(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(r.voiceId)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': http.key('elevenlabs'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: r.text,
            model_id: 'eleven_multilingual_v2',
            language_code: r.lang.split('-')[0],
            voice_settings: { speed: r.rate ?? 1 },
          }),
        },
        async (response) =>
          new Blob([await response.arrayBuffer()], { type: 'audio/mpeg' }),
        r.signal,
      );
      const audio = await http.codec.decode(blob);
      return {
        blob,
        mime: 'audio/mpeg',
        durationSec: (audio.channels[0]?.length ?? 0) / audio.sampleRate,
      };
    },
  };
}
