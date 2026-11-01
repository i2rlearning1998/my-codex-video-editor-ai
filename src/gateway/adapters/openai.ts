// OpenAI Chat Completions; also xAI and any OpenAI-compatible server, which
// accept the same request (fixture-tested only).
import { emptyUsage, type Transport } from '../types';
import { bad, httpAdapter, num, secret, type HttpAdapterSpec } from './http';

const spec = (
  kind: HttpAdapterSpec['kind'],
  defaultBase: string,
): HttpAdapterSpec => ({
  kind,
  defaultBase,
  build: (req, ctx, base) => ({
    url: `${base}/v1/chat/completions`,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret(ctx.provider.keyRef)}`,
    },
    body: {
      model: ctx.model.providerModel,
      max_completion_tokens: req.maxOutputTokens ?? 4096,
      messages: [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    },
  }),
  parse: (json) => {
    const r = json as {
      choices?: {
        message?: { content?: string | null };
        finish_reason?: string;
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = r?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') bad('no message');
    if (r.choices?.[0]?.finish_reason === 'length')
      bad('the answer was cut off');
    const usage = emptyUsage();
    usage.inputTokens = num(r.usage?.prompt_tokens);
    usage.outputTokens = num(r.usage?.completion_tokens);
    return { text, usage };
  },
});

export const openaiAdapter = (t?: Transport) =>
  httpAdapter(spec('openai', 'https://api.openai.com'), t);
export const xaiAdapter = (t?: Transport) =>
  httpAdapter(spec('xai', 'https://api.x.ai'), t);
export const openaiCompatibleAdapter = (t?: Transport) =>
  httpAdapter(spec('openai-compatible', 'http://localhost:8000'), t);
