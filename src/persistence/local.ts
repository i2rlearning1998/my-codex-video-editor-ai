import type { EditorEngine } from '../core/engine';
import type { DeepReadonly, Project } from '../core/model';
import {
  deserializeProject,
  FutureSchemaError,
  MigrationRegistry,
  serializeProject,
} from '../core/serialization';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface LoadResult {
  project: Project | null;
  recovered: boolean;
  warning: string | null;
}

/** One document slot with last-known-good backup. Storage writes are synchronous. */
export class LocalProjectStore {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly key = 'ai-native-editor:project',
    private readonly migrations = new MigrationRegistry(),
  ) {}

  save(project: Project | DeepReadonly<Project>): void {
    const serialized = serializeProject(project);
    const current = this.storage.getItem(this.key);
    if (current !== null) {
      let valid = false;
      try {
        deserializeProject(current, this.migrations);
        valid = true;
      } catch (error) {
        if (error instanceof FutureSchemaError) throw error;
        // Preserve the corrupt primary once for inspection instead of destroying it.
        if (this.storage.getItem(`${this.key}:recovery`) === null)
          this.storage.setItem(`${this.key}:recovery`, current);
      }
      if (valid) this.storage.setItem(`${this.key}:backup`, current);
    }
    // If backup/quarantine fails, the primary is untouched; if primary fails, backup remains valid.
    this.storage.setItem(this.key, serialized);
  }

  load(): LoadResult {
    const current = this.storage.getItem(this.key);
    let warning: string | null = null;
    if (current !== null) {
      try {
        return {
          project: deserializeProject(current, this.migrations),
          recovered: false,
          warning: null,
        };
      } catch (error) {
        if (error instanceof FutureSchemaError) throw error;
        warning = error instanceof Error ? error.message : String(error);
      }
    }
    const backup = this.storage.getItem(`${this.key}:backup`);
    if (backup !== null)
      return {
        project: deserializeProject(backup, this.migrations),
        recovered: true,
        warning: warning ?? 'Primary save missing; recovered backup.',
      };
    if (warning) throw new Error(`Cannot recover project: ${warning}`);
    return { project: null, recovered: false, warning: null };
  }
}

export interface AutosaveOptions {
  delayMs?: number;
  onDirty?: () => void;
  onSaved?: () => void;
  onError?: (error: unknown) => void;
}
export class Autosave {
  #timer: ReturnType<typeof setTimeout> | undefined;
  #dirty = false;
  #disposed = false;
  #unsubscribe: () => void;
  #delay: number;

  constructor(
    private readonly engine: EditorEngine,
    private readonly store: LocalProjectStore,
    private readonly options: AutosaveOptions = {},
  ) {
    this.#delay = options.delayMs ?? 500;
    if (!Number.isFinite(this.#delay) || this.#delay < 0)
      throw new Error('Invalid autosave delay');
    this.#unsubscribe = engine.on('state:changed', () => {
      this.#dirty = true;
      this.options.onDirty?.();
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => {
        this.flush();
      }, this.#delay);
    });
  }

  flush(): boolean {
    if (this.#disposed) return false;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!this.#dirty) return true;
    try {
      this.store.save(this.engine.state);
    } catch (error) {
      try {
        this.options.onError?.(error);
      } catch {
        /* Notification must not escape timer. */
      }
      return false;
    }
    this.#dirty = false;
    try {
      this.options.onSaved?.();
    } catch {
      /* Save is already durable. */
    }
    return true;
  }

  dispose(): void {
    this.#unsubscribe();
    clearTimeout(this.#timer);
    this.#disposed = true;
  }
}
