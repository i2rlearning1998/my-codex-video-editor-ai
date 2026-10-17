import type { Asset } from '../core';
import { mediaFingerprint } from '../media/fingerprint';
import { mediaKey, assetIdFor } from '../media/import';
import type { RecordingOutput } from './types';
/** Caller writes each blob to its storageKey, then commits the corresponding Asset. */
export async function toMediaItem(
  recording: RecordingOutput,
  name = 'Recording',
) {
  async function item(
    blob: Blob,
    width: number,
    height: number,
    label: string,
    fps = recording.fps,
  ) {
    const fingerprint = await mediaFingerprint(blob),
      storageKey = mediaKey(fingerprint);
    const asset: Asset = {
      id: assetIdFor(fingerprint),
      name: label.trim().slice(0, 256) || 'Recording',
      type: blob.type.startsWith('video/') ? 'video' : 'audio',
      source: { kind: 'local', reference: storageKey },
      duration: recording.durationSec,
      ...(width > 0 ? { width, height } : {}),
      metadata: {
        mimeType: blob.type,
        size: blob.size,
        fileName: label,
        fingerprint,
        recording: { fps },
      },
    };
    return {
      blob,
      mime: blob.type,
      name: asset.name,
      durationSec: recording.durationSec,
      storageKey,
      asset,
    };
  }
  const primary = await item(
    recording.blob,
    recording.width,
    recording.height,
    name,
  );
  return {
    ...primary,
    ...(recording.camera
      ? {
          camera: await item(
            recording.camera.blob,
            recording.camera.width,
            recording.camera.height,
            `${name} camera`,
            recording.camera.fps,
          ),
          pip: recording.camera.layout,
        }
      : {}),
  };
}
