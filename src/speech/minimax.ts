import { filterVoices, languageBase } from './languages';
import { z } from 'zod';
import { ProviderError } from '../providers/errors';
import { speechHttp, type PaidDependencies } from './http';
import { SpeechError, type TtsProvider } from './types';
const status = z.object({ base_resp: z.object({ status_code: z.number() }) });
function checked(raw: unknown) {
  const r = status.safeParse(raw);
  if (!r.success) throw new ProviderError('BAD_RESPONSE');
  if (r.data.base_resp.status_code !== 0)
    throw new ProviderError(
      r.data.base_resp.status_code === 1004
        ? 'KEY_INVALID'
        : r.data.base_resp.status_code === 1002
          ? 'RATE_LIMITED'
          : 'BAD_RESPONSE',
    );
}
export function createMiniMax(deps: PaidDependencies = {}): TtsProvider {
  const http = speechHttp(deps),
    headers = () => ({
      Authorization: `Bearer ${http.key('minimax')}`,
      'Content-Type': 'application/json',
    });
  return {
    id: 'minimax',
    name: 'MiniMax',
    kind: 'speech-tts',
    requiresKey: true,
    keyFields: [{ id: 'apiKey', label: 'API key', secret: true }],
    async listVoices(lang) {
      const raw = await http.request(
        'https://api.minimax.io/v1/get_voice',
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ voice_type: 'system' }),
        },
        (r) => r.json(),
      );
      checked(raw);
      const r = z
        .object({
          system_voice: z.array(
            z.object({
              voice_id: z.string(),
              voice_name: z.string().optional(),
            }),
          ),
        })
        .safeParse(raw);
      if (!r.success) throw new ProviderError('BAD_RESPONSE');
      return filterVoices(
        r.data.system_voice.map((v) => ({
          id: v.voice_id,
          name: v.voice_name ?? v.voice_id,
          lang: ['english', 'hindi'].includes(
            v.voice_id.split('_')[0]!.toLowerCase(),
          )
            ? languageBase(v.voice_id.split('_')[0]!)
            : 'und',
        })),
        lang,
      );
    },
    async synthesize(r) {
      if (
        !r.text.trim() ||
        !r.voiceId ||
        !Number.isFinite(r.rate ?? 1) ||
        (r.rate ?? 1) < 0.5 ||
        (r.rate ?? 1) > 2 ||
        !Number.isFinite(r.pitch ?? 1) ||
        (r.pitch ?? 1) < 0.5 ||
        (r.pitch ?? 1) > 2
      )
        throw new SpeechError('INVALID_INPUT');
      const raw = await http.request(
        'https://api.minimax.io/v1/t2a_v2',
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            model: 'speech-2.6-hd',
            text: r.text,
            stream: false,
            output_format: 'hex',
            voice_setting: {
              voice_id: r.voiceId,
              speed: r.rate ?? 1,
              pitch: Math.round(12 * Math.log2(r.pitch ?? 1)),
              vol: 1,
            },
            audio_setting: {
              sample_rate: 32000,
              bitrate: 128000,
              format: 'mp3',
              channel: 1,
            },
          }),
        },
        (r) => r.json(),
        r.signal,
      );
      checked(raw);
      const parsed = z
        .object({
          data: z.object({ audio: z.string().regex(/^(?:[0-9a-f]{2})+$/i) }),
        })
        .safeParse(raw);
      if (!parsed.success) throw new ProviderError('BAD_RESPONSE');
      const hex = parsed.data.data.audio,
        bytes = Uint8Array.from(hex.match(/../g)!, (v) => parseInt(v, 16)),
        blob = new Blob([bytes], { type: 'audio/mpeg' }),
        audio = await http.codec.decode(blob);
      return {
        blob,
        mime: blob.type,
        durationSec: (audio.channels[0]?.length ?? 0) / audio.sampleRate,
      };
    },
  };
}
