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
  /**
   * P2-R2: the signed-in person's access token (a Supabase JWT) for the
   * gateway server, refreshed when needed; null for the local backend.
   */
  accessToken(): Promise<string | null>;
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
  /**
   * P2-R1 (P2-18): sends a password-reset code to the address (an email in
   * Supabase; the local backend's outbox in this round). Says nothing about
   * whether the address has an account.
   */
  requestPasswordReset(email: string): Promise<void>;
  /** Sets a new password with the emailed code and signs the person in. */
  confirmPasswordReset(
    email: string,
    code: string,
    password: string,
  ): Promise<CloudUser>;
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
  /** Phase 1 library brief (P1-33): every media file the person uploaded. */
  listMedia(): Promise<CloudMediaRow[]>;
  /** Removes one uploaded file and its row (Free space). */
  deleteMedia(fingerprint: string): Promise<void>;
  /** P1-31: stores (or replaces) one training-data record. */
  saveTrainingRecord(record: CloudTrainingRecord): Promise<void>;
  /** P4 Part 2: AI compositions and My Templates of every project the person has. */
  listLibrary(): Promise<CloudLibraryRow[]>;
  /** Stores (or replaces) one library item; the id is the editor's own. */
  saveLibraryItem(row: CloudLibraryInput): Promise<void>;
  deleteLibraryItem(id: string): Promise<void>;
  /** What the person's cloud holds now (projects, media, library items). */
  usage(): Promise<CloudUsage>;
}
export type CloudLibraryKind = 'ai' | 'templates';
export interface CloudLibraryInput {
  readonly id: string;
  /** The editor project the item was made in (null: an older item). */
  readonly projectId: string | null;
  readonly kind: CloudLibraryKind;
  readonly name: string;
  /** The item as JSON text (never media bytes, D-004). */
  readonly document: string;
  readonly thumbnail?: string | null;
}
export interface CloudLibraryRow extends CloudLibraryInput {
  readonly thumbnail: string | null;
  readonly bytes: number;
  readonly updatedAt: string;
}
export interface CloudUsage {
  readonly bytes: number;
  readonly projects: number;
  readonly media: number;
  readonly library: number;
}
/** The plan's cloud space is full; nothing was sent. */
export class CloudQuotaError extends Error {
  constructor(
    readonly used: number,
    readonly limit: number,
    readonly need: number,
  ) {
    super('Your plan has no room for this in the cloud');
    this.name = 'CloudQuotaError';
  }
}
/** Throws `CloudQuotaError` when `need` more bytes would pass the plan's limit. */
export async function assertRoom(
  backend: Pick<CloudBackend, 'usage'>,
  limitBytes: number | null,
  need: number,
): Promise<void> {
  if (limitBytes === null) return;
  const { bytes } = await backend.usage();
  if (bytes + need > limitBytes)
    throw new CloudQuotaError(bytes, limitBytes, need);
}
export interface CloudMediaRow {
  readonly fingerprint: string;
  readonly name: string;
  readonly size: number;
  readonly createdAt: string;
}
export interface CloudTrainingRecord {
  readonly projectId: string;
  readonly brief: string | null;
  readonly plan: unknown;
  readonly edits: readonly unknown[];
}

export interface CloudConfig {
  readonly url: string;
  readonly anonKey: string;
}
/**
 * The cloud address and public key: `.env.local` (VITE_SUPABASE_URL,
 * VITE_SUPABASE_ANON_KEY), or in dev and e2e builds a page-provided value.
 */
/**
 * P1-33: the Google sign-in client id (`VITE_GOOGLE_CLIENT_ID`, set when
 * Google is enabled in the Supabase project); without it there is no
 * Google button. Dev and e2e pages may set it (`__AIVE_GOOGLE_CLIENT_ID__`).
 */
export function googleClientId(): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const page = (globalThis as { __AIVE_GOOGLE_CLIENT_ID__?: string })
    .__AIVE_GOOGLE_CLIENT_ID__;
  const allowPage = env.DEV || env.MODE === 'e2e';
  return (allowPage ? page : undefined) ?? env.VITE_GOOGLE_CLIENT_ID ?? null;
}
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
