// P3U: the one place the admin page gets its client. Today it is the in-memory
// mock, available on dev and e2e pages only. When Part 1's HTTP admin client
// is merged this file returns it instead (the screens use only the contract).
import type { AdminClient, P3AdminSettings } from '../contracts/p3';
import { createHttpAdminClient } from '../admin-client/http';
import { cloudConfig } from '../cloud/backend';
import { p3Settings, type PlatformConfig } from '../platform-config';
import { gatewayBase } from '../usage-report';
import {
  createMockAdmin,
  type AdminSettingsStore,
} from '../contracts/p3-mock-admin';

export interface AdminServices {
  readonly client: AdminClient;
  readonly settings: AdminSettingsStore;
  /** True while the data is sample data. */
  readonly demo: boolean;
}
export interface AdminAuth {
  user(): string | null;
  /** Resolves true when the details are right. */
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): void;
}

const KEY = 'aive.admin.session';
let services: AdminServices | null | undefined;
/** The signed-in admin's access token: in memory only, never stored. */
let token = '';

/** The owner's settings, read from and published to the live Platform Config. */
function configSettings(base: string): AdminSettingsStore {
  const root = base.replace(/\/+$/, '') + '/v1';
  const read = async () => {
    const res = await fetch(`${root}/config`);
    if (!res.ok) throw new Error('The settings could not be read.');
    return (await res.json()) as { version: number; config: PlatformConfig };
  };
  return {
    async get(): Promise<P3AdminSettings> {
      return p3Settings((await read()).config);
    },
    async set(next, reason) {
      const { config } = await read();
      const res = await fetch(`${root}/config`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          config: { ...config, p3: { ...config.p3, ...next } },
          note: reason,
          publish: true,
        }),
      });
      if (!res.ok)
        throw new Error(
          res.status === 403
            ? 'Only an administrator may do that.'
            : 'The settings could not be saved.',
        );
    },
  };
}

/** null = no admin server is connected on this page. */
export function adminServices(): AdminServices | null {
  if (services !== undefined) return services;
  const base = gatewayBase();
  if (base) {
    // The real admin API (Part 1) behind the frozen AdminClient contract.
    const client = createHttpAdminClient(base, () => token);
    return (services = {
      client,
      settings: configSettings(base),
      demo: false,
    });
  }
  if (!import.meta.env.DEV) return (services = null);
  const mock = createMockAdmin();
  // Dev/test only: lets a test damage one audit row to prove the chain check.
  (window as unknown as Record<string, unknown>).__AIVE_ADMIN_TAMPER__ = (
    seq: number,
  ) => mock.tamperAudit(seq);
  return (services = { client: mock, settings: mock.settings, demo: true });
}

/** Signs in with Supabase's password grant (plain REST: no SDK on this page). */
async function supabaseToken(
  email: string,
  password: string,
): Promise<string | null> {
  const cloud = cloudConfig();
  if (!cloud) return null;
  try {
    const res = await fetch(
      `${cloud.url.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: { apikey: cloud.anonKey, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      },
    );
    if (!res.ok) return null;
    return (
      ((await res.json()) as { access_token?: string }).access_token ?? null
    );
  } catch {
    return null;
  }
}

export function adminAuth(): AdminAuth {
  return {
    user: () => {
      // A real session needs its token, which a reload clears.
      if (gatewayBase() && !token) return null;
      try {
        return sessionStorage.getItem(KEY);
      } catch {
        return null;
      }
    },
    async signIn(email, password) {
      if (gatewayBase()) {
        // The real sign-in is the server's: an admin role on the account.
        // Dev and e2e pages may hand in a token (never in a production build).
        const given = import.meta.env.DEV
          ? (window as { __AIVE_ADMIN_TOKEN__?: string }).__AIVE_ADMIN_TOKEN__
          : undefined;
        const got = given ?? (await supabaseToken(email.trim(), password));
        if (!got) return false;
        token = got;
        try {
          await adminServices()!.client.emergency(); // 403 = not an admin
        } catch {
          token = '';
          return false;
        }
        try {
          sessionStorage.setItem(KEY, email.trim().toLowerCase());
        } catch {
          /* private mode: the session lasts until reload */
        }
        return true;
      }
      // Demo only: the real sign-in is the server's (an admin role on the
      // account), never a password kept in the page.
      if (
        import.meta.env.DEV &&
        email.trim().toLowerCase() === 'admin@example.test' &&
        password === 'admin-demo'
      ) {
        try {
          sessionStorage.setItem(KEY, email.trim().toLowerCase());
        } catch {
          /* private mode: the session lasts until reload */
        }
        return true;
      }
      return false;
    },
    signOut() {
      token = '';
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* nothing to remove */
      }
    },
  };
}
