// ROUND-C2 (2.2): OAuth 2.1 for the Claude connector, so a person connects
// in two clicks and never copies a key (claude.com/docs/connectors/building/
// authentication, read 15 Nov 2026):
// - 401 with WWW-Authenticate resource_metadata (server/app.ts),
// - protected-resource metadata (RFC 9728) and authorization-server
//   metadata (RFC 8414) under /.well-known/,
// - dynamic client registration (RFC 7591), public clients,
// - authorization code + PKCE S256; the authorize step sends the person to
//   the panel's consent page, where they are already signed in,
// - token (form-encoded) with rotating refresh tokens, `invalid_grant` for
//   a used, wrong or expired grant, and revoke.
// Redirect URIs: Claude's hosted callback (web, desktop, mobile and Cowork
// share it); loopback ones (Claude Code) only when MCP_TEST_MODE=1.
// Tokens are ours: signed, scope `mcp`, tied to the person, and only their
// sha256 is stored on the connection row.
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { McpStore, McpConnection } from './records';

export const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
export const SCOPE = 'mcp';
const ACCESS_MS = 60 * 60_000;
const CODE_MS = 5 * 60_000;
const PENDING_MS = 15 * 60_000;
/** One plain sentence Claude can pass on (2.2). */
export const RECONNECT =
  'The connection to the video platform has ended. Ask the person to connect it again: in the panel open New project, choose "Create with your own Claude" and press Allow.';

export class OAuthError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    message: string,
  ) {
    super(message);
  }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const b64u = (b: Buffer) => b.toString('base64url');

export function redirectAllowed(uri: string, testMode: boolean): boolean {
  if (uri === CLAUDE_CALLBACK) return true;
  if (!testMode) return false;
  // Claude Code: RFC 8252 loopback, any port, path /callback.
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?\/callback$/.test(uri);
}
/** Loopback redirects match whatever their port (RFC 8252 7.3). */
const sameRedirect = (registered: string, given: string) =>
  registered === given ||
  (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(registered) &&
    registered.replace(/:\d+\//, '/') === given.replace(/:\d+\//, '/'));

interface Pending {
  readonly clientId: string;
  readonly clientName: string;
  readonly redirectUri: string;
  readonly challenge: string;
  readonly state: string | null;
  readonly at: number;
}
interface Code {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly challenge: string;
  readonly userId: string;
  readonly exp: number;
  used: boolean;
  connectionId: string | null;
}

export interface OAuthDeps {
  readonly store: McpStore;
  readonly now: () => number;
  readonly secret: () => string;
  readonly testMode: () => boolean;
}

export function createOAuth(d: OAuthDeps) {
  const pending = new Map<string, Pending>();
  const codes = new Map<string, Code>();
  const sweep = () => {
    const t = d.now();
    for (const [k, v] of pending) if (t - v.at > PENDING_MS) pending.delete(k);
    for (const [k, v] of codes) if (t > v.exp + CODE_MS) codes.delete(k);
  };
  const sign = (body: string) =>
    createHmac('sha256', d.secret()).update(body).digest('base64url');
  const issue = (c: { userId: string; id: string }) => {
    const exp = d.now() + ACCESS_MS;
    const body = b64u(
      Buffer.from(
        JSON.stringify({ sub: c.userId, cid: c.id, scope: SCOPE, exp }),
      ),
    );
    const access = `mcpa.${body}.${sign(`mcpa.${body}`)}`;
    const refresh = `mcpr.${c.id}.${b64u(randomBytes(32))}`;
    return { access, refresh, exp };
  };
  const tokenReply = (t: { access: string; refresh: string }) => ({
    access_token: t.access,
    token_type: 'Bearer',
    expires_in: ACCESS_MS / 1000,
    refresh_token: t.refresh,
    scope: SCOPE,
  });
  const connectionOf = async (id: string) =>
    (await d.store.mcpConnections()).find((c) => c.id === id) ?? null;

  return {
    protectedResource: (origin: string) => ({
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ['header'],
      resource_name: 'Video platform',
    }),
    authorizationServer: (origin: string) => ({
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [SCOPE, 'offline_access'],
    }),

    /** RFC 7591: Claude registers itself as a public client. */
    async register(body: Record<string, unknown>) {
      const uris = body.redirect_uris;
      if (
        !Array.isArray(uris) ||
        !uris.length ||
        uris.length > 10 ||
        uris.some((u) => typeof u !== 'string' || u.length > 300)
      )
        throw new OAuthError(
          400,
          'invalid_redirect_uri',
          'redirect_uris is missing.',
        );
      for (const u of uris as string[])
        if (!redirectAllowed(u, d.testMode()))
          throw new OAuthError(
            400,
            'invalid_redirect_uri',
            `This redirect address is not allowed: ${u.slice(0, 100)}`,
          );
      const method = body.token_endpoint_auth_method ?? 'none';
      if (method !== 'none')
        throw new OAuthError(
          400,
          'invalid_client_metadata',
          'Only public clients (token_endpoint_auth_method none) are supported.',
        );
      const name =
        typeof body.client_name === 'string' && body.client_name.trim()
          ? body.client_name.trim().slice(0, 200)
          : 'Claude';
      const client = {
        id: `mcpc-${randomUUID()}`,
        name,
        redirectUris: uris as string[],
        createdAt: new Date(d.now()).toISOString(),
      };
      await d.store.saveMcpClient(client);
      return {
        client_id: client.id,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        client_id_issued_at: Math.floor(d.now() / 1000),
      };
    },

    /**
     * The authorize step: checks the request and returns the id of a
     * pending consent the panel shows. An unknown client or redirect is
     * never redirected to (a plain 400).
     */
    async authorize(q: URLSearchParams): Promise<string> {
      sweep();
      const client = await d.store.mcpClient(q.get('client_id') ?? '');
      if (!client)
        throw new OAuthError(400, 'invalid_client', 'Unknown client.');
      const redirect = q.get('redirect_uri') ?? '';
      if (
        !redirectAllowed(redirect, d.testMode()) ||
        !client.redirectUris.some((r) => sameRedirect(r, redirect))
      )
        throw new OAuthError(
          400,
          'invalid_request',
          'This redirect address is not registered for the client.',
        );
      if (q.get('response_type') !== 'code')
        throw new OAuthError(400, 'unsupported_response_type', 'Use code.');
      const challenge = q.get('code_challenge') ?? '';
      if (
        q.get('code_challenge_method') !== 'S256' ||
        !/^[A-Za-z0-9_-]{43}$/.test(challenge)
      )
        throw new OAuthError(
          400,
          'invalid_request',
          'PKCE with S256 is required.',
        );
      const id = randomUUID();
      pending.set(id, {
        clientId: client.id,
        clientName: client.name,
        redirectUri: redirect,
        challenge,
        state: q.get('state'),
        at: d.now(),
      });
      return id;
    },
    /** What the consent page shows (the redirect's host, as the spec asks). */
    consentInfo(id: string) {
      const p = pending.get(id);
      if (!p || d.now() - p.at > PENDING_MS) return null;
      return {
        client: p.clientName,
        redirectHost: new URL(p.redirectUri).host,
      };
    },
    /** Allow or Cancel on the consent page; returns where to send the person. */
    consent(id: string, userId: string, allow: boolean): string {
      const p = pending.get(id);
      if (!p || d.now() - p.at > PENDING_MS)
        throw new OAuthError(
          400,
          'expired',
          'This request has expired. Go back to Claude and connect again.',
        );
      pending.delete(id);
      const back = new URL(p.redirectUri);
      if (p.state !== null) back.searchParams.set('state', p.state);
      if (!allow) {
        back.searchParams.set('error', 'access_denied');
        return back.toString();
      }
      const code = b64u(randomBytes(32));
      codes.set(code, {
        clientId: p.clientId,
        redirectUri: p.redirectUri,
        challenge: p.challenge,
        userId,
        exp: d.now() + CODE_MS,
        used: false,
        connectionId: null,
      });
      back.searchParams.set('code', code);
      return back.toString();
    },

    /** The token endpoint (form fields). */
    async token(f: URLSearchParams) {
      const grant = f.get('grant_type');
      if (grant === 'authorization_code') {
        const code = codes.get(f.get('code') ?? '');
        if (!code || d.now() > code.exp)
          throw new OAuthError(400, 'invalid_grant', 'The code is not valid.');
        if (code.used) {
          // A replayed code ends what it gave (RFC 6749 4.1.2).
          if (code.connectionId) {
            const c = await connectionOf(code.connectionId);
            if (c && !c.revokedAt)
              await d.store.saveMcpConnection({
                ...c,
                revokedAt: new Date(d.now()).toISOString(),
              });
          }
          throw new OAuthError(400, 'invalid_grant', 'The code was used.');
        }
        if (
          f.get('client_id') !== code.clientId ||
          !sameRedirect(code.redirectUri, f.get('redirect_uri') ?? '')
        )
          throw new OAuthError(
            400,
            'invalid_grant',
            'The code does not belong to this client or redirect.',
          );
        const verifier = f.get('code_verifier') ?? '';
        const want = Buffer.from(code.challenge);
        const got = Buffer.from(
          createHash('sha256').update(verifier).digest('base64url'),
        );
        code.used = true;
        if (
          verifier.length < 43 ||
          want.length !== got.length ||
          !timingSafeEqual(want, got)
        )
          throw new OAuthError(
            400,
            'invalid_grant',
            'The code verifier does not match.',
          );
        const client = await d.store.mcpClient(code.clientId);
        const id = `mcpk-${randomUUID()}`;
        const t = issue({ userId: code.userId, id });
        const at = new Date(d.now()).toISOString();
        await d.store.saveMcpConnection({
          id,
          userId: code.userId,
          clientId: code.clientId,
          clientName: client?.name ?? 'Claude',
          createdAt: at,
          lastUsedAt: null,
          revokedAt: null,
          accessHash: sha(t.access),
          accessExp: t.exp,
          refreshHash: sha(t.refresh),
        });
        code.connectionId = id;
        return tokenReply(t);
      }
      if (grant === 'refresh_token') {
        const refresh = f.get('refresh_token') ?? '';
        const m = /^mcpr\.(mcpk-[0-9a-f-]{36})\.[A-Za-z0-9_-]{43}$/.exec(
          refresh,
        );
        const c = m ? await connectionOf(m[1]!) : null;
        if (
          !c ||
          c.revokedAt ||
          c.refreshHash !== sha(refresh) ||
          (f.get('client_id') && f.get('client_id') !== c.clientId)
        )
          throw new OAuthError(
            400,
            'invalid_grant',
            'The refresh token is not valid.',
          );
        const t = issue(c);
        await d.store.saveMcpConnection({
          ...c,
          accessHash: sha(t.access),
          accessExp: t.exp,
          refreshHash: sha(t.refresh),
        });
        return tokenReply(t);
      }
      throw new OAuthError(
        400,
        'unsupported_grant_type',
        'Use authorization_code or refresh_token.',
      );
    },

    /** RFC 7009: revoking either token ends the connection. */
    async revoke(f: URLSearchParams) {
      const token = f.get('token') ?? '';
      const c = await this.connectionForToken(token);
      if (c && !c.revokedAt)
        await d.store.saveMcpConnection({
          ...c,
          revokedAt: new Date(d.now()).toISOString(),
        });
    },
    async connectionForToken(token: string): Promise<McpConnection | null> {
      const r = /^mcpr\.(mcpk-[0-9a-f-]{36})\./.exec(token);
      if (r) {
        const c = await connectionOf(r[1]!);
        return c && c.refreshHash === sha(token) ? c : null;
      }
      const a = /^mcpa\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
      if (!a) return null;
      const want = Buffer.from(sign(`mcpa.${a[1]}`));
      const got = Buffer.from(a[2]!);
      if (want.length !== got.length || !timingSafeEqual(want, got))
        return null;
      let claims: { cid?: string };
      try {
        claims = JSON.parse(Buffer.from(a[1]!, 'base64url').toString('utf8'));
      } catch {
        return null;
      }
      const c = claims.cid ? await connectionOf(claims.cid) : null;
      return c && c.accessHash === sha(token) ? c : null;
    },

    /**
     * Who is calling /mcp. A missing, wrong, expired or revoked token is
     * one plain sentence (the 401 carries resource_metadata).
     */
    async verify(header: string | undefined): Promise<{
      userId: string;
      connection: McpConnection;
    }> {
      const token = /^Bearer (\S+)$/.exec(header ?? '')?.[1];
      if (!token) throw new OAuthError(401, 'auth', RECONNECT);
      const c = await this.connectionForToken(token);
      if (!c || !token.startsWith('mcpa.'))
        throw new OAuthError(401, 'auth', RECONNECT);
      const claims = JSON.parse(
        Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
      ) as { sub: string; exp: number; scope: string };
      if (
        c.revokedAt ||
        claims.scope !== SCOPE ||
        claims.sub !== c.userId ||
        claims.exp <= d.now() ||
        c.accessExp <= d.now()
      )
        throw new OAuthError(401, 'auth', RECONNECT);
      // Last used, written at most once a minute.
      if (!c.lastUsedAt || d.now() - Date.parse(c.lastUsedAt) > 60_000) {
        c.lastUsedAt = new Date(d.now()).toISOString();
        await d.store.saveMcpConnection(c);
      }
      return { userId: c.userId, connection: c };
    },
    /** Ends a person's connection (Door 4, Admin), or all of them. */
    async revokeConnection(id: string | null, userId: string | null) {
      const at = new Date(d.now()).toISOString();
      let n = 0;
      for (const c of await d.store.mcpConnections(userId ?? undefined))
        if (!c.revokedAt && (id === null || c.id === id)) {
          await d.store.saveMcpConnection({ ...c, revokedAt: at });
          n++;
        }
      return n;
    },
  };
}
export type OAuth = ReturnType<typeof createOAuth>;
