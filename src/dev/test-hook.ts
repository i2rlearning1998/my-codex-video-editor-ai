import { freeze, type EditorEngine } from '../core';
import type { EditorSession } from '../ui/session';

/** Detached snapshots only. No engine, session, or command references escape. */
export function createTestHook(
  engine: EditorEngine,
  session: EditorSession,
  getErrors: () => readonly unknown[] = () => [],
  getMedia: () => unknown = () => null,
  getCanvas: () => unknown = () => null,
) {
  const snapshot = <T>(value: T): T =>
    freeze(JSON.parse(JSON.stringify(value))) as T;
  return Object.freeze({
    version: '1',
    getProject: () => snapshot(engine.state),
    getSession: () =>
      snapshot({
        compositionId: session.source.composition.id,
        selectedIds: session.selectedIds,
        time: session.currentTime,
        playing: session.playing,
        canvasZoom: session.canvasZoom,
        timelinePxPerSecond: session.timelineZoom,
        soloTrackIds: session.soloTrackIds,
        /** W5-B: the selected timeline keyframes. */
        selectedKeyframes: session.selectedKeyframes,
      }),
    getHistory: () =>
      snapshot({
        canUndo: engine.canUndo,
        canRedo: engine.canRedo,
        labels: engine.history.undo.slice(-30).map((step) => step.label),
      }),
    getConsoleErrors: () => snapshot(getErrors()),
    /** W4-C: audio and video positions for the sync proof (a detached copy). */
    getMedia: () => snapshot(getMedia()),
    /** CV-013: the active canvas gesture's snap guides (a detached copy). */
    getCanvas: () => snapshot(getCanvas()),
  });
}

export function installTestHook(
  engine: EditorEngine,
  session: EditorSession,
  getErrors?: () => readonly unknown[],
  getMedia?: () => unknown,
  getCanvas?: () => unknown,
) {
  Object.defineProperty(window, '__AIVE__', {
    value: createTestHook(engine, session, getErrors, getMedia, getCanvas),
    configurable: true,
    writable: false,
  });
  return () => {
    delete (window as Window & { __AIVE__?: unknown }).__AIVE__;
  };
}
