import type { DeepReadonly, Project } from './model';

export type ChangeReason = 'command' | 'transaction' | 'undo' | 'redo' | 'load';
export interface EditorEvents {
  'command:before': { type: string; transactionId: string };
  'command:applied': { type: string; transactionId: string };
  'command:failed': { type: string; transactionId: string; error: Error };
  'transaction:committed': { id: string; label: string; commandCount: number };
  'transaction:failed': { id: string; error: Error };
  'state:changed': { state: DeepReadonly<Project>; reason: ChangeReason };
  'history:changed': { canUndo: boolean; canRedo: boolean };
}
type Listener<T> = (event: T) => void;
export class EventBus {
  #listeners = new Map<keyof EditorEvents, Set<Listener<never>>>();
  constructor(
    private readonly onListenerError: (error: unknown) => void = () => {},
  ) {}

  on<K extends keyof EditorEvents>(
    type: K,
    listener: Listener<EditorEvents[K]>,
  ): () => void {
    const listeners = this.#listeners.get(type) ?? new Set<Listener<never>>();
    listeners.add(listener as Listener<never>);
    this.#listeners.set(type, listeners);
    return () => {
      listeners.delete(listener as Listener<never>);
    };
  }

  emit<K extends keyof EditorEvents>(type: K, event: EditorEvents[K]): void {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) {
      try {
        listener(event as never);
      } catch (error) {
        // Observers must never turn a successful commit into an apparent failure.
        try {
          this.onListenerError(error);
        } catch {
          /* Isolate diagnostic callbacks, too. */
        }
      }
    }
  }
}
