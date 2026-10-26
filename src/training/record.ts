// Phase 1 library brief, P1-31: one training-data record per AI-built
// video, kept now for later use: the brief that was copied for the AI, the
// final plan JSON it built from, and the user's later edits as command names
// with their times. Local in this browser (IndexedDB `aive-training`, next
// to the projects); uploaded to the owner's own cloud table on Save to cloud
// when signed in. There is no UI.
export interface TrainingEdit {
  /** ISO time of the edit. */
  readonly at: string;
  /** The step's name ('Move', 'Undo', …). */
  readonly label: string;
  /** The command types it ran (SET_PROPERTY, …). */
  readonly commands: readonly string[];
}
export interface TrainingRecord {
  readonly version: 1;
  /** The editor's local project id. */
  readonly projectId: string;
  readonly createdAt: string;
  readonly brief: string | null;
  readonly plan: unknown;
  readonly edits: readonly TrainingEdit[];
}
/** Older edits are dropped beyond this many (the newest are kept). */
export const MAX_EDITS = 5000;

export interface TrainingStore {
  get(projectId: string): Promise<TrainingRecord | undefined>;
  put(record: TrainingRecord): Promise<void>;
}
export class MemoryTrainingStore implements TrainingStore {
  readonly #records = new Map<string, TrainingRecord>();
  get(projectId: string) {
    return Promise.resolve(this.#records.get(projectId));
  }
  put(record: TrainingRecord) {
    this.#records.set(record.projectId, structuredClone(record));
    return Promise.resolve();
  }
}
export function openTrainingStore(): Promise<TrainingStore> {
  if (typeof indexedDB === 'undefined')
    return Promise.resolve(new MemoryTrainingStore());
  return new Promise((resolve) => {
    const request = indexedDB.open('aive-training', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('records', { keyPath: 'projectId' });
    request.onerror = request.onblocked = () =>
      resolve(new MemoryTrainingStore());
    request.onsuccess = () => {
      const db = request.result;
      const run = <T>(
        mode: IDBTransactionMode,
        work: (store: IDBObjectStore) => IDBRequest<T>,
      ) =>
        new Promise<T>((done, fail) => {
          const call = work(
            db.transaction('records', mode).objectStore('records'),
          );
          call.onsuccess = () => done(call.result);
          call.onerror = () => fail(call.error);
        });
      resolve({
        get: (projectId) =>
          run('readonly', (store) => store.get(projectId)) as Promise<
            TrainingRecord | undefined
          >,
        put: (record) =>
          run('readwrite', (store) => store.put(record)).then(() => undefined),
      });
    };
  });
}

/**
 * Collects the records. `start` is called when an AI-built video is added
 * to a project; `edit` for every later step of that project (other projects
 * are not recorded). Writes are queued, so they never block an edit.
 */
export class TrainingLog {
  #lastBrief: string | null = null;
  #write: Promise<void> = Promise.resolve();
  readonly #recorded = new Set<string>();
  constructor(
    private readonly store: Promise<TrainingStore>,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly limit = MAX_EDITS,
  ) {}
  /** The brief text last copied for an AI (kept for the next build). */
  noteBrief(text: string) {
    this.#lastBrief = text;
  }
  start(projectId: string, plan: unknown): Promise<void> {
    this.#recorded.add(projectId);
    const brief = this.#lastBrief;
    return this.#queue(async (store) => {
      const old = await store.get(projectId);
      // A second build in the same project keeps the earlier edits.
      await store.put({
        version: 1,
        projectId,
        createdAt: old?.createdAt ?? this.clock(),
        brief: brief ?? old?.brief ?? null,
        plan: structuredClone(plan),
        edits: old?.edits ?? [],
      });
    });
  }
  /** Whether a project has a record (loaded lazily after a reload). */
  async has(projectId: string): Promise<boolean> {
    if (this.#recorded.has(projectId)) return true;
    const found = !!(await (await this.store).get(projectId));
    if (found) this.#recorded.add(projectId);
    return found;
  }
  edit(
    projectId: string,
    label: string,
    commands: readonly string[],
  ): Promise<void> {
    if (!this.#recorded.has(projectId)) return Promise.resolve();
    const edit: TrainingEdit = {
      at: this.clock(),
      label,
      commands: [...commands],
    };
    return this.#queue(async (store) => {
      const record = await store.get(projectId);
      if (!record) return;
      await store.put({
        ...record,
        edits: [...record.edits, edit].slice(-this.limit),
      });
    });
  }
  get(projectId: string): Promise<TrainingRecord | undefined> {
    return this.#write.then(async () => (await this.store).get(projectId));
  }
  #queue(work: (store: TrainingStore) => Promise<void>): Promise<void> {
    this.#write = this.#write
      .then(async () => work(await this.store))
      .catch(() => undefined);
    return this.#write;
  }
}
