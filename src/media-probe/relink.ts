import type { Asset } from '../core/model';
import type { MediaStore } from '../media/store';
import { mediaFingerprint } from '../media/fingerprint';
import { mediaKey } from '../media/import';
import { probeMedia } from './probe';
import { checkAbort, type MediaDetails } from './types';
export interface RelinkFile {
  name: string;
  size: number;
  mime: string;
  fingerprint: string;
  details: MediaDetails;
  lastModified?: number;
}
export interface MissingMedia {
  id: string;
  name: string;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  kind?: string;
}
export function describeMissing(asset: Asset): MissingMedia {
  return {
    id: asset.id,
    name:
      typeof asset.metadata.fileName === 'string'
        ? asset.metadata.fileName
        : asset.name,
    ...(typeof asset.metadata.size === 'number'
      ? { size: asset.metadata.size }
      : {}),
    ...(asset.duration !== undefined ? { duration: asset.duration } : {}),
    ...(asset.width !== undefined ? { width: asset.width } : {}),
    ...(asset.height !== undefined ? { height: asset.height } : {}),
    kind: asset.type,
  };
}
/** Snapshot detection: caller supplies the successfully enumerated store keys. */
export function detectMissingMedia(
  assets: readonly Asset[],
  availableKeys: ReadonlySet<string>,
): MissingMedia[] {
  return assets
    .filter(
      (a) =>
        a.source.kind === 'local' && !availableKeys.has(a.source.reference),
    )
    .map(describeMissing);
}
export function findRelinkCandidates(
  missing: MissingMedia,
  pickedFiles: readonly RelinkFile[],
) {
  return pickedFiles
    .filter((f) => !missing.kind || f.details.kind === missing.kind)
    .map((file) => {
      const matched: string[] = [];
      let score = 0;
      if (
        file.name.normalize('NFC').toLowerCase() ===
        missing.name.normalize('NFC').toLowerCase()
      ) {
        score += 4;
        matched.push('name');
      }
      if (missing.size !== undefined && file.size === missing.size) {
        score += 4;
        matched.push('size');
      }
      if (
        missing.duration !== undefined &&
        file.details.durationSec !== null &&
        Math.abs(file.details.durationSec - missing.duration) <= 0.05
      ) {
        score += 2;
        matched.push('duration');
      }
      if (
        missing.width !== undefined &&
        missing.height !== undefined &&
        file.details.width === missing.width &&
        file.details.height === missing.height
      ) {
        score += 2;
        matched.push('resolution');
      }
      return { file, score, matched };
    })
    .filter((c) => c.score >= 4)
    .sort(
      (a, b) => b.score - a.score || a.file.name.localeCompare(b.file.name),
    );
}
export function relink(projectMedia: Asset, file: RelinkFile): Asset {
  if (projectMedia.type !== file.details.kind)
    throw new Error('Replacement media kind does not match');
  if (!/^[a-f0-9]{32}$/.test(file.fingerprint))
    throw new Error('Invalid replacement fingerprint');
  const { width: _, height: __, duration: ___, ...original } = projectMedia;
  return {
    ...original,
    source: { kind: 'local', reference: mediaKey(file.fingerprint) },
    metadata: {
      ...projectMedia.metadata,
      fileName: file.name,
      mimeType: file.mime,
      size: file.size,
      fingerprint: file.fingerprint,
      removed: false,
      mediaProbe: { ...file.details },
      ...(file.lastModified !== undefined
        ? { lastModified: file.lastModified }
        : {}),
    },
    ...(file.details.width !== null ? { width: file.details.width } : {}),
    ...(file.details.height !== null ? { height: file.details.height } : {}),
    ...(file.details.durationSec !== null
      ? { duration: file.details.durationSec }
      : {}),
  };
}
/** Pure batch proposal. Equal top scores require user selection, never first-file wins. */
export function batchRelink(
  assets: readonly Asset[],
  pickedFiles: readonly RelinkFile[],
) {
  const replacements: Asset[] = [],
    unresolved: { id: string; reason: 'NO_MATCH' | 'AMBIGUOUS' }[] = [];
  for (const asset of assets) {
    const candidates = findRelinkCandidates(
      describeMissing(asset),
      pickedFiles,
    );
    if (!candidates.length) {
      unresolved.push({ id: asset.id, reason: 'NO_MATCH' });
      continue;
    }
    if (candidates[1]?.score === candidates[0]!.score) {
      unresolved.push({ id: asset.id, reason: 'AMBIGUOUS' });
      continue;
    }
    replacements.push(relink(asset, candidates[0]!.file));
  }
  return { replacements, unresolved };
}
/** Prepare bytes before applying the returned Asset via REPLACE_ASSET. */
export async function prepareRelink(
  file: File,
  store: MediaStore,
  options: { signal?: AbortSignal; probe?: typeof probeMedia } = {},
): Promise<RelinkFile> {
  checkAbort(options.signal);
  const details = await (options.probe ?? probeMedia)(file, options),
    fingerprint = await mediaFingerprint(file);
  checkAbort(options.signal);
  await store.write(
    mediaKey(fingerprint),
    file,
    options.signal ? { signal: options.signal } : {},
  );
  return {
    name: file.name,
    size: file.size,
    mime: file.type,
    fingerprint,
    details,
    lastModified: file.lastModified,
  };
}
