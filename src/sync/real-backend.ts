// P4 Part 2: the editor's Cloud switch and "Save to your cloud?" send the real
// thing: the project JSON, AI compositions and My Templates (and, when chosen,
// the media files) to the person's own cloud (Supabase, or the local account
// backend), and stop with a plain sentence when the plan's space is full.
// Nothing is sent without a signed-in person.
import {
  CloudConflictError,
  CloudQuotaError,
  assertRoom,
  type CloudBackend as AccountCloud,
  type CloudMediaInfo,
} from '../cloud/backend';
import type { CloudBackend, GroupSize, SyncGroup } from './cloud-sync';
import { readLinks, writeLink } from './cloud-links';

export interface MediaFile {
  readonly fingerprint: string;
  readonly info: CloudMediaInfo;
  readonly blob: Blob;
}
export interface LibraryItem {
  readonly id: string;
  readonly name: string;
  readonly document: string;
  readonly thumbnail?: string | null;
}
/** What the open project holds right now (read at send time, never cached). */
export interface SyncCollector {
  project(): {
    readonly name: string;
    readonly schemaVersion: number;
    readonly document: string;
    readonly thumbnail: string | null;
  };
  library(group: 'templates' | 'ai'): readonly LibraryItem[];
  media(): Promise<readonly MediaFile[]>;
}
export interface RealBackendOptions {
  readonly cloud: () => Promise<AccountCloud>;
  /** The plan's cloud space in bytes (null: no limit). */
  readonly limitBytes: () => number | null;
  readonly collect: SyncCollector;
  readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  readonly signedIn: () => boolean;
}

const SIZES_KEY = 'aive.cloudSent';
interface Sent {
  bytes: number;
  hash: string;
}
/** A small, fast fingerprint of a text (change detection only). */
const hashOf = (text: string): string => {
  let h = 5381;
  for (let i = 0; i < text.length; i++)
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
};

export function realSyncBackend(
  options: RealBackendOptions,
): CloudBackend & { lastSent(): Record<string, Sent> } {
  const read = (): Record<string, Sent> => {
    try {
      return JSON.parse(options.storage?.getItem(SIZES_KEY) ?? '{}') as never;
    } catch {
      return {};
    }
  };
  const write = (value: Record<string, Sent>) => {
    try {
      options.storage?.setItem(SIZES_KEY, JSON.stringify(value));
    } catch {
      /* the next send decides again */
    }
  };
  return {
    get connected() {
      return options.signedIn();
    },
    lastSent: read,
    async push(projectId, group: SyncGroup, _size: GroupSize) {
      if (!options.signedIn()) return;
      const cloud = await options.cloud();
      const sent = read();
      const limit = options.limitBytes();
      if (group === 'project') {
        const p = options.collect.project();
        const key = `p:${projectId}`;
        const bytes = p.document.length + (p.thumbnail?.length ?? 0);
        const hash = hashOf(p.document + (p.thumbnail ?? '') + p.name);
        if (sent[key]?.hash === hash) return;
        await assertRoom(
          cloud,
          limit,
          Math.max(0, bytes - (sent[key]?.bytes ?? 0)),
        );
        const input = {
          name: p.name,
          schemaVersion: p.schemaVersion,
          document: p.document,
          thumbnail: p.thumbnail,
        };
        const link = readLinks(options.storage)[projectId];
        const saved = link
          ? await cloud.saveProject(link.cloudId, link.revision, input)
          : await cloud.createProject(input);
        writeLink(options.storage, projectId, {
          cloudId: saved.id,
          revision: saved.revision,
        });
        sent[key] = { bytes, hash };
        write(sent);
        return;
      }
      if (group === 'templates' || group === 'ai') {
        const changed = options.collect
          .library(group)
          .map((item) => {
            const key = `l:${group}:${projectId}:${item.id}`;
            const bytes = item.document.length + (item.thumbnail?.length ?? 0);
            return {
              item,
              key,
              bytes,
              hash: hashOf(item.document + (item.thumbnail ?? '') + item.name),
            };
          })
          .filter((entry) => sent[entry.key]?.hash !== entry.hash);
        if (!changed.length) return;
        await assertRoom(
          cloud,
          limit,
          changed.reduce(
            (n, e) => n + Math.max(0, e.bytes - (sent[e.key]?.bytes ?? 0)),
            0,
          ),
        );
        for (const entry of changed) {
          await cloud.saveLibraryItem({
            id: `${projectId}:${group}:${entry.item.id}`,
            projectId,
            kind: group,
            name: entry.item.name,
            document: entry.item.document,
            thumbnail: entry.item.thumbnail ?? null,
          });
          sent[entry.key] = { bytes: entry.bytes, hash: entry.hash };
        }
        write(sent);
        return;
      }
      // Media: only files the cloud does not have, by content fingerprint.
      const files = await options.collect.media();
      if (!files.length) return;
      const have = await cloud.hasMedia(files.map((f) => f.fingerprint));
      const fresh = files.filter((f) => !have.has(f.fingerprint));
      if (!fresh.length) return;
      await assertRoom(
        cloud,
        limit,
        fresh.reduce((n, f) => n + f.blob.size, 0),
      );
      for (const file of fresh)
        await cloud.uploadMedia(file.fingerprint, file.blob, file.info);
    },
  };
}

/** The words for a failed send (keys exist in the locale files). */
export function syncFailure(error: unknown): {
  key: 'cloud.exit.noRoom' | 'cloud.exit.conflict' | 'cloud.exit.failed';
  params: Record<string, string>;
} {
  const mb = (n: number) => `${Math.max(1, Math.round(n / 1_048_576))} MB`;
  if (error instanceof CloudQuotaError)
    return {
      key: 'cloud.exit.noRoom',
      params: { used: mb(error.used), limit: mb(error.limit) },
    };
  if (error instanceof CloudConflictError)
    return { key: 'cloud.exit.conflict', params: {} };
  return {
    key: 'cloud.exit.failed',
    params: { error: error instanceof Error ? error.message : String(error) },
  };
}
