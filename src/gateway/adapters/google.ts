// Google Gemini generateContent (fixture-tested only).
import { emptyUsage, type Transport } from '../types';
import { bad, httpAdapter, num, secret } from './http';

export const googleAdapter = (transport?: Transport) =>
  httpAdapter(
    {
      kind: 'google',
      defaultBase: 'https://generativelanguage.googleapis.com',
      build: (req, ctx, base) => ({
        url: `${base}/v1beta/models/${encodeURIComponent(ctx.model.providerModel)}:generateContent`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': secret(ctx.provider.keyRef),
        },
        body: {
          ...(req.system
            ? { systemInstruction: { parts: [{ text: req.system }] } }
            : {}),
          contents: req.messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            maxOutputTokens: req.maxOutputTokens ?? 4096,
            ...(req.json ? { responseMimeType: 'application/json' } : {}),
          },
        },
      }),
      parse: (json) => {
        const r = json as {
          candidates?: {
            content?: { parts?: { text?: string }[] };
            finishReason?: string;
          }[];
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
          };
        };
        const parts = r?.candidates?.[0]?.content?.parts;
        if (!Array.isArray(parts)) bad('no candidate');
        if (r.candidates?.[0]?.finishReason === 'MAX_TOKENS')
          bad('the answer was cut off');
        const usage = emptyUsage();
        usage.inputTokens = num(r.usageMetadata?.promptTokenCount);
        usage.outputTokens = num(r.usageMetadata?.candidatesTokenCount);
        return { text: parts.map((p) => p.text ?? '').join(''), usage };
      },
    },
    transport,
  );
