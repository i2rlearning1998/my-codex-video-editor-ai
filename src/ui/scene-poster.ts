// I2, I3: a scene drawn at its start into a small canvas (My Templates
// posters, the scene strip's thumbnails), with the editor's own renderer.
import { compositionAt, type EditorEngine } from '../core';
import type { FrameProvider, RenderSource } from '../render/adapter';
import { drawComposition, fitViewport } from '../render/canvas';
import type { EditorSession } from './session';
import { firstContentTime } from '../render/first-content';

const hasVideo = (layers: readonly unknown[]): boolean =>
  (
    layers as readonly {
      type: string;
      assetId?: string | null;
      children: readonly unknown[];
    }[]
  ).some((l) => (l.type === 'video' && !!l.assetId) || hasVideo(l.children));
export function drawScenePoster(
  canvas: HTMLCanvasElement,
  engine: EditorEngine,
  session: EditorSession,
  sceneId: string,
  frames?: FrameProvider,
  /**
   * The second to draw. ROUND-C1: by default the first moment with content
   * (never the blank frame of a fade-in from 0:00).
   */
  when?: number,
) {
  const scene = engine.state.compositions.find((item) => item.id === sceneId);
  const context = canvas.getContext('2d');
  if (!scene || !context) return false;
  // ROUND-C1 F1: a scene with video keeps its poster at 0:00 as before: a
  // poster at another moment would make the stage's own video decoders seek
  // (one element per layer) and could pull a playing picture off its sound.
  const at =
    when ?? (hasVideo(scene.layers) ? 0 : firstContentTime(scene as never));
  const source: RenderSource = {
    composition: compositionAt(scene, at),
    assets: engine.state.assets,
    background: scene.backgroundColor,
    currentTime: at,
    ...(frames ? { frames, playing: false } : {}),
    ...(session.source.measureText
      ? { measureText: session.source.measureText }
      : {}),
  };
  drawComposition(
    context,
    source,
    fitViewport(canvas.width, canvas.height, scene, 1, { padding: 0 }),
    null,
    { overlays: false },
  );
  return true;
}

/** A small JPEG of the scene's first frame, or undefined. */
export function scenePosterUrl(
  engine: EditorEngine,
  session: EditorSession,
  sceneId: string,
  frames?: FrameProvider,
  width = 256,
  /** ROUND-C1: the first moment with content unless a time is given. */
  at?: number,
) {
  const scene = engine.state.compositions.find((item) => item.id === sceneId);
  if (!scene) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, Math.round((width * scene.height) / scene.width));
  try {
    return drawScenePoster(canvas, engine, session, sceneId, frames, at)
      ? canvas.toDataURL('image/jpeg', 0.75)
      : undefined;
  } catch {
    return undefined;
  }
}
