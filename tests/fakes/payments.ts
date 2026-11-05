import { createServer } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
/** Local provider-shaped HTTP fake; never calls a real payment service. */
export async function fakePayments(provider: 'stripe' | 'razorpay' | 'paypal') {
  const secret = randomBytes(32).toString('hex');
  const requests: { path: string; body: string; authorization: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += String(c);
    requests.push({
      path: req.url ?? '',
      body,
      authorization: req.headers.authorization ?? '',
    });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/oauth2/token')
      res.end(JSON.stringify({ access_token: secret, token_type: 'Bearer' }));
    else if (req.url?.endsWith('/refund') || req.url === '/v1/refunds')
      res.end(JSON.stringify({ id: 'refund-1', status: 'succeeded' }));
    else
      res.end(
        JSON.stringify({
          id: 'checkout-1',
          url: 'https://checkout.stripe.com/test',
          short_url: 'https://rzp.io/test',
          links: [
            {
              rel: 'payer-action',
              href: 'https://www.paypal.com/checkoutnow?token=test',
            },
          ],
        }),
      );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('No fake port.');
  return {
    secret,
    requests,
    url: `http://127.0.0.1:${addr.port}`,
    headers(raw: string, t: number) {
      return provider === 'stripe'
        ? {
            'stripe-signature': `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`,
          }
        : {
            'x-razorpay-signature': createHmac('sha256', secret)
              .update(raw)
              .digest('hex'),
            'x-razorpay-event-id': 'evt-1',
          };
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  };
}
