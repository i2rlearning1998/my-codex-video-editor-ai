// ROUND-C2: what the server keeps for the Claude connector.
// - Clients: what Claude registered (dynamic client registration).
// - Connections: one row per person and Claude connection (client, created,
//   last used, revoked) with the hashes of its current tokens, never the
//   tokens themselves.
// - The Claude workspace: Projects and Videos made or continued through the
//   connector (names, brief answers, the plan, the Video sheet, Project
//   memory). The editor file itself is a cloud project row (the same table
//   the editor syncs), and media are cloud media rows with their licence.

export interface McpClient {
  readonly id: string;
  readonly name: string;
  readonly redirectUris: readonly string[];
  readonly createdAt: string;
}
export interface McpConnection {
  readonly id: string;
  readonly userId: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** sha256 of the current access token and its expiry (ms). */
  accessHash: string;
  accessExp: number;
  /** sha256 of the current refresh token. */
  refreshHash: string;
}

export interface SheetEntry {
  readonly at: string;
  readonly text: string;
  /** Who wrote it: Claude through the connector, or the in-panel Director. */
  readonly by: 'claude' | 'director';
}
export interface ClaudeVideo {
  name: string;
  videoType: string;
  /** Brief answers by field id. */
  brief: Record<string, string>;
  /** The submitted Video Plan (never shown to the person). */
  plan: unknown;
  /** Credits the plan costs, once submitted. */
  cost: number | null;
  approved: boolean;
  /** The cloud project's revision Claude last read or wrote. */
  seenRevision: number | null;
  sheet: SheetEntry[];
  /** Export ids already counted (export_done is counted once). */
  exports: string[];
  /** Fingerprints of the media brought in for it (import_media). */
  media: string[];
  /** The plan the person was told the cost of (approve_plan needs it). */
  costShownFor: string | null;
  createdAt: string;
  origin: 'claude' | 'panel';
  /** ROUND-C3 (1.2): what was seen in the person's files (FileNote shape). */
  fileNotes?: {
    id: string;
    name: string;
    kind: string;
    bytes: number;
    note: string;
    at: string;
  }[];
  /** ROUND-C3 (1.2): a link the person gave for the brief. */
  referenceUrl?: string;
  /** ROUND-C3 (1.3): plan rewrites used (the Director's counter rule). */
  rewrites?: number;
  /** ROUND-C3 (2.2): the person's choice per asset slot. */
  assetChoices?: Record<string, string>;
  /** ROUND-C3 (3.3): the plan's "Extra ideas" (the upgrade step). */
  upgrades?: string[];
  /** ROUND-C3 (1.3): a new scene shown with its cost, waiting for a yes. */
  pendingScene?: { plan: unknown; cost: number; hash: string } | null;
}
export interface ClaudeProject {
  name: string;
  styleId: string | null;
  /**
   * ROUND-C3 (4.1, 5.1): the Project's AI library: every new graphic Claude
   * made (a checked def), as the Director saves its plan graphics.
   */
  library?: {
    id: string;
    tier: 'B' | 'C';
    source: string;
    meta: Record<string, unknown>;
    name: string;
    summary: string;
    savedAt: string;
    videoId: string;
  }[];
  /** ROUND-C3 (3.1): the Project's style record (StyleFields shape). */
  style?: Record<string, unknown> | null;
  memory: SheetEntry[];
  videos: Record<string, ClaudeVideo>;
  createdAt: string;
  origin: 'claude' | 'panel';
}
export interface ClaudeDoc {
  projects: Record<string, ClaudeProject>;
  /**
   * ROUND-C3 (4.4): the capability lines Claude saw last time (start_here
   * says what changed since).
   */
  seen?: { version: string; lines: string[] };
}
export const emptyClaudeDoc = (): ClaudeDoc => ({ projects: {} });

/** One editor file in the cloud (public.projects in Supabase). */
export interface CloudProjectRow {
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: number;
  readonly document: string;
  readonly revision: number;
  readonly updatedAt: string;
}
/** One media file in the person's cloud media (public.media). */
export interface MediaRecord {
  readonly fingerprint: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly provider: string | null;
  readonly licence: string | null;
  readonly attribution: string | null;
}

/** A save named a revision that is no longer the latest. */
export class RevisionConflict extends Error {
  constructor(readonly current: number) {
    super('The video changed since it was read.');
    this.name = 'RevisionConflict';
  }
}

/**
 * ROUND-C3 (0.3): an OAuth consent waiting for Allow, or an authorization
 * code. Kept in the store so a server restart ends neither; codes are kept
 * by their sha256 only. Expired rows are swept.
 */
export interface McpGrant {
  readonly key: string;
  readonly kind: 'consent' | 'code';
  readonly data: Record<string, unknown>;
  readonly expiresAt: string;
}

export interface McpStore {
  mcpGrant(key: string): Promise<McpGrant | null>;
  saveMcpGrant(g: McpGrant): Promise<void>;
  deleteMcpGrant(key: string): Promise<void>;
  /** Removes every grant that expired before `now` (ISO time). */
  sweepMcpGrants(now: string): Promise<void>;
  mcpClient(id: string): Promise<McpClient | null>;
  saveMcpClient(c: McpClient): Promise<void>;
  /** A person's connections, or everyone's (Admin) when no id is given. */
  mcpConnections(userId?: string): Promise<McpConnection[]>;
  saveMcpConnection(c: McpConnection): Promise<void>;
  claudeDoc(userId: string): Promise<ClaudeDoc>;
  saveClaudeDoc(userId: string, doc: ClaudeDoc): Promise<void>;
  cloudProject(userId: string, id: string): Promise<CloudProjectRow | null>;
  /**
   * Saves an editor file. `expected` is the revision it was read at (null
   * for a new file); another revision throws RevisionConflict.
   */
  saveCloudProject(
    userId: string,
    row: Omit<CloudProjectRow, 'revision' | 'updatedAt'>,
    expected: number | null,
  ): Promise<CloudProjectRow>;
  mediaRecord(userId: string, fingerprint: string): Promise<MediaRecord | null>;
  putMedia(userId: string, rec: MediaRecord, bytes: Uint8Array): Promise<void>;
  mediaBytes(userId: string, fingerprint: string): Promise<Uint8Array | null>;
  /** Admin: the latest connector calls of everyone (usage rows, source mcp). */
  mcpUsage(limit: number): Promise<import('../../src/gateway').UsageRow[]>;
}
