import type { Asset } from '../core';
import { mediaFingerprint } from './fingerprint';
import { classifyMedia, type MediaKind, type MediaProbe } from './probe';
import type { MediaStore } from './store';

export interface ImportProgress {
  fileName: string;
  /** Zero-based position in the batch. */
  index: number;
  count: number;
  /** 0..1 for the current file. */
  fraction: number;
}

export type ImportStatus =
  'imported' | 'duplicate' | 'unsupported' | 'unreadable' | 'failed';

export interface ImportOutcome {
  fileName: string;
  status: ImportStatus;
  assetId?: string;
  error?: string;
}

export interface ImportDependencies {
  store: MediaStore;
  probe(blob: Blob, kind: MediaKind, signal?: AbortSignal): Promise<MediaProbe>;
  hasAsset(id: string): boolean;
  /** Adds the asset to the project as one undoable step. */
  addAsset(asset: Asset): void;
  onProgress?(progress: ImportProgress): void;
  signal?: AbortSignal;
}

export const mediaKey = (fingerprint: string) => `media/${fingerprint}`;
export const thumbnailKey = (fingerprint: string) => `thumbs/${fingerprint}`;
export const assetIdFor = (fingerprint: string) =>
  `media-${fingerprint.slice(0, 16)}`;

/** The stored fingerprint of an imported asset, or null for other assets. */
export function assetFingerprint(asset: {
  source: { kind: string; reference: string };
}): string | null {
  const match = /^media\/([0-9a-f]{32})$/.exec(asset.source.reference);
  return asset.source.kind === 'local' && match ? match[1]! : null;
}

export function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

/**
 * Imports files one at a time: classify, fingerprint, stream into the media store,
 * probe, then add the asset reference. Each imported file is its own undo step.
 * Cancelling removes the current file's bytes and skips the rest (the returned list
 * then covers only the files handled before the cancel).
 */
export async function importMediaFiles(
  files: readonly File[],
  deps: ImportDependencies,
): Promise<{ outcomes: ImportOutcome[]; cancelled: boolean }> {
  const outcomes: ImportOutcome[] = [];
  for (const [index, file] of files.entries()) {
    const report = (fraction: number) =>
      deps.onProgress?.({
        fileName: file.name,
        index,
        count: files.length,
        fraction,
      });
    if (deps.signal?.aborted) return { outcomes, cancelled: true };
    report(0);
    const kind = classifyMedia(file);
    if (!kind) {
      outcomes.push({ fileName: file.name, status: 'unsupported' });
      continue;
    }
    let key: string | null = null;
    let stored = false;
    try {
      const fingerprint = await mediaFingerprint(file);
      const id = assetIdFor(fingerprint);
      key = mediaKey(fingerprint);
      stored = await deps.store.has(key);
      if (deps.hasAsset(id)) {
        // Already referenced: only restore the bytes if this browser lacks them
        // (for example a project file opened on another machine).
        if (!stored)
          await deps.store.write(key, file, {
            ...(deps.signal ? { signal: deps.signal } : {}),
            onProgress: (written, total) => report(total ? written / total : 1),
          });
        stored = true;
        outcomes.push({
          fileName: file.name,
          status: 'duplicate',
          assetId: id,
        });
        report(1);
        continue;
      }
      if (!stored)
        await deps.store.write(key, file, {
          ...(deps.signal ? { signal: deps.signal } : {}),
          onProgress: (written, total) =>
            report(total ? (written / total) * 0.9 : 0.9),
        });
      // Stored files can lose their MIME type (OPFS); SVG needs it to decode.
      const read = (await deps.store.read(key)) ?? file;
      const stable =
        read.type || !file.type ? read : read.slice(0, read.size, file.type);
      let probe: MediaProbe;
      try {
        probe = await deps.probe(stable, kind, deps.signal);
      } catch (error) {
        if (isAbort(error)) throw error;
        if (!stored) await deps.store.remove(key);
        outcomes.push({ fileName: file.name, status: 'unreadable' });
        continue;
      }
      if (deps.signal?.aborted)
        throw new DOMException('Import cancelled', 'AbortError');
      const asset: Asset = {
        id,
        name: file.name.trim().slice(0, 256) || 'Untitled media',
        type: kind,
        source: { kind: 'local', reference: key },
        metadata: {
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          fileName: file.name,
          lastModified: file.lastModified,
          fingerprint,
        },
        ...(probe.width ? { width: Math.max(1, Math.round(probe.width)) } : {}),
        ...(probe.height
          ? { height: Math.max(1, Math.round(probe.height)) }
          : {}),
        ...(probe.duration !== undefined ? { duration: probe.duration } : {}),
      };
      deps.addAsset(asset);
      outcomes.push({ fileName: file.name, status: 'imported', assetId: id });
      report(1);
    } catch (error) {
      if (isAbort(error)) {
        if (key && !stored) await deps.store.remove(key).catch(() => undefined);
        return { outcomes, cancelled: true };
      }
      outcomes.push({
        fileName: file.name,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { outcomes, cancelled: false };
}
