// Phase 1 library manager (P1-12, P1-13): the owner's account. One account,
// made from the command line (there is no sign-up route). scrypt password
// hash, TOTP 2-step codes (RFC 6238, HMAC-SHA1, 30 s, 6 digits), a lockout
// after repeated failures, constant-time compares, and sessions with a CSRF
// token and a re-authentication time for dangerous actions.
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;
/** Re-authentication window (5 minutes; OWNER_REAUTH_SECONDS overrides it). */
export const REAUTH_MS = Number(process.env.OWNER_REAUTH_SECONDS ?? 300) * 1000;
export const SESSION_MS = 8 * 60 * 60 * 1000;
const SCRYPT = { N: 16_384, r: 8, p: 1, keylen: 64 } as const;

// --- Constant-time helpers ------------------------------------------------
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // Compare equal-length buffers so the length does not leak either.
  const size = Math.max(left.length, right.length, 1);
  const x = Buffer.alloc(size);
  const y = Buffer.alloc(size);
  left.copy(x);
  right.copy(y);
  return timingSafeEqual(x, y) && left.length === right.length;
}

// --- Passwords --------------------------------------------------------------
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(
    password,
    Buffer.from(salt, 'base64'),
    expected.length,
    {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    },
  );
  return timingSafeEqual(actual, expected);
}

// --- TOTP (RFC 6238) ----------------------------------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = B32.indexOf(char);
    if (index < 0) throw new Error('The TOTP secret is not base32.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
/** The code for a time step (RFC 4226 dynamic truncation). */
export function hotp(
  secret: Uint8Array,
  counter: number,
  digits = 6,
  algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1',
): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(algorithm, secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, '0');
}
export const totp = (
  secret: Uint8Array,
  timeMs: number,
  options: {
    digits?: number;
    algorithm?: 'sha1' | 'sha256' | 'sha512';
    step?: number;
  } = {},
) =>
  hotp(
    secret,
    Math.floor(timeMs / 1000 / (options.step ?? 30)),
    options.digits ?? 6,
    options.algorithm ?? 'sha1',
  );
/** Accepts the current step and one step either side (clock drift). */
export function verifyTotp(
  secretB32: string,
  code: string,
  timeMs: number,
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = base32Decode(secretB32);
  let ok = false;
  for (const drift of [-1, 0, 1])
    ok = safeEqual(totp(secret, timeMs + drift * 30_000), code) || ok;
  return ok;
}
export const newTotpSecret = () => base32Encode(randomBytes(20));

// --- The owner account ------------------------------------------------------
export interface OwnerAccount {
  email: string;
  passwordHash: string;
  totpSecret: string;
  failures: number;
  lockedUntil: number;
}

export class Accounts {
  private readonly file: string;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'owner.json');
  }
  get exists(): boolean {
    return existsSync(this.file);
  }
  read(): OwnerAccount | null {
    return this.exists
      ? (JSON.parse(readFileSync(this.file, 'utf8')) as OwnerAccount)
      : null;
  }
  write(account: OwnerAccount): void {
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(account, null, 1), { mode: 0o600 });
    renameSync(temp, this.file);
  }
  /** The one account; refuses a second one unless `replace`. */
  create(
    email: string,
    password: string,
    totpSecret = newTotpSecret(),
    replace = false,
  ) {
    if (this.exists && !replace)
      throw new Error('The owner account already exists.');
    if (password.length < 12)
      throw new Error('The password needs at least 12 characters.');
    const account: OwnerAccount = {
      email: email.trim().toLowerCase(),
      passwordHash: hashPassword(password),
      totpSecret,
      failures: 0,
      lockedUntil: 0,
    };
    this.write(account);
    return account;
  }
  /**
   * Checks email, password and code. Five failures in a row lock the
   * account for 15 minutes (correct details are refused while locked).
   */
  check(
    email: string,
    password: string,
    code: string,
    now = Date.now(),
  ): { ok: true } | { ok: false; reason: 'locked' | 'wrong'; until?: number } {
    const account = this.read();
    // Always run the hash, so a wrong email takes as long as a wrong password.
    const passwordOk = verifyPassword(
      password,
      account?.passwordHash ?? hashPassword('placeholder password'),
    );
    if (!account) return { ok: false, reason: 'wrong' };
    if (account.lockedUntil > now)
      return { ok: false, reason: 'locked', until: account.lockedUntil };
    const ok =
      safeEqual(email.trim().toLowerCase(), account.email) &&
      passwordOk &&
      verifyTotp(account.totpSecret, code, now);
    if (ok) {
      account.failures = 0;
      account.lockedUntil = 0;
      this.write(account);
      return { ok: true };
    }
    account.failures += 1;
    if (account.failures >= MAX_FAILURES) {
      account.lockedUntil = now + LOCK_MS;
      account.failures = 0;
    }
    this.write(account);
    return account.lockedUntil > now
      ? { ok: false, reason: 'locked', until: account.lockedUntil }
      : { ok: false, reason: 'wrong' };
  }
}

// --- Sessions ---------------------------------------------------------------
export interface Session {
  readonly id: string;
  readonly csrf: string;
  readonly email: string;
  readonly createdAt: number;
  reauthAt: number;
}
export class Sessions {
  private readonly sessions = new Map<string, Session>();
  create(email: string, now = Date.now()): Session {
    const session: Session = {
      id: randomBytes(32).toString('base64url'),
      csrf: randomBytes(32).toString('base64url'),
      email,
      createdAt: now,
      // Logging in counts as a fresh authentication.
      reauthAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }
  find(id: string | undefined, now = Date.now()): Session | null {
    if (!id) return null;
    for (const [key, session] of this.sessions)
      if (safeEqual(key, id)) {
        if (now - session.createdAt > SESSION_MS) {
          this.sessions.delete(key);
          return null;
        }
        return session;
      }
    return null;
  }
  remove(id: string): void {
    this.sessions.delete(id);
  }
}
export const csrfOk = (session: Session, token: string | undefined) =>
  !!token && safeEqual(session.csrf, token);
export const reauthFresh = (session: Session, now = Date.now()) =>
  now - session.reauthAt <= REAUTH_MS;
