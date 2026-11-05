// P3-WIRING (W8): the sign-in guard (LoginGuard). Failures are counted per
// email and per IP inside a window; past the limit the email (or IP) is
// locked, and every further failure doubles the lock, up to a maximum. The
// limits are the owner's samples in config (`p3.login`) until set in Admin.
// One sentence for every refusal, so it never tells whether an email exists.
// Pure: no DOM; the counters live in a small key-value store.
import type { LoginGuard, P3Failure, Result } from '../contracts/p3';

export interface LoginLimits {
  readonly maxFailuresPerEmail: number;
  readonly maxFailuresPerIp: number;
  readonly lockSeconds: number;
  readonly maxLockSeconds: number;
  readonly windowSeconds: number;
  readonly minPasswordLength: number;
}
export interface GuardKV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function memoryKV(): GuardKV {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

interface Counter {
  /** Failure times (ms) inside the window. */
  fails: number[];
  /** Locked until (ms), or 0. */
  until: number;
}
/** The one sentence a failed sign-in shows (unknown email = wrong password). */
export const SIGN_IN_FAILED: P3Failure = {
  code: 'sign-in-failed',
  message: {
    en: 'The email or password is wrong',
    hi: 'ईमेल या पासवर्ड ग़लत है।',
  },
};
export const lockedFailure = (seconds: number): P3Failure => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return {
    code: 'sign-in-locked',
    message: {
      en: `Too many tries. Wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
      hi: `बहुत सारी कोशिशें। ${minutes} मिनट रुककर फिर कोशिश करें।`,
    },
  };
};
export class LoginRefusedError extends Error {
  constructor(readonly failure: P3Failure) {
    super(failure.message.en);
    this.name = 'LoginRefusedError';
  }
}

export interface GuardDeps {
  readonly limits: () => LoginLimits;
  readonly kv: GuardKV;
  readonly now?: () => number;
  /**
   * CONTRACTS-P3 rev 1.3 note 8: the owner's suspended flag, injected (the
   * integrator wires it to Part 1's profile flag; the guard never reads the
   * Store).
   */
  readonly isSuspended?: (email: string) => Promise<boolean>;
}
/** The guard, plus the suspended check a backend asks after the right password. */
export interface SignInGuard extends LoginGuard {
  isSuspended(email: string): Promise<boolean>;
}
/** The one sentence a suspended person sees. */
export const SUSPENDED: P3Failure = {
  code: 'suspended',
  message: {
    en: 'This account is paused. Contact support.',
    hi: 'यह खाता रोका गया है। सहायता से संपर्क करें।',
  },
};
export function createLoginGuard(d: GuardDeps): SignInGuard {
  const now = () => (d.now ?? Date.now)();
  const key = (kind: 'email' | 'ip', v: string) =>
    `aive.login.${kind}.${encodeURIComponent(v.trim().toLowerCase())}`;
  const get = (k: string): Counter => {
    try {
      const v = JSON.parse(d.kv.getItem(k) ?? '') as Counter;
      if (Array.isArray(v.fails) && typeof v.until === 'number') return v;
    } catch {
      /* none */
    }
    return { fails: [], until: 0 };
  };
  const fresh = (c: Counter, t: number): Counter => ({
    fails: c.fails.filter((f) => f > t - d.limits().windowSeconds * 1000),
    until: c.until,
  });
  const fail = (k: string, max: number) => {
    const t = now();
    const l = d.limits();
    const c = fresh(get(k), t);
    c.fails.push(t);
    if (c.fails.length >= max) {
      const over = c.fails.length - max;
      const seconds = Math.min(l.maxLockSeconds, l.lockSeconds * 2 ** over);
      c.until = t + seconds * 1000;
    }
    d.kv.setItem(k, JSON.stringify(c));
  };
  return {
    isSuspended: async (email) =>
      (await d.isSuspended?.(email.trim().toLowerCase())) === true,
    async beforeAttempt(email, ip): Promise<Result<true>> {
      const t = now();
      const wait = Math.max(
        get(key('email', email)).until,
        get(key('ip', ip)).until,
      );
      return wait > t
        ? { ok: false, failure: lockedFailure((wait - t) / 1000) }
        : { ok: true, value: true };
    },
    async afterFailure(email, ip) {
      const l = d.limits();
      fail(key('email', email), l.maxFailuresPerEmail);
      fail(key('ip', ip), l.maxFailuresPerIp);
    },
    async afterSuccess(email) {
      // The email's count is cleared; the IP's stays (one IP, many emails).
      d.kv.removeItem(key('email', email));
    },
  };
}

/** The password length when no config value is given. */
export const MIN_PASSWORD = 8;
/** The password rule at sign-up and reset (length from config). */
export function passwordProblem(
  password: string,
  minLength: number,
  email = '',
): string | null {
  if (password.length < minLength)
    return `Use at least ${minLength} characters for the password`;
  if (!password.trim() || /^(.)\1*$/.test(password))
    return 'Choose a password that is not one repeated character';
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase())
    return 'Do not use your email as the password';
  return null;
}
