import { applyCommand, validateCommand, type Command } from './commands';
import { CapabilityRegistry, type CapabilityInvocation } from './capabilities';
import { EventBus, type ChangeReason, type EditorEvents } from './events';
import {
  assertJson,
  freeze,
  validateProject,
  type DeepReadonly,
  type JsonValue,
  type Project,
} from './model';

export type EditorCommand = Command | CapabilityInvocation;
export interface HistoryMetadata {
  id: string;
  label: string;
  timestamp: string;
  kind: 'command' | 'transaction';
  commands: EditorCommand[];
  /** J1: the scenes (composition ids) this edit changed, added or removed. */
  compositionIds: string[];
}
interface HistoryEntry {
  metadata: DeepReadonly<HistoryMetadata>;
  before: DeepReadonly<Project>;
  after: DeepReadonly<Project>;
}
export interface EngineOptions {
  historyLimit?: number;
  now?: () => string;
  onListenerError?: (error: unknown) => void;
}

/** The sole owner of canonical project state. All ordinary edits enter its command bus. */
export class EditorEngine {
  #state: DeepReadonly<Project>;
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  #busy = false;
  #events: EventBus;
  #limit: number;
  #now: () => string;
  readonly capabilities = new CapabilityRegistry();
  readonly commands: CommandBus;

  constructor(project: unknown, options: EngineOptions = {}) {
    this.#state = freeze(validateProject(project));
    this.#limit = options.historyLimit ?? 100;
    if (!Number.isInteger(this.#limit) || this.#limit < 1)
      throw new Error('History limit must be a positive integer');
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#events = new EventBus(options.onListenerError);
    this.commands = new CommandBus((commands, label, kind) =>
      this.#execute(commands, label, kind),
    );
  }

  get state(): DeepReadonly<Project> {
    return this.#state;
  }
  get canUndo(): boolean {
    return this.#undo.length > 0;
  }
  get canRedo(): boolean {
    return this.#redo.length > 0;
  }
  get history(): DeepReadonly<{
    undo: HistoryMetadata[];
    redo: HistoryMetadata[];
  }> {
    return freeze({
      undo: this.#undo.map(
        (entry) =>
          structuredClone(entry.metadata) as unknown as HistoryMetadata,
      ),
      redo: this.#redo.map(
        (entry) =>
          structuredClone(entry.metadata) as unknown as HistoryMetadata,
      ),
    });
  }
  on<K extends keyof EditorEvents>(
    type: K,
    listener: (event: EditorEvents[K]) => void,
  ): () => void {
    return this.#events.on(type, listener);
  }

  #exclusive<T>(operation: () => T): T {
    if (this.#busy) throw new Error('Reentrant editor mutation is not allowed');
    this.#busy = true;
    try {
      return operation();
    } finally {
      this.#busy = false;
    }
  }

  #notify(reason: ChangeReason, compositionIds?: readonly string[]): void {
    this.#events.emit('state:changed', {
      state: this.#state,
      reason,
      ...(compositionIds ? { compositionIds } : {}),
    });
    this.#events.emit('history:changed', {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
    });
  }

  #execute(
    inputs: readonly EditorCommand[],
    label: string,
    kind: 'command' | 'transaction',
  ): readonly JsonValue[] {
    return this.#exclusive(() => {
      if (!label.trim() || label.length > 256)
        throw new Error('History label must contain 1–256 characters');
      if (!inputs.length)
        throw new Error('Transaction must contain at least one command');
      const id = crypto.randomUUID();
      let activeType = 'INVALID';
      try {
        assertJson(inputs);
        const commands = structuredClone(inputs);
        let draft = structuredClone(this.#state) as unknown as Project;
        const results: JsonValue[] = [];
        for (const raw of commands) {
          activeType = typeof raw?.type === 'string' ? raw.type : 'INVALID';
          this.#events.emit('command:before', {
            type: activeType,
            transactionId: id,
          });
          if (activeType.startsWith('plugin:'))
            results.push(
              this.capabilities.execute(draft, raw as CapabilityInvocation),
            );
          else {
            applyCommand(draft, validateCommand(raw));
            results.push(null);
          }
          // Validate each semantic boundary, not just the transaction's final state.
          draft = validateProject(draft);
        }
        // No-op actions do not invalidate redo or create empty history entries.
        if (JSON.stringify(draft) === JSON.stringify(this.#state))
          return Object.freeze(results);
        draft.metadata.updatedAt = this.#now();
        const after = freeze(validateProject(draft));
        const metadata = freeze({
          id,
          label,
          timestamp: draft.metadata.updatedAt,
          kind,
          commands: [...commands],
          compositionIds: changedCompositions(this.#state, after),
        });
        this.#undo.push({ metadata, before: this.#state, after });
        if (this.#undo.length > this.#limit) this.#undo.shift();
        this.#redo = [];
        this.#state = after;
        // Applied events refer only to committed changes; a rollback emits none.
        commands.forEach((command) =>
          this.#events.emit('command:applied', {
            type: command.type,
            transactionId: id,
          }),
        );
        this.#events.emit('transaction:committed', {
          id,
          label,
          commandCount: commands.length,
        });
        this.#notify(kind);
        return Object.freeze(results);
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        this.#events.emit('command:failed', {
          type: activeType,
          transactionId: id,
          error,
        });
        this.#events.emit('transaction:failed', { id, error });
        throw error;
      }
    });
  }

  undo(): boolean {
    return this.#restore('undo');
  }
  redo(): boolean {
    return this.#restore('redo');
  }
  #restore(direction: 'undo' | 'redo'): boolean {
    return this.#exclusive(() => {
      const source = direction === 'undo' ? this.#undo : this.#redo;
      const destination = direction === 'undo' ? this.#redo : this.#undo;
      const entry = source.pop();
      if (!entry) return false;
      destination.push(entry);
      this.#state = direction === 'undo' ? entry.before : entry.after;
      // J1: the scenes this edit changed, so the editor can open them.
      const present = new Set(this.#state.compositions.map((item) => item.id));
      this.#notify(
        direction,
        entry.metadata.compositionIds.filter((id) => present.has(id)),
      );
      return true;
    });
  }

  /**
   * I1.6: library changes that are not project edits (a media import,
   * rename or delete, or the project's name) and so are not undoable. Only
   * ADD_ASSET, REPLACE_ASSET and SET_PROJECT_NAME are accepted. They apply to the current document and are
   * carried into every stored undo and redo snapshot, so undoing a later
   * edit never removes or restores media. History is left as it is.
   */
  library(label: string, inputs: readonly EditorCommand[]): void {
    this.#exclusive(() => {
      if (!label.trim() || label.length > 256)
        throw new Error('Library label must contain 1–256 characters');
      if (!inputs.length) throw new Error('No library change given');
      assertJson(inputs);
      const commands = structuredClone(inputs).map((raw) => {
        const command = validateCommand(raw);
        if (
          command.type !== 'ADD_ASSET' &&
          command.type !== 'REPLACE_ASSET' &&
          command.type !== 'SET_PROJECT_NAME'
        )
          throw new Error(
            `${command.type} is a project edit, not a library change`,
          );
        return command;
      });
      const apply = (
        snapshot: DeepReadonly<Project>,
        strict: boolean,
      ): DeepReadonly<Project> => {
        const draft = structuredClone(snapshot) as unknown as Project;
        for (const command of commands) {
          if (command.type === 'SET_PROJECT_NAME') {
            applyCommand(draft, command);
            continue;
          }
          const exists = draft.assets.some((asset) =>
            command.type === 'ADD_ASSET'
              ? asset.id === command.asset.id
              : asset.id === command.assetId,
          );
          // Snapshots that already (or never) hold the asset stay as they are.
          if (!strict && (command.type === 'ADD_ASSET') === exists) continue;
          applyCommand(draft, command);
        }
        try {
          return freeze(validateProject(draft));
        } catch (error) {
          if (strict) throw error;
          return snapshot;
        }
      };
      const next = apply(this.#state, true);
      if (JSON.stringify(next) === JSON.stringify(this.#state)) return;
      const rebase = (entries: HistoryEntry[]) =>
        entries.forEach((entry) => {
          entry.before = apply(entry.before, false);
          entry.after = apply(entry.after, false);
        });
      rebase(this.#undo);
      rebase(this.#redo);
      this.#state = next;
      this.#notify('library');
    });
  }

  /** Explicit document/session boundary, never an edit or an undoable command. */
  load(project: unknown): void {
    this.#exclusive(() => {
      const validated = freeze(validateProject(project));
      this.#state = validated;
      this.#undo = [];
      this.#redo = [];
      this.#notify('load');
    });
  }
}

/** J1: composition ids whose content differs between two snapshots. */
function changedCompositions(
  before: DeepReadonly<Project>,
  after: DeepReadonly<Project>,
): string[] {
  const old = new Map(before.compositions.map((item) => [item.id, item]));
  const ids: string[] = [];
  for (const composition of after.compositions) {
    const previous = old.get(composition.id);
    old.delete(composition.id);
    if (
      previous !== composition &&
      JSON.stringify(previous) !== JSON.stringify(composition)
    )
      ids.push(composition.id);
  }
  ids.push(...old.keys());
  return ids;
}

export class CommandBus {
  constructor(
    private readonly run: (
      commands: readonly EditorCommand[],
      label: string,
      kind: 'command' | 'transaction',
    ) => readonly JsonValue[],
  ) {}
  execute(command: EditorCommand, label: string = command.type): JsonValue {
    return this.run([command], label, 'command')[0] ?? null;
  }
  transaction(
    label: string,
    commands: readonly EditorCommand[],
  ): readonly JsonValue[] {
    return this.run(commands, label, 'transaction');
  }
}
