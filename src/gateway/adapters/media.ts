// P2-R2 (P2B-05): media adapter shapes. Images in the OpenAI Images shape,
// voice in the ElevenLabs text-to-speech shape (audio bytes back), and a
// generic asynchronous video job (start, then poll until it is done).
import {
  emptyUsage,
  GatewayError,
  type BinaryBody,
  type ProviderAdapter,
  type Transport,
} from '../types';
import { bad, httpAdapter, num, secret } from './http';

const b64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** OpenAI-style image generation (also any compatible server). */
export const openaiImageAdapter = (t?: Transport) =>
  httpAdapter(
    {
      kind: 'openai',
      defaultBase: 'https://api.openai.com',
      build: (req, ctx, base) => ({
        url: `${base}/v1/images/generations`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret(ctx.provider.keyRef)}`,
        },
        body: {
          model: ctx.model.providerModel,
          prompt: req.prompt ?? req.messages.map((m) => m.content).join('\n'),
          n: Math.max(1, Math.min(4, Math.round(req.units ?? 1))),
          size: '1024x1024',
          response_format: 'b64_json',
        },
      }),
      parse: (json, ctx) => {
        const r = json as { data?: { b64_json?: string; url?: string }[] };
        const first = r?.data?.[0];
        if (!first || (!first.b64_json && !first.url)) bad('no image');
        const usage = emptyUsage();
        usage.images = r.data!.length;
        return {
          media: {
            kind: ctx.model.kind,
            url: first.url ?? '',
            units: usage.images,
            mime: 'image/png',
            ...(first.b64_json ? { base64: first.b64_json } : {}),
          },
          usage,
        };
      },
    },
    t,
  );

/** ElevenLabs-style text to speech: JSON in, audio bytes out. */
export function elevenlabsAdapter(t?: Transport): ProviderAdapter {
  const voiceOf = (ctx: Parameters<ProviderAdapter['buildRequest']>[1]) =>
    encodeURIComponent(ctx.model.providerModel.split('/')[1] ?? 'default');
  const modelOf = (ctx: Parameters<ProviderAdapter['buildRequest']>[1]) =>
    ctx.model.providerModel.split('/')[0]!;
  const self: ProviderAdapter = {
    kind: 'elevenlabs',
    connected: () => !!t,
    buildRequest: (req, ctx) => ({
      url: `${(ctx.provider.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/$/, '')}/v1/text-to-speech/${voiceOf(ctx)}`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'audio/mpeg',
        'xi-api-key': secret(ctx.provider.keyRef),
      },
      body: {
        text: req.prompt ?? req.messages.map((m) => m.content).join('\n'),
        model_id: modelOf(ctx),
      },
      expect: 'binary',
    }),
    parseResponse: (body, ctx) => {
      const r = body as BinaryBody;
      if (!r?.binary || !r.binary.length) bad('no audio');
      if (!/^audio\//.test(r.contentType)) bad('not audio');
      const usage = emptyUsage();
      // Priced per minute: 900 characters of speech is about one minute.
      usage.minutes = Math.max(
        1 / 60,
        ((self as { lastChars?: number }).lastChars ?? 0) / 900,
      );
      return {
        media: {
          kind: ctx.model.kind,
          url: '',
          units: usage.minutes,
          mime: r.contentType,
          base64: b64(r.binary),
        },
        usage,
      };
    },
    async call(req, ctx) {
      if (!t)
        throw new GatewayError(
          'not-connected',
          `${ctx.provider.name} is not connected yet.`,
        );
      const http = self.buildRequest(req, ctx);
      (self as { lastChars?: number }).lastChars = String(
        (http.body as { text: string }).text,
      ).length;
      return self.parseResponse(await t(http), ctx);
    },
  };
  return self;
}

/** A generic asynchronous video job: POST /v1/jobs, then GET /v1/jobs/{id}. */
export function videoJobsAdapter(
  t?: Transport,
  o: {
    pollMs?: number;
    maxPolls?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): ProviderAdapter {
  const sleep =
    o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const base = (ctx: Parameters<ProviderAdapter['buildRequest']>[1]) =>
    (ctx.provider.baseUrl ?? 'https://video.invalid').replace(/\/$/, '');
  const self: ProviderAdapter = {
    kind: 'video-jobs',
    connected: () => !!t,
    buildRequest: (req, ctx) => ({
      url: `${base(ctx)}/v1/jobs`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret(ctx.provider.keyRef)}`,
      },
      body: {
        model: ctx.model.providerModel,
        prompt: req.prompt ?? '',
        seconds: Math.max(1, Math.round(req.units ?? 5)),
      },
    }),
    parseResponse: (json, ctx) => {
      const r = json as {
        status?: string;
        output_url?: string;
        seconds?: number;
        error?: string;
      };
      if (r?.status !== 'succeeded' || !r.output_url)
        bad('the video job did not finish');
      const usage = emptyUsage();
      usage.seconds = num(r.seconds) || 5;
      return {
        media: {
          kind: ctx.model.kind,
          url: r.output_url!,
          units: usage.seconds,
          mime: 'video/mp4',
        },
        usage,
      };
    },
    async call(req, ctx) {
      if (!t)
        throw new GatewayError(
          'not-connected',
          `${ctx.provider.name} is not connected yet.`,
        );
      const start = (await t(self.buildRequest(req, ctx))) as { id?: string };
      if (!start?.id) bad('no job id');
      const auth = { authorization: `Bearer ${secret(ctx.provider.keyRef)}` };
      for (let i = 0; i < (o.maxPolls ?? 60); i++) {
        const r = (await t({
          url: `${base(ctx)}/v1/jobs/${encodeURIComponent(start.id!)}`,
          method: 'GET',
          headers: auth,
          body: null,
        })) as { status?: string; error?: string };
        if (r?.status === 'failed')
          throw new GatewayError(
            'provider-error',
            `${ctx.provider.name} could not make the video.`,
          );
        if (r?.status === 'succeeded') return self.parseResponse(r, ctx);
        await sleep(o.pollMs ?? 2000);
      }
      throw new GatewayError(
        'timeout',
        `${ctx.provider.name} took too long to make the video.`,
      );
    },
  };
  return self;
}
