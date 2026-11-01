// Anthropic Messages API (request shape from the public docs; fixture-tested).
import { emptyUsage, type Transport } from '../types';
import { bad, httpAdapter, num, secret } from './http';

export const anthropicAdapter = (transport?: Transport) =>
  httpAdapter(
    {
      kind: 'anthropic',
      defaultBase: 'https://api.anthropic.com',
      build: (req, ctx, base) => ({
        url: `${base}/v1/messages`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': secret(ctx.provider.keyRef),
          'anthropic-version': '2023-06-01',
        },
        body: {
          model: ctx.model.providerModel,
          max_tokens: req.maxOutputTokens ?? 4096,
          ...(req.system ? { system: req.system } : {}),
          messages: req.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
      }),
      parse: (json) => {
        const r = json as {
          content?: { type: string; text?: string }[];
          usage?: { input_tokens?: number; output_tokens?: number };
          type?: string;
        };
        if (!r || r.type === 'error' || !Array.isArray(r.content))
          bad('no content');
        const text = r.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('');
        const usage = emptyUsage();
        usage.inputTokens = num(r.usage?.input_tokens);
        usage.outputTokens = num(r.usage?.output_tokens);
        return { text, usage };
      },
    },
    transport,
  );
