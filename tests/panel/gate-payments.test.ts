// P2-R1: the editor's login gate reads the same account store the website
// signs in to; payments come from config and only the mock moves (fake) money.
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_STORE_KEY,
  loginUrl,
  readHandoff,
  signedInUserId,
} from '../../src/auth-gate';
import {
  LOCAL_CLOUD_KEY,
  localAccountBackend,
  memoryBlobStore,
} from '../../src/cloud/local';
import { paymentProviders } from '../../src/payments';
import { defaultConfig } from '../../src/platform-config';

const kv = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe('P2-R1 gate and payments', () => {
  it('[P2R1-018] the editor gate sees a session only after sign-in, and sends visitors to the website log-in', async () => {
    expect(ACCOUNT_STORE_KEY).toBe(LOCAL_CLOUD_KEY);
    const store = kv();
    expect(signedInUserId(store)).toBeNull();
    const cloud = localAccountBackend({
      storage: store,
      blobs: memoryBlobStore(),
    });
    const user = await cloud.signUp('a@b.co', 'long enough');
    expect(signedInUserId(store)).toBe(user.id);
    await cloud.signOut();
    expect(signedInUserId(store)).toBeNull();
    expect(signedInUserId({ getItem: () => '{broken' })).toBeNull();
    // A session that names no user is not a session.
    expect(
      signedInUserId({
        getItem: () => JSON.stringify({ session: 'x', users: [] }),
      }),
    ).toBeNull();
    expect(loginUrl('/?open=p1')).toBe('/site/#/login?next=%2F%3Fopen%3Dp1');
    expect(readHandoff('?open=p1')).toEqual({ kind: 'open', projectId: 'p1' });
    expect(readHandoff('?handoff=build-abc')).toEqual({
      kind: 'plan',
      id: 'build-abc',
    });
    expect(readHandoff('?handoff=../../x')).toBeNull();
    expect(readHandoff('?new=Lesson&aspect=9:16')).toEqual({
      kind: 'new',
      name: 'Lesson',
      aspect: '9:16',
    });
    expect(readHandoff('')).toBeNull();
  });
  it('[P2R1-006] payment providers from config: the mock pays once per key; real ones say not connected; currency is respected', async () => {
    const c = defaultConfig();
    const inr = paymentProviders(c, 'INR');
    expect(inr.map((p) => p.kind)).toEqual(['mock']);
    const a = await inr[0]!.pay({
      credits: 200,
      amount: 199,
      currency: 'INR',
      key: 'k1',
    });
    const b = await inr[0]!.pay({
      credits: 200,
      amount: 199,
      currency: 'INR',
      key: 'k1',
    });
    expect(a).toEqual(b);
    c.payments.find((p) => p.id === 'razorpay')!.enabled = true;
    const razor = paymentProviders(c, 'INR', 'IN').find(
      (p) => p.kind === 'razorpay',
    )!;
    expect(
      await razor.pay({ credits: 1, amount: 1, currency: 'INR', key: 'z' }),
    ).toEqual({ ok: false, message: 'Razorpay is not connected yet.' });
    expect(paymentProviders(c, 'USD', 'IN').map((p) => p.kind)).toEqual([
      'mock',
    ]);
  });
});
