// P3U: the one place the admin page gets its client. Today it is the in-memory
// mock, available on dev and e2e pages only. When Part 1's HTTP admin client
// is merged this file returns it instead (the screens use only the contract).
import type { AdminClient } from '../contracts/p3';
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

/** null = no admin server is connected on this page. */
export function adminServices(): AdminServices | null {
  if (services !== undefined) return services;
  if (!import.meta.env.DEV) return (services = null);
  const mock = createMockAdmin();
  // Dev/test only: lets a test damage one audit row to prove the chain check.
  (window as unknown as Record<string, unknown>).__AIVE_ADMIN_TAMPER__ = (
    seq: number,
  ) => mock.tamperAudit(seq);
  return (services = { client: mock, settings: mock.settings, demo: true });
}

export function adminAuth(): AdminAuth {
  return {
    user: () => {
      try {
        return sessionStorage.getItem(KEY);
      } catch {
        return null;
      }
    },
    async signIn(email, password) {
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
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* nothing to remove */
      }
    },
  };
}
