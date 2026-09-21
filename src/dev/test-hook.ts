import { freeze, type EditorEngine } from '../core';
import type { EditorSession } from '../ui/session';

/** Detached snapshots only. No engine, session, or command references escape. */
export function createTestHook(
  engine: EditorEngine,
  session: EditorSession,
  getErrors: () => readonly unknown[] = () => [],
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
      }),
    getHistory: () =>
      snapshot({
        canUndo: engine.canUndo,
        canRedo: engine.canRedo,
        labels: engine.history.undo.slice(-30).map((step) => step.label),
      }),
    getConsoleErrors: () => snapshot(getErrors()),
  });
}

export function installTestHook(
  engine: EditorEngine,
  session: EditorSession,
  getErrors?: () => readonly unknown[],
) {
  Object.defineProperty(window, '__AIVE__', {
    value: createTestHook(engine, session, getErrors),
    configurable: true,
    writable: false,
  });
  return () => {
    delete (window as Window & { __AIVE__?: unknown }).__AIVE__;
  };
}
