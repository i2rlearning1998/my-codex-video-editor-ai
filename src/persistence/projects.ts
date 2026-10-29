// PRJ-015/016: the Projects library. Every project the editor saves is also
// kept here (IndexedDB), so the user can come back to any of them: name, last
// edited time, a small picture. The editor's own "current project" slot in
// localStorage stays, because it is written synchronously when the tab closes.
import {
  deserializeProject,
  nameSchema,
  serializeProject,
  type Project,
} from '../core';

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
  /** ISO time of the last save. */
  readonly updated: string;
  readonly json: string;
  /** A small JPEG data URL, or empty. */
  readonly thumb: string;
}
export type ProjectSummary = Omit<ProjectRecord, 'json'>;

export interface ProjectBackend {
  all(): Promise<ProjectRecord[]>;
  get(id: string): Promise<ProjectRecord | undefined>;
  put(record: ProjectRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export class MemoryBackend implements ProjectBackend {
  readonly #map = new Map<string, ProjectRecord>();
  async all() {
    return [...this.#map.values()];
  }
  async get(id: string) {
    return this.#map.get(id);
  }
  async put(record: ProjectRecord) {
    this.#map.set(record.id, record);
  }
  async delete(id: string) {
    this.#map.delete(id);
  }
}

const STORE = 'projects';
export class IdbBackend implements ProjectBackend {
  #db: Promise<IDBDatabase> | undefined;
  constructor(private readonly name = 'aive-projects') {}
  #open() {
    this.#db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.#db;
  }
  async #run<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.#open();
    return new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  all() {
    return this.#run('readonly', (store) => store.getAll());
  }
  get(id: string) {
    return this.#run('readonly', (store) => store.get(id)) as Promise<
      ProjectRecord | undefined
    >;
  }
  async put(record: ProjectRecord) {
    await this.#run('readwrite', (store) => store.put(record));
  }
  async delete(id: string) {
    await this.#run('readwrite', (store) => store.delete(id));
  }
}

type Readonlyish = Project | Parameters<typeof serializeProject>[0];
const withIdentity = (
  project: Readonlyish,
  id: string,
  name: string,
): Project => {
  const copy = JSON.parse(JSON.stringify(project)) as Project;
  copy.id = id;
  copy.metadata = { ...copy.metadata, name };
  return copy;
};

export class ProjectLibrary {
  constructor(
    private readonly backend: ProjectBackend,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () =>
      `p-${crypto.randomUUID().slice(0, 12)}`,
  ) {}

  /** Newest first, without the project text. */
  async list(): Promise<ProjectSummary[]> {
    const records = await this.backend.all();
    return records
      .map(({ json: _json, ...summary }) => summary)
      .sort((a, b) => b.updated.localeCompare(a.updated));
  }

  async save(project: Readonlyish, thumb = ''): Promise<void> {
    const json = serializeProject(project);
    const previous = await this.backend.get(project.id);
    await this.backend.put({
      id: project.id,
      name: project.metadata.name,
      updated: this.now().toISOString(),
      json,
      thumb: thumb || previous?.thumb || '',
    });
  }

  async open(id: string): Promise<Project | null> {
    const record = await this.backend.get(id);
    return record ? deserializeProject(record.json) : null;
  }

  async rename(id: string, name: string): Promise<boolean> {
    const record = await this.backend.get(id);
    const parsed = nameSchema.safeParse(name);
    if (!record || !parsed.success) return false;
    const project = withIdentity(
      deserializeProject(record.json),
      id,
      parsed.data,
    );
    await this.backend.put({
      ...record,
      name: parsed.data,
      json: serializeProject(project),
    });
    return true;
  }

  async duplicate(id: string, copyWord: string): Promise<string | null> {
    const record = await this.backend.get(id);
    if (!record) return null;
    const copyId = this.newId();
    const name = `${record.name} ${copyWord}`.slice(0, 256);
    const project = withIdentity(deserializeProject(record.json), copyId, name);
    await this.backend.put({
      id: copyId,
      name,
      updated: this.now().toISOString(),
      json: serializeProject(project),
      thumb: record.thumb,
    });
    return copyId;
  }

  async remove(id: string): Promise<void> {
    await this.backend.delete(id);
  }
}

/** A small picture of the canvas for the Projects list; '' when it cannot be read. */
export function canvasThumb(source: HTMLCanvasElement, width = 192): string {
  try {
    if (!source.width || !source.height) return '';
    const out = document.createElement('canvas');
    out.width = width;
    out.height = Math.max(
      1,
      Math.round((width * source.height) / source.width),
    );
    const context = out.getContext('2d');
    if (!context) return '';
    context.fillStyle = '#000';
    context.fillRect(0, 0, out.width, out.height);
    context.drawImage(source, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.6);
  } catch {
    return '';
  }
}
