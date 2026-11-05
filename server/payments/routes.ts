import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { WebhookError, type PaymentProviderId } from '../../src/contracts/p3';
import type { Caller } from '../auth';
import {
  createPaymentService,
  PaymentHttpError,
  type PaymentDeps,
} from './service';
import { preparePayPalCertificate } from './index';
export type RouteReply = { status: number; body: unknown };
export function routeError(e: unknown): RouteReply {
  if (e instanceof PaymentHttpError)
    return {
      status: e.status,
      body: { error: { code: e.code, message: e.message } },
    };
  if (e instanceof WebhookError)
    return {
      status: 400,
      body: { error: { code: e.reason, message: e.message } },
    };
  if (e instanceof z.ZodError)
    return {
      status: 400,
      body: {
        error: {
          code: 'bad-request',
          message: 'The request fields are not valid.',
        },
      },
    };
  return {
    status: 503,
    body: {
      error: {
        code: 'unavailable',
        message:
          'The operation could not be finished. Please check its status before retrying.',
      },
    },
  };
}
export async function rawBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const part of req) {
    const b = Buffer.from(part as Uint8Array);
    size += b.length;
    if (size > 256 * 1024)
      throw new PaymentHttpError(413, 'too-large', 'The request is too large.');
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export function writeReply(res: ServerResponse, r: RouteReply) {
  res.writeHead(r.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(r.body));
}
export function createPaymentRoutes(d: PaymentDeps, fetcher?: typeof fetch) {
  const service = createPaymentService(d);
  return {
    service,
    async webhook(
      provider: string,
      raw: string,
      headers: Readonly<Record<string, string>>,
    ): Promise<RouteReply> {
      try {
        if (!['razorpay', 'stripe', 'paypal'].includes(provider))
          throw new PaymentHttpError(404, 'not-found', 'Not found.');
        if (provider === 'paypal')
          await preparePayPalCertificate(headers, fetcher);
        const event = d.gateways[provider as PaymentProviderId].verifyWebhook(
          raw,
          headers,
          new Date((d.now ?? Date.now)()),
        );
        const result = await service.apply(
          event,
          await service.revocationFor(event),
        );
        return { status: 200, body: result };
      } catch (e) {
        return routeError(e);
      }
    },
    async authenticated(
      path: string,
      method: string,
      body: unknown,
      caller: Caller,
    ): Promise<RouteReply | null> {
      try {
        if (method === 'POST' && path === '/v1/payments/checkout')
          return {
            status: 200,
            body: await service.checkout(caller.userId, body),
          };
        if (method === 'GET' && path === '/v1/payments/me')
          return { status: 200, body: await d.store.payments(caller.userId) };
        return null;
      } catch (e) {
        return routeError(e);
      }
    },
  };
}
