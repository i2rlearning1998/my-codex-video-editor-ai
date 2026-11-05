import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sign } from 'node:crypto';
import {
  createPaymentGateways,
  crc32,
  preparePayPalCertificate,
} from '../../server/payments';
import { fakePayments } from '../fakes/payments';
it('[P3E-054] PayPal RSA/CRC32 verifies a cached certificate and rejects altered body, stale and untrusted certificate URLs', async () => {
  const fake = await fakePayments('paypal'),
    dir = mkdtempSync(path.join(tmpdir(), 'p3-cert-'));
  try {
    const key = path.join(dir, 'key.pem'),
      cert = path.join(dir, 'cert.pem');
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        cert,
        '-subj',
        '/CN=local-payment-fake',
        '-days',
        '1',
      ],
      { stdio: 'ignore' },
    );
    const certUrl = 'https://api.paypal.com/v1/notifications/certs/test',
      certificates = new Map([[certUrl, readFileSync(cert, 'utf8')]]),
      now = Date.now();
    const gateway = createPaymentGateways(
      {
        PAYPAL_CLIENT_ID: 'test-id',
        PAYPAL_CLIENT_SECRET: fake.secret,
        PAYPAL_WEBHOOK_ID: 'webhook-id',
      },
      {
        replayWindowSeconds: () => 60,
        bases: { paypal: fake.url },
        paypalCertificates: certificates,
      },
    ).paypal;
    const raw = JSON.stringify({
      id: 'event-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      create_time: new Date(now).toISOString(),
      resource: {
        id: 'capture-1',
        custom_id: JSON.stringify({
          userId: 'u',
          itemId: 'pack',
          kind: 'topup',
        }),
        amount: { currency_code: 'USD', value: '1.00' },
      },
    });
    const date = new Date(now).toISOString();
    const headers = {
      'paypal-cert-url': certUrl,
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-transmission-id': 'transmit-1',
      'paypal-transmission-time': date,
      'paypal-transmission-sig': sign(
        'RSA-SHA256',
        Buffer.from(`transmit-1|${date}|webhook-id|${crc32(raw)}`),
        readFileSync(key),
      ).toString('base64'),
    };
    expect(gateway.verifyWebhook(raw, headers, new Date(now))).toMatchObject({
      provider: 'paypal',
      paymentId: 'capture-1',
      amount: { amountMinor: 100 },
    });
    expect(() =>
      gateway.verifyWebhook(raw + ' ', headers, new Date(now)),
    ).toThrow(expect.objectContaining({ reason: 'bad-signature' }));
    expect(() =>
      gateway.verifyWebhook(raw, headers, new Date(now + 61000)),
    ).toThrow(expect.objectContaining({ reason: 'stale' }));
    let called = false;
    await expect(
      preparePayPalCertificate(
        { ...headers, 'paypal-cert-url': 'http://127.0.0.1/private' },
        async () => {
          called = true;
          throw new Error();
        },
      ),
    ).rejects.toMatchObject({ reason: 'bad-signature' });
    expect(called).toBe(false);
    const session = await gateway.createCheckout({
      userId: 'u',
      kind: 'topup',
      itemId: 'pack',
      price: { currency: 'USD', amountMinor: 100 },
      idempotencyKey: 'idempotent',
      returnUrl: 'https://editor.example/credits',
    });
    expect(session.url).toContain('paypal.com');
    expect(fake.requests.map((r) => r.path)).toEqual([
      '/v1/oauth2/token',
      '/v2/checkout/orders',
    ]);
    expect(JSON.stringify(session)).not.toContain(fake.secret);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await fake.close();
  }
});
