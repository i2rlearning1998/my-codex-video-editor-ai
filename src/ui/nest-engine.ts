// FIX1 F6: the editor's engine while a nested clip is open. Outside a nest
// it is the real engine. Inside one, everything the UI reads (`state`,
// `state:changed`) is the nested clip's inside as an ordinary scene (its
// lanes and clips, src/nesting/view.ts), so the timeline, canvas, panels and
// drops edit it unchanged. Every edit runs on a scratch engine first (the
// same validation and capabilities), then goes to the real engine as one
// SET_NESTED_CONTENT command under the edit's own label: one undo step, in
// the real history. Undo and redo are the real engine's; the scratch scene
// is derived again from the real project after every change. Saving,
// autosave and export read the real engine (`real`).
import {
  EditorEngine,
  EventBus,
  type DeepReadonly,
  type EditorCommand,
  type EditorEvents,
  type JsonValue,
  type Project,
} from '../core';
import { packPath, unpackPath } from '../nesting';

export interface NestPath {
  readonly compositionId: string;
  /** The nested clips entered, outermost first (their group layer ids). */
  readonly path: readonly string[];
}

export interface NestEngine extends EditorEngine {
  /** The real engine (saving, export, the breadcrumb). */
  readonly real: EditorEngine;
  /** The open nest, or null on the main timeline. */
  readonly nest: NestPath | null;
  /** Opens (path non-empty) or closes (null) a nest. */
  setNest(nest: NestPath | null): void;
}

export function createNestEngine(real: EditorEngine): NestEngine {
  let nest: NestPath | null = null;
  let levels: Project[] = [];
  let scratch: EditorEngine | null = null;
  const events = new EventBus();
  const rebuild = () => {
    if (!nest) {
      levels = [];
      scratch = null;
      return;
    }
    try {
      levels = unpackPath(real.state, nest.compositionId, nest.path);
      scratch = new EditorEngine(levels.at(-1)!, {
        capabilities: real.capabilities,
      });
    } catch {
      // The nest is gone (undone, deleted or un-nested): back to the main
      // timeline.
      nest = null;
      levels = [];
      scratch = null;
    }
  };
  const view = () => scratch?.state ?? real.state;
  /** Runs `commands` inside the nest and writes the result back. */
  const runInside = (
    label: string,
    commands: readonly EditorCommand[],
    kind: 'command' | 'transaction',
  ): readonly JsonValue[] => {
    const inside = scratch!;
    const before: unknown = inside.state;
    const results =
      kind === 'command'
        ? [inside.commands.execute(commands[0]!, label)]
        : inside.commands.transaction(label, commands);
    if ((inside.state as unknown) === before) return results;
    const command = packPath(
      real.state,
      nest!.compositionId,
      nest!.path,
      levels,
      inside.state as unknown as object,
    );
    real.commands.transaction(label, [command]);
    return results;
  };
  // Real changes reach the UI as changes of what it shows.
  real.on('state:changed', (event) => {
    rebuild();
    events.emit('state:changed', { ...event, state: view() });
  });
  for (const type of [
    'history:changed',
    'transaction:committed',
    'transaction:failed',
    'command:before',
    'command:applied',
    'command:failed',
  ] as const)
    real.on(type, (event) => events.emit(type, event as never));

  const commands = Object.create(real.commands) as EditorEngine['commands'];
  Object.assign(commands, {
    execute(command: EditorCommand, label: string = command.type) {
      if (!scratch) return real.commands.execute(command, label);
      return runInside(label, [command], 'command')[0] ?? null;
    },
    transaction(label: string, list: readonly EditorCommand[]) {
      if (!scratch) return real.commands.transaction(label, list);
      return runInside(label, list, 'transaction');
    },
    capture(action: () => void) {
      return (scratch ?? real).commands.capture(action);
    },
  });

  const wrapper = {
    real,
    get nest() {
      return nest;
    },
    setNest(next: NestPath | null) {
      nest = next && next.path.length ? next : null;
      rebuild();
      events.emit('state:changed', { state: view(), reason: 'load' });
    },
    get state(): DeepReadonly<Project> {
      return view();
    },
    get canUndo() {
      return real.canUndo;
    },
    get canRedo() {
      return real.canRedo;
    },
    get undoLabel() {
      return real.undoLabel;
    },
    get redoLabel() {
      return real.redoLabel;
    },
    get history() {
      return real.history;
    },
    get capabilities() {
      return real.capabilities;
    },
    commands,
    on<K extends keyof EditorEvents>(
      type: K,
      listener: (event: EditorEvents[K]) => void,
    ) {
      return events.on(type, listener);
    },
    undo: () => real.undo(),
    redo: () => real.redo(),
    library(label: string, inputs: readonly EditorCommand[]) {
      real.library(label, inputs);
    },
    preview(inputs: readonly EditorCommand[]) {
      return (scratch ?? real).preview(inputs);
    },
    removeLegacyThemeMarkers: () => real.removeLegacyThemeMarkers(),
    load(project: unknown) {
      nest = null;
      levels = [];
      scratch = null;
      real.load(project);
    },
  };
  return wrapper as unknown as NestEngine;
}
