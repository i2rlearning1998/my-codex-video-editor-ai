// P2-R2 (P2B-25, P2B-26): the editor's one small usage interface. Before a
// video export it asks whether the plan allows one more; after a finished
// export it reports it (count and kind). With the gateway server
// (VITE_GATEWAY_URL) the server counts and enforces; without it the panel's
// limits bridge in this browser is used. No editor state, no panel code.
type KV = Pick<Storage, 'getItem' | 'setItem'>;

export interface UsageReporter {
  /** null when allowed, else the owner's sentence. */
  allowExport(): Promise<string | null>;
  exported(kind: string): Promise<void>;
}
/** What the panel writes for the editor (the plan's export limit). */
export const LIMITS_KEY = (u: string) => `aive.limits.${u}`;
/** Exports made in this browser while no server is used. */
export const EXPORTS_KEY = (u: string) => `aive.exports.${u}`;
/** VITE_GATEWAY_URL, or in dev and e2e builds a page-provided value. */
export function gatewayBase(): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const page = (globalThis as { __AIVE_GATEWAY_URL__?: string })
    .__AIVE_GATEWAY_URL__;
  return (
    ((env.DEV || env.MODE === 'e2e') && page) || env.VITE_GATEWAY_URL || null
  );
}
const month = () => new Date().toISOString().slice(0, 7);
const read = <T>(s: KV, k: string, d: T): T => {
  try {
    return (JSON.parse(s.getItem(k) ?? 'null') as T) ?? d;
  } catch {
    return d;
  }
};

export function usageReporter(
  userId: string,
  storage: KV,
  gateway: string | null,
  /** ROUND-A: the open editor project (the Video), kept with each export. */
  projectId: () => string = () => '',
): UsageReporter {
  // ROUND-A: every export is also kept in this browser with its Video, so
  // the panel's Video card can list the Video's exports.
  const remember = (kind: string) => {
    const log = read<{ at: string; kind: string; projectId?: string }[]>(
      storage,
      EXPORTS_KEY(userId),
      [],
    );
    storage.setItem(
      EXPORTS_KEY(userId),
      JSON.stringify(
        [
          ...log,
          { at: new Date().toISOString(), kind, projectId: projectId() },
        ].slice(-500),
      ),
    );
  };
  if (!gateway) {
    const log = () =>
      read<{ at: string; kind: string }[]>(storage, EXPORTS_KEY(userId), []);
    return {
      async allowExport() {
        const lim = read<{ exportsPerMonth: number | null; message: string }>(
          storage,
          LIMITS_KEY(userId),
          { exportsPerMonth: null, message: '' },
        );
        const used = log().filter((e) => e.at.startsWith(month())).length;
        return lim.exportsPerMonth !== null && used >= lim.exportsPerMonth
          ? lim.message
          : null;
      },
      async exported(kind) {
        remember(kind);
      },
    };
  }
  const base = gateway.replace(/\/$/, '');
  const token = gatewayToken(userId, storage, base);
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${base}/v1${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await token()}`,
      },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    return res.ok
      ? null
      : (out.error?.message ?? `The server answered ${res.status}.`);
  };
  return {
    allowExport: () => post('/limits/check', { action: 'export' }),
    async exported(kind) {
      remember(kind);
      await post('/exports', { kind });
    },
  };
}

/**
 * The signed-in person's access token for the gateway server: the Supabase
 * session the panel keeps, else (dev and local mode) a local token.
 */
export function gatewayToken(
  userId: string,
  storage: KV,
  base: string,
): () => Promise<string> {
  let local: { token: string; exp: number } | null = null;
  return async () => {
    const sb = read<{ access_token?: string } | null>(
      storage,
      'aive.cloud.session',
      null,
    );
    if (sb?.access_token) return sb.access_token;
    if (local && local.exp > Date.now() / 1000 + 60) return local.token;
    const users = read<{ users?: { id: string; email: string }[] } | null>(
      storage,
      'aive.localCloud',
      null,
    );
    const email = users?.users?.find((x) => x.id === userId)?.email;
    const res = await fetch(`${base}/v1/local/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const t = ((await res.json().catch(() => ({}))) as { token?: string })
      .token;
    if (!t) throw new Error('Please log in first.');
    local = { token: t, exp: Date.now() / 1000 + 3000 };
    return t;
  };
}
