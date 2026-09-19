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

  #notify(reason: ChangeReason): void {
    this.#events.emit('state:changed', { state: this.#state, reason });
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
      this.#notify(direction);
      return true;
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
