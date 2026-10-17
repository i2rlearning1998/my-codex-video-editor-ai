import { z } from 'zod';
import { ProviderError } from '../providers/errors';
import { speechHttp, type PaidDependencies } from './http';
import type { SttProvider } from './types';
const word = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    word: z.string(),
    punctuated_word: z.string().optional(),
  })
  .refine((w) => w.end >= w.start);
export function createDeepgram(deps: PaidDependencies = {}): SttProvider {
  const http = speechHttp(deps);
  return {
    id: 'deepgram',
    name: 'Deepgram',
    kind: 'speech-stt',
    requiresKey: true,
    keyFields: [{ id: 'apiKey', label: 'API key', secret: true }],
    languages: ['en', 'hi'],
    async transcribe(r) {
      const url = new URL('https://api.deepgram.com/v1/listen');
      url.search = new URLSearchParams({
        model: 'nova-3',
        smart_format: 'true',
        utterances: 'true',
        ...(r.lang
          ? { language: r.lang.split('-')[0]! }
          : { detect_language: 'true' }),
      }).toString();
      const raw = await http.request(
        url.href,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${http.key('deepgram')}`,
            'Content-Type': r.blob
              ? r.blob.type || 'application/octet-stream'
              : 'application/json',
          },
          body: r.blob ?? JSON.stringify({ url: r.url }),
        },
        (r) => r.json(),
        r.signal,
      );
      const parsed = z
        .object({
          results: z.object({
            channels: z
              .array(
                z.object({
                  detected_language: z.string().optional(),
                  alternatives: z
                    .array(
                      z.object({
                        transcript: z.string(),
                        words: z.array(word),
                      }),
                    )
                    .min(1),
                }),
              )
              .min(1),
            utterances: z
              .array(
                z.object({
                  start: z.number(),
                  end: z.number(),
                  transcript: z.string(),
                }),
              )
              .optional(),
          }),
        })
        .safeParse(raw);
      if (!parsed.success) throw new ProviderError('BAD_RESPONSE');
      const channel = parsed.data.results.channels[0]!,
        a = channel.alternatives[0]!,
        words = a.words.map((w) => ({
          start: w.start,
          end: w.end,
          text: w.punctuated_word ?? w.word,
        }));
      return {
        text: a.transcript,
        language: channel.detected_language ?? r.lang ?? 'und',
        words,
        segments:
          parsed.data.results.utterances?.map((s) => ({
            start: s.start,
            end: s.end,
            text: s.transcript,
          })) ?? words,
      };
    },
  };
}
