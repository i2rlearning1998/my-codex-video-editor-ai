import { expect, it } from 'vitest';
import { memoryStore } from '../../server/store';
import { PaymentAwarePeople } from '../../server/payments/people';
it('[P3E-057] gateway refresh sees payment credits and refuses spending after an external revocation', async () => {
  const store = memoryStore(),
    now = () => Date.parse('2026-11-05T10:00:00.000Z');
  await store.saveProfile({
    id: 'u',
    email: 'u@example.test',
    plan: 'free',
    locale: 'en',
    brandKit: {},
    createdAt: new Date(now()).toISOString(),
  });
  const people = new PaymentAwarePeople(store, now);
  await people.ready('u');
  expect(people.ledgerNow('u').balance()).toBe(0);
  await store.appendLedger('u', [
    {
      id: 'payment',
      key: 'payment',
      type: 'grant',
      delta: 10,
      at: new Date(now()).toISOString(),
      note: '',
    },
  ]);
  await people.withLedger('u', (l) => {
    expect(l.balance()).toBe(10);
    l.reserve(7, 'job');
  });
  await store.appendLedger('u', [
    {
      id: 'revoke',
      key: 'revoke',
      type: 'adjust',
      delta: -3,
      at: new Date(now()).toISOString(),
      note: '',
    },
  ]);
  await expect(
    people.withLedger('u', (l) => l.reserve(1, 'job2')),
  ).rejects.toThrow();
  expect((await store.ledger('u')).reduce((s, r) => s + r.delta, 0)).toBe(0);
  await expect(
    store.appendLedger('u', [
      {
        id: 'race',
        key: 'race',
        type: 'reserve',
        delta: -1,
        at: new Date(now()).toISOString(),
        note: '',
      },
    ]),
  ).rejects.toThrow();
});
