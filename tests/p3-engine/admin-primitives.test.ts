import { expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { nextAuditRow, verifyAuditChain } from '../../server/admin/audit';
import { createHttpAdminClient } from '../../src/admin-client/http';
it('[P3E-020] audit hash chain detects edited rows, gaps and reordered records', () => {
  const input = {
    at: '2026-11-05T00:00:00.000Z',
    actor: 'admin',
    action: 'credit-adjust',
    target: 'u',
    detail: { delta: 5 },
  };
  const first = nextAuditRow(null, input),
    second = nextAuditRow(first, { ...input, detail: { delta: 10 } });
  expect(verifyAuditChain([first, second])).toBe(true);
  expect(verifyAuditChain([{ ...first, detail: { delta: 500 } }, second])).toBe(
    false,
  );
  expect(verifyAuditChain([second])).toBe(false);
  expect(verifyAuditChain([second, first])).toBe(false);
  expect(verifyAuditChain([{ ...first, hash: 'bad' }])).toBe(false);
});
it('[P3E-021] admin client sends bearer in headers and request id with adjustments; errors never echo response secrets', async () => {
  const secret = randomBytes(24).toString('hex');
  const fake = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fake);
  try {
    const client = createHttpAdminClient(
      'https://admin.example.test/v1',
      () => secret,
    );
    await client.adjustCredits('u/a', 5, 'Support correction');
    const [url, init] = fake.mock.calls[0]!;
    expect(url).toBe('https://admin.example.test/v1/admin/users/u%2Fa/credits');
    expect(String(url).includes(secret)).toBe(false);
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${secret}` });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      delta: 5,
      reason: 'Support correction',
      requestId: expect.any(String),
    });
    fake.mockResolvedValue(new Response(secret, { status: 403 }));
    const attempts = [
      () => client.users({}),
      () => client.user('u'),
      () => client.adjustCredits('u', 1, 'reason'),
      () => client.setPlan('u', 'free', 'reason'),
      () => client.setSuspended('u', true, 'reason'),
      () => client.setFlag('u', 'beta', true),
      () => client.refund('p', null, 'reason', true),
      () => client.flags(),
      () => client.audit({}),
      () => client.emergency(),
      () =>
        client.setEmergency(
          {
            aiOff: true,
            signupsOff: false,
            paymentsOff: false,
            message: { en: 'Paused.' },
          },
          'reason',
        ),
      () => client.metrics({ from: 'a', to: 'b' }),
    ];
    for (const attempt of attempts)
      await expect(attempt()).rejects.toThrow(
        'Only an administrator may do that.',
      );
    fake.mockResolvedValue(
      new Response(
        JSON.stringify({
          aiOff: false,
          signupsOff: false,
          paymentsOff: false,
          message: { en: 'Ready.' },
        }),
      ),
    );
    expect((await client.emergency()).message).toEqual({ en: 'Ready.' });
    fake.mockResolvedValue(new Response('{"rows":"bad"}'));
    await expect(client.users({})).rejects.toThrow('invalid answer');
  } finally {
    vi.unstubAllGlobals();
  }
});
