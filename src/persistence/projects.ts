// AUDIT-EDITOR (PRJ-015, PRJ-016, APP-006 to APP-008, PRJ-010, PRJ-017):
// every project lives in its own record of a small key-value store
// (IndexedDB in the browser; a Map in unit tests). A record keeps the project
// JSON (`primary`), the last good copy (`backup`), a damaged primary kept
// once for inspection (`recovery`), a small poster and two times. Media
// bytes are never here (they stay in src/media, D-004); localStorage keeps
// only the id of the open project.
import type { DeepReadonly, Project } from '../core/model';
import {
  deserializeProject,
  FutureSchemaError,
  MigrationRegistry,
  serializeProject,
} from '../core/serialization';

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
  /** ISO time of the last save. */
  readonly updatedAt: string;
  /** ISO time the project was last opened. */
  readonly openedAt: string;
  /** A small JPEG data URL of the first scene (never the media). */
  readonly thumbnail?: string;
  readonly primary: string;
  readonly backup?: string;
  readonly recovery?: string;
}
export type ProjectSummary = Omit<
  ProjectRecord,
  'primary' | 'backup' | 'recovery'
>;
/** The few operations a store needs; IndexedDB and a Map both provide them. */
export interface RecordStore {
  get(id: string): Promise<ProjectRecord | undefined>;
  put(record: ProjectRecord): Promise<void>;
  delete(id: string): Promise<void>;
  all(): Promise<ProjectRecord[]>;
}
export interface OpenedProject {
  readonly project: Project;
  /** The backup was opened because the primary could not be read. */
  readonly recovered: boolean;
  readonly warning: string | null;
  readonly updatedAt: string;
}

const now = () => new Date().toISOString();
const nameOf = (project: DeepReadonly<Project> | Project) =>
  project.metadata.name;

export class ProjectLibrary {
  constructor(
    private readonly store: RecordStore,
    private readonly migrations = new MigrationRegistry(),
    private readonly clock: () => string = now,
  ) {}

  /** Every project, the most recently opened or edited first. */
  async list(): Promise<ProjectSummary[]> {
    const records = await this.store.all();
    return records
      .map(({ primary: _p, backup: _b, recovery: _r, ...summary }) => summary)
      .sort((a, b) =>
        (b.openedAt > b.updatedAt ? b.openedAt : b.updatedAt).localeCompare(
          a.openedAt > a.updatedAt ? a.openedAt : a.updatedAt,
        ),
      );
  }

  /**
   * Records read or written by this page, and whether their primary is a
   * readable document, so a save issues its one write at once (a save from
   * `pagehide` must start before the page goes).
   */
  readonly #known = new Map<
    string,
    { record: ProjectRecord; valid: boolean }
  >();
  /**
   * Saves `project` as record `id`. The previous primary becomes the backup
   * when it is still readable; a damaged one is kept once as `recovery`. A
   * primary written by a newer editor is never overwritten.
   */
  async save(
    id: string,
    project: Project | DeepReadonly<Project>,
    thumbnail?: string,
  ): Promise<void> {
    const serialized = serializeProject(project);
    let known = this.#known.get(id);
    if (!known) {
      const current = await this.store.get(id);
      if (current) {
        let valid = true;
        try {
          deserializeProject(current.primary, this.migrations);
        } catch (error) {
          if (error instanceof FutureSchemaError) throw error;
          valid = false;
        }
        known = { record: current, valid };
      }
    }
    const current = known?.record;
    const backup = known
      ? known.valid
        ? current!.primary
        : current!.backup
      : undefined;
    const recovery =
      known && !known.valid
        ? (current!.recovery ?? current!.primary)
        : current?.recovery;
    const time = this.clock();
    const record: ProjectRecord = {
      id,
      name: nameOf(project),
      updatedAt: time,
      openedAt: current?.openedAt ?? time,
      ...((thumbnail ?? current?.thumbnail)
        ? { thumbnail: thumbnail ?? current!.thumbnail! }
        : {}),
      primary: serialized,
      ...(backup !== undefined ? { backup } : {}),
      ...(recovery !== undefined ? { recovery } : {}),
    };
    this.#known.set(id, { record, valid: true });
    await this.store.put(record);
  }

  /**
   * Opens record `id`: the primary, else the backup (`recovered`). A newer
   * schema throws FutureSchemaError and the record is left as it is.
   */
  async open(id: string): Promise<OpenedProject | null> {
    const record = await this.store.get(id);
    if (!record) return null;
    let warning: string | null = null;
    let project: Project | null = null;
    let recovered = false;
    try {
      project = deserializeProject(record.primary, this.migrations);
    } catch (error) {
      if (error instanceof FutureSchemaError) throw error;
      warning = error instanceof Error ? error.message : String(error);
      if (record.backup === undefined)
        throw new Error(`Cannot recover project: ${warning}`);
      project = deserializeProject(record.backup, this.migrations);
      recovered = true;
    }
    const touched = { ...record, openedAt: this.clock() };
    this.#known.set(id, { record: touched, valid: !recovered });
    await this.store.put(touched);
    return { project, recovered, warning, updatedAt: record.updatedAt };
  }

  /** Renames a stored project (its JSON and its summary). */
  async rename(id: string, name: string): Promise<void> {
    const record = await this.store.get(id);
    const next = name.trim();
    if (!record || !next) return;
    const project = deserializeProject(record.primary, this.migrations);
    project.metadata.name = next;
    const renamed = {
      ...record,
      name: next,
      primary: serializeProject(project),
    };
    this.#known.set(id, { record: renamed, valid: true });
    await this.store.put(renamed);
  }

  /** A copy with a new record id and a new project id; returns the id. */
  async duplicate(id: string, copyName: (name: string) => string) {
    const record = await this.store.get(id);
    if (!record) throw new Error('Unknown project');
    const project = deserializeProject(record.primary, this.migrations);
    const copyId = crypto.randomUUID();
    (project as { id: string }).id = crypto.randomUUID();
    project.metadata.name = copyName(project.metadata.name);
    const time = this.clock();
    await this.store.put({
      id: copyId,
      name: project.metadata.name,
      updatedAt: time,
      openedAt: time,
      ...(record.thumbnail ? { thumbnail: record.thumbnail } : {}),
      primary: serializeProject(project),
    });
    return copyId;
  }

  async remove(id: string): Promise<void> {
    this.#known.delete(id);
    await this.store.delete(id);
  }
}

/** A Map-backed store (unit tests, and when IndexedDB is unavailable). */
export class MemoryRecordStore implements RecordStore {
  readonly #records = new Map<string, ProjectRecord>();
  async get(id: string) {
    return this.#records.get(id);
  }
  async put(record: ProjectRecord) {
    this.#records.set(record.id, record);
  }
  async delete(id: string) {
    this.#records.delete(id);
  }
  async all() {
    return [...this.#records.values()];
  }
}

const DB_NAME = 'aive-projects';
const STORE = 'projects';
/** The IndexedDB store; rejects when IndexedDB cannot be opened. */
export async function openIndexedDbStore(
  factory: IDBFactory = indexedDB,
): Promise<RecordStore> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Project storage is blocked'));
  });
  const run = <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ) =>
    new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Project save was aborted'));
    });
  return {
    get: (id) =>
      run<ProjectRecord | undefined>('readonly', (store) => store.get(id)),
    put: async (record) => {
      await run('readwrite', (store) => store.put(record));
    },
    delete: async (id) => {
      await run('readwrite', (store) => store.delete(id));
    },
    all: () => run<ProjectRecord[]>('readonly', (store) => store.getAll()),
  };
}

/** localStorage keys of the single-slot store used before AUDIT-EDITOR. */
export const LEGACY_KEY = 'ai-native-editor:project';
/** The open project's record id (a small setting, not the project). */
export const CURRENT_KEY = 'aive.currentProject';
/** Set while a page has the editor open; still set at start = it crashed. */
export const SESSION_KEY = 'aive.sessionOpen';
