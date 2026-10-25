// Phase 1 (docs/PHASE1-PLAN.md): what the editor needs from a cloud
// service, as one interface. The Supabase implementation is in
// ./supabase.ts; src/core never imports anything from here (AGENTS.md §4).

export interface CloudUser {
  readonly id: string;
  readonly email: string | null;
}
export interface CloudProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly updatedAt: string;
  readonly thumbnail: string | null;
}
export interface CloudProjectInput {
  readonly name: string;
  readonly schemaVersion: number;
  /** The project JSON exactly as serialised (no media bytes, D-004). */
  readonly document: string;
  readonly thumbnail?: string | null;
}
export interface CloudMediaInfo {
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
}

/** A save named a revision the server no longer has: someone saved since. */
export class CloudConflictError extends Error {
  constructor() {
    super('This project was saved from somewhere else since it was opened');
    this.name = 'CloudConflictError';
  }
}
/** The cloud is not set up (no address or key) on this computer. */
export class CloudNotConfiguredError extends Error {
  constructor() {
    super('Cloud save is not set up on this computer');
    this.name = 'CloudNotConfiguredError';
  }
}

export interface CloudBackend {
  /** The signed-in person, or null. */
  user(): Promise<CloudUser | null>;
  /** Called with the person after every sign in, sign out or refresh. */
  onUserChange(listener: (user: CloudUser | null) => void): () => void;
  signUp(email: string, password: string): Promise<CloudUser>;
  signIn(email: string, password: string): Promise<CloudUser>;
  /**
   * OAuth sign in (Google now, the Claude connector of Phase 2 later): the
   * browser leaves for the provider and comes back signed in.
   */
  signInWithProvider(provider: 'google'): Promise<void>;
  signOut(): Promise<void>;
  listProjects(): Promise<CloudProjectSummary[]>;
  loadProject(
    id: string,
  ): Promise<{ summary: CloudProjectSummary; document: string }>;
  createProject(input: CloudProjectInput): Promise<CloudProjectSummary>;
  /** Saves over `id` only if the server still has `revision`. */
  saveProject(
    id: string,
    revision: number,
    input: CloudProjectInput,
  ): Promise<CloudProjectSummary>;
  renameProject(id: string, name: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
  /** Which of these fingerprints the person's media already has. */
  hasMedia(fingerprints: readonly string[]): Promise<Set<string>>;
  uploadMedia(
    fingerprint: string,
    data: Blob,
    info: CloudMediaInfo,
  ): Promise<void>;
  downloadMedia(fingerprint: string): Promise<Blob>;
}

export interface CloudConfig {
  readonly url: string;
  readonly anonKey: string;
}
/**
 * The cloud address and public key: `.env.local` (VITE_SUPABASE_URL,
 * VITE_SUPABASE_ANON_KEY), or in dev and e2e builds a page-provided value.
 */
export function cloudConfig(): CloudConfig | null {
  const page = (globalThis as { __AIVE_CLOUD_CONFIG__?: Partial<CloudConfig> })
    .__AIVE_CLOUD_CONFIG__;
  const env = import.meta.env as Record<string, string | undefined>;
  const allowPage = env.DEV || env.MODE === 'e2e';
  const url = (allowPage ? page?.url : undefined) ?? env.VITE_SUPABASE_URL;
  const anonKey =
    (allowPage ? page?.anonKey : undefined) ?? env.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}
