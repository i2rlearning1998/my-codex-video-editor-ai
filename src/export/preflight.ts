// QA-001 / QA-002: checks before an export. Pure: reads scenes and assets,
// changes nothing. Each issue names the scene and (when there is one) the
// layer, so the dialog can jump to it. Missing media is EXP-008's own check.
import {
  boundsCorners,
  transformPoint,
  type Asset,
  type Composition,
  type DeepReadonly,
} from '../core';
import { selectionBounds } from '../render/selection';

export type PreflightCode =
  | 'empty-scene'
  | 'outside-canvas'
  | 'low-resolution'
  | 'outside-safe-area'
  | 'empty-track';

export interface PreflightIssue {
  readonly code: PreflightCode;
  readonly sceneId: string;
  readonly sceneName: string;
  readonly layerId?: string;
  readonly layerName?: string;
  /** Plain numbers for the message (for example the upscale factor). */
  readonly value?: number;
}

/** A picture drawn more than this many times its own size looks soft. */
export const UPSCALE_LIMIT = 1.5;
/** Text closer than this share of the canvas to an edge may be cut by a TV. */
export const SAFE_MARGIN = 0.05;

export function preflight(
  scenes: readonly DeepReadonly<Composition>[],
  assets: readonly DeepReadonly<Asset>[],
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  for (const scene of scenes) {
    const base = { sceneId: scene.id, sceneName: scene.name };
    const clipped = scene.tracks.filter((track) => track.clips.length);
    if (!clipped.length) {
      issues.push({ ...base, code: 'empty-scene' });
      continue;
    }
    for (const track of scene.tracks)
      if (!track.clips.length)
        issues.push({ ...base, code: 'empty-track', layerName: track.name });
    const source = { composition: scene, assets, background: '#000000' };
    for (const layer of scene.layers) {
      const measured = selectionBounds(source, layer.id);
      if (!measured) continue;
      const corners = boundsCorners(measured.bounds).map((corner) =>
        transformPoint(measured.matrix, corner),
      );
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
      const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
      const info = { ...base, layerId: layer.id, layerName: layer.name };
      if (
        maxX <= 0 ||
        maxY <= 0 ||
        minX >= scene.width ||
        minY >= scene.height
      ) {
        issues.push({ ...info, code: 'outside-canvas' });
        continue;
      }
      if (
        layer.type === 'text' &&
        (minX < scene.width * SAFE_MARGIN ||
          maxX > scene.width * (1 - SAFE_MARGIN) ||
          minY < scene.height * SAFE_MARGIN ||
          maxY > scene.height * (1 - SAFE_MARGIN))
      )
        issues.push({ ...info, code: 'outside-safe-area' });
      const asset = assets.find((a) => a.id === layer.assetId);
      if (
        asset?.width &&
        asset.height &&
        (layer.type === 'image' || layer.type === 'video')
      ) {
        const drawn = Math.max(
          (maxX - minX) / asset.width,
          (maxY - minY) / asset.height,
        );
        if (drawn > UPSCALE_LIMIT)
          issues.push({
            ...info,
            code: 'low-resolution',
            value: Math.round(drawn * 10) / 10,
          });
      }
    }
  }
  return issues;
}
