// P2-R2 (P2B-02): who is calling. Every /v1 call except the public config
// carries `Authorization: Bearer <JWT>`:
//  - supabase mode: a Supabase access token, checked with SUPABASE_JWT_SECRET
//    (HS256) or the project's public keys (SUPABASE_JWKS_URL: RS256, ES256);
//  - local mode: a token this server signed with LOCAL_AUTH_SECRET (tests and
//    offline use only).
// Expired, not-yet-valid, wrongly signed or malformed tokens are refused with
// one plain sentence. Uses node:crypto only.
import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';

export interface Caller {
  readonly userId: string;
  readonly email: string;
  readonly admin: boolean;
}
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
const b64u = (s: string) => Buffer.from(s, 'base64url');
const enc = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString('base64url');

/** Signs an HS256 token (local mode and tests). */
export function signLocalToken(
  secret: string,
  claims: {
    sub: string;
    email?: string;
    exp?: number;
    role?: string;
    app_metadata?: Record<string, unknown>;
  },
  now = Math.floor(Date.now() / 1000),
): string {
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc({
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + 3600,
    ...claims,
  });
  const sig = createHmac('sha256', secret)
    .update(`${head}.${body}`)
    .digest('base64url');
  return `${head}.${body}.${sig}`;
}

export interface AuthOptions {
  readonly mode: 'supabase' | 'local';
  readonly hsSecret?: string;
  readonly jwksUrl?: string;
  readonly issuer?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /**
   * P3-WIRING (W8): a suspended person is refused on every call (Part 1's
   * entitlement flags answer it).
   */
  readonly suspended?: (userId: string) => boolean | Promise<boolean>;
  /**
   * P3-WIRING (W8): tokens issued before this time (unix seconds) are
   * refused, so a password change ends older sessions here too.
   */
  readonly sessionsValidFrom?: (
    userId: string,
  ) => number | null | Promise<number | null>;
}
// P3-WIRING (W8): sign-in is done by Supabase Auth (or the local backend in
// the browser); the server never sees a password. Its guard
// (createLoginGuard) is the same code the browser backends use.
export {
  createLoginGuard,
  passwordProblem,
  SIGN_IN_FAILED,
} from '../src/cloud/login-guard';

export function createAuth(o: AuthOptions) {
  const now = o.now ?? (() => Math.floor(Date.now() / 1000));
  let jwks: { at: number; keys: Map<string, KeyObject> } | null = null;
  const keyFor = async (kid: string | undefined): Promise<KeyObject | null> => {
    if (!o.jwksUrl) return null;
    if (!jwks || now() - jwks.at > 600 || (kid && !jwks.keys.has(kid))) {
      const res = await (o.fetch ?? fetch)(o.jwksUrl);
      if (!res.ok)
        throw new AuthError(
          'Sign-in could not be checked right now. Try again.',
        );
      const body = (await res.json()) as {
        keys?: (Record<string, unknown> & { kid?: string })[];
      };
      const keys = new Map<string, KeyObject>();
      for (const k of body.keys ?? [])
        try {
          keys.set(
            String(k.kid ?? ''),
            createPublicKey({ key: k as never, format: 'jwk' }),
          );
        } catch {
          /* a key we cannot read is skipped */
        }
      jwks = { at: now(), keys };
    }
    return (
      jwks.keys.get(String(kid ?? '')) ?? [...jwks.keys.values()][0] ?? null
    );
  };

  return async function authenticate(
    header: string | undefined,
  ): Promise<Caller> {
    const m =
      /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(
        header ?? '',
      );
    if (!m) throw new AuthError('Please log in first.');
    const [, h, p, s] = m as unknown as [string, string, string, string];
    let head: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      head = JSON.parse(b64u(h).toString('utf8'));
      claims = JSON.parse(b64u(p).toString('utf8'));
    } catch {
      throw new AuthError('Your sign-in is not valid. Please log in again.');
    }
    const data = Buffer.from(`${h}.${p}`);
    const sig = b64u(s);
    let ok = false;
    if (head.alg === 'HS256') {
      if (!o.hsSecret)
        throw new AuthError('Your sign-in is not valid. Please log in again.');
      const want = createHmac('sha256', o.hsSecret).update(data).digest();
      ok = want.length === sig.length && timingSafeEqual(want, sig);
    } else if (
      o.mode === 'supabase' &&
      (head.alg === 'RS256' || head.alg === 'ES256')
    ) {
      const key = await keyFor(head.kid);
      if (key)
        ok = cryptoVerify(
          'sha256',
          data,
          head.alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key,
          sig,
        );
    }
    if (!ok)
      throw new AuthError('Your sign-in is not valid. Please log in again.');
    const t = now();
    if (typeof claims.exp !== 'number' || claims.exp <= t)
      throw new AuthError('Your sign-in has expired. Please log in again.');
    if (typeof claims.nbf === 'number' && claims.nbf > t + 30)
      throw new AuthError('Your sign-in is not valid yet.');
    if (o.issuer && claims.iss !== o.issuer)
      throw new AuthError('Your sign-in is not valid. Please log in again.');
    if (claims.role === 'anon' || typeof claims.sub !== 'string' || !claims.sub)
      throw new AuthError('Please log in first.');
    const from = await o.sessionsValidFrom?.(claims.sub);
    if (from && (typeof claims.iat !== 'number' || claims.iat < from))
      throw new AuthError('Your password was changed. Please log in again.');
    if (await o.suspended?.(claims.sub))
      throw new AuthError('This account is paused. Contact support.');
    const meta = (claims.app_metadata ?? {}) as { role?: unknown };
    return {
      userId: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : '',
      admin: meta.role === 'admin',
    };
  };
}
