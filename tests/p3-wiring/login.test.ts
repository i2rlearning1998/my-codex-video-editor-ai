// P3-WIRING W8: the sign-in guard, the same-message rule, suspension,
// session revocation on the server, and the password rule from config.
import { describe, expect, it } from 'vitest';
import { createAuth, signLocalToken } from '../../server/auth';
import { localAccountBackend, memoryBlobStore } from '../../src/cloud/local';
import {
  createLoginGuard,
  LoginRefusedError,
  memoryKV,
  passwordProblem,
} from '../../src/cloud/login-guard';
import { defaultConfig, loginLimits } from '../../src/platform-config';

function guardAt(start = Date.parse('2026-11-05T10:00:00Z')) {
  let t = start;
  const config = defaultConfig();
  const guard = createLoginGuard({
    limits: () => loginLimits(config),
    kv: memoryKV(),
    now: () => t,
  });
  return { guard, config, tick: (s: number) => (t += s * 1000) };
}

describe('P3-WIRING login hardening', () => {
  it('[P3W-030] failures lock the email, each further failure doubles the lock, and the window forgets old ones', async () => {
    const { guard, config, tick } = guardAt();
    const l = config.p3.login;
    expect(config.p3.sample).toBe(true);
    for (let i = 0; i < l.maxFailuresPerEmail - 1; i++) {
      expect((await guard.beforeAttempt('a@x.com', '1.1.1.1')).ok).toBe(true);
      await guard.afterFailure('a@x.com', '1.1.1.1');
    }
    expect((await guard.beforeAttempt('a@x.com', '1.1.1.1')).ok).toBe(true);
    await guard.afterFailure('A@X.com ', '1.1.1.1'); // same email, any case
    const r = await guard.beforeAttempt('a@x.com', '2.2.2.2');
    expect(r).toEqual({
      ok: false,
      failure: {
        code: 'sign-in-locked',
        message: expect.objectContaining({
          en: 'Too many tries. Wait 1 minute and try again.',
        }),
      },
    });
    tick(l.lockSeconds + 1);
    expect((await guard.beforeAttempt('a@x.com', '2.2.2.2')).ok).toBe(true);
    await guard.afterFailure('a@x.com', '2.2.2.2');
    const twice = await guard.beforeAttempt('a@x.com', '2.2.2.2');
    expect(!twice.ok && twice.failure.message.en).toBe(
      `Too many tries. Wait ${Math.ceil((l.lockSeconds * 2) / 60)} minutes and try again.`,
    );
    // The window forgets; a success clears the email.
    tick(l.windowSeconds + l.maxLockSeconds);
    expect((await guard.beforeAttempt('a@x.com', '2.2.2.2')).ok).toBe(true);
    await guard.afterFailure('a@x.com', '2.2.2.2');
    await guard.afterSuccess('a@x.com', '2.2.2.2');
    expect((await guard.beforeAttempt('a@x.com', '2.2.2.2')).ok).toBe(true);
  });

  it('[P3W-030] one IP trying many emails is locked too; the lock never passes the maximum', async () => {
    const { guard, config } = guardAt();
    config.p3.login.maxFailuresPerIp = 3;
    config.p3.login.maxLockSeconds = 90;
    for (let i = 0; i < 6; i++)
      await guard.afterFailure(`p${i}@x.com`, '9.9.9.9');
    const r = await guard.beforeAttempt('fresh@x.com', '9.9.9.9');
    expect(!r.ok && r.failure.message.en).toBe(
      'Too many tries. Wait 2 minutes and try again.',
    );
    expect((await guard.beforeAttempt('fresh@x.com', '8.8.8.8')).ok).toBe(true);
  });

  it('[P3W-031] the local backend says one sentence for an unknown email and a wrong password, and goes through the guard', async () => {
    const { guard } = guardAt();
    const b = localAccountBackend({
      storage: memoryKV() as unknown as Storage,
      blobs: memoryBlobStore(),
      guard,
      ip: () => '5.5.5.5',
    });
    await b.signUp('meera@example.com', 'a-long-password-1');
    await b.signOut();
    const msg = async (email: string, pw: string) =>
      b.signIn(email, pw).then(
        () => 'ok',
        (e: Error) => e.message,
      );
    const unknown = await msg('nobody@example.com', 'whatever-1234');
    const wrong = await msg('meera@example.com', 'wrong-password-1');
    expect(unknown).toBe('The email or password is wrong');
    expect(wrong).toBe(unknown);
    for (let i = 0; i < 4; i++)
      await msg('meera@example.com', 'wrong-password-1');
    // Locked: even the right password is refused until the lock ends.
    const locked = await b
      .signIn('meera@example.com', 'a-long-password-1')
      .catch((e) => e);
    expect(locked).toBeInstanceOf(LoginRefusedError);
    expect((locked as LoginRefusedError).failure.code).toBe('sign-in-locked');
  });

  it('[P3W-032] a suspended person cannot sign in (told only after the right password); the server refuses suspended people and revoked sessions', async () => {
    const { config } = guardAt();
    const guard = createLoginGuard({
      limits: () => loginLimits(config),
      kv: memoryKV(),
      // Injected (rev 1.3 note 8); the integrator wires Part 1's flag.
      isSuspended: async (email) => email === 'paused@example.com',
    });
    const b = localAccountBackend({
      storage: memoryKV() as unknown as Storage,
      blobs: memoryBlobStore(),
      guard,
    });
    await b.signUp('paused@example.com', 'a-long-password-1');
    await b.signOut();
    await expect(
      b.signIn('paused@example.com', 'wrong-password-1'),
    ).rejects.toThrow('The email or password is wrong');
    await expect(
      b.signIn('paused@example.com', 'a-long-password-1'),
    ).rejects.toThrow('This account is paused.');
    expect(await guard.isSuspended('PAUSED@example.com ')).toBe(true);
    expect(await guard.isSuspended('other@example.com')).toBe(false);
    expect(await b.user()).toBeNull();
    const secret = 'server-secret-0123456789abcdef0123';
    const now = 1_800_000_000;
    const auth = createAuth({
      mode: 'local',
      hsSecret: secret,
      now: () => now,
      suspended: (id) => id === 'user-paused',
      sessionsValidFrom: (id) => (id === 'user-changed' ? now - 10 : null),
    });
    const bearer = (sub: string, iat = now - 100) =>
      `Bearer ${signLocalToken(secret, { sub }, iat)}`;
    await expect(auth(bearer('user-paused'))).rejects.toThrow(
      'This account is paused.',
    );
    await expect(auth(bearer('user-changed'))).rejects.toThrow(
      'Your password was changed. Please log in again.',
    );
    expect((await auth(bearer('user-changed', now - 5))).userId).toBe(
      'user-changed',
    );
    expect((await auth(bearer('user-ok'))).userId).toBe('user-ok');
  });

  it('[P3W-033] the password rule at sign-up and reset comes from config', async () => {
    const config = defaultConfig();
    const min = config.p3.login.minPasswordLength;
    expect(passwordProblem('short', min)).toBe(
      `Use at least ${min} characters for the password`,
    );
    expect(passwordProblem('aaaaaaaaaaaaaaaa', min)).toMatch(
      /repeated character/,
    );
    expect(passwordProblem('me@example.com', 6, 'me@example.com')).toMatch(
      /email/,
    );
    const b = localAccountBackend({
      storage: memoryKV() as unknown as Storage,
      blobs: memoryBlobStore(),
      minPassword: () => min,
    });
    await expect(
      b.signUp('new@example.com', 'x'.repeat(3) + '12345'),
    ).rejects.toThrow(`Use at least ${min} characters`);
    await b.signUp('new@example.com', 'a-long-password-1');
    await b.requestPasswordReset('new@example.com');
    const code = b.lastResetCode('new@example.com')!;
    await expect(
      b.confirmPasswordReset('new@example.com', code, 'tiny-1'),
    ).rejects.toThrow(`Use at least ${min} characters`);
  });
});
