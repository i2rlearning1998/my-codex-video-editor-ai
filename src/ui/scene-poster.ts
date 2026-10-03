// I2, I3: a scene drawn at its start into a small canvas (My Templates
// posters, the scene strip's thumbnails), with the editor's own renderer.
import { compositionAt, type EditorEngine } from '../core';
import type { FrameProvider, RenderSource } from '../render/adapter';
import { drawComposition, fitViewport } from '../render/canvas';
import type { EditorSession } from './session';

export function drawScenePoster(
  canvas: HTMLCanvasElement,
  engine: EditorEngine,
  session: EditorSession,
  sceneId: string,
  frames?: FrameProvider,
) {
  const scene = engine.state.compositions.find((item) => item.id === sceneId);
  const context = canvas.getContext('2d');
  if (!scene || !context) return false;
  const source: RenderSource = {
    composition: compositionAt(scene, 0),
    assets: engine.state.assets,
    background: scene.backgroundColor,
    currentTime: 0,
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
) {
  const scene = engine.state.compositions.find((item) => item.id === sceneId);
  if (!scene) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, Math.round((width * scene.height) / scene.width));
  try {
    return drawScenePoster(canvas, engine, session, sceneId, frames)
      ? canvas.toDataURL('image/jpeg', 0.75)
      : undefined;
  } catch {
    return undefined;
  }
}
