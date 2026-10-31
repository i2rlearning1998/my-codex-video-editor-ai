// P2 (CREATOR-PACK-SPEC 4): My library, the user's store of accepted Creator
// Pack items, beside My Templates and outside the project (never an undo
// step, docs/UNDO-RULES.md). It lives in the media store (OPFS, IndexedDB
// fallback) as one index file; each item is keyed `<packId>/<itemId>`. A
// project that uses an item keeps its own copy (ordinary layers, or a code
// layer with its own source), so the library is a convenience, never a
// dependency.
import type { MediaStore } from '../media/store';
import type { CreatorItem } from '../creator-pack';
import type { LibraryItem } from '../library/schema';
import type { FreeCodeMeta } from '../code-layer/runtime-types';
import type { CodeTemplate } from './code-templates';

const INDEX_KEY = 'creator/index.json';

export interface CreatorEntry {
  /** `<packId>/<itemId>`. */
  readonly key: string;
  readonly packId: string;
  readonly packName: { en: string; hi?: string };
  readonly packVersion: number;
  readonly item: CreatorItem;
  /** The name shown (a rename changes only this). */
  readonly name: string;
  /** A small PNG data URL from the import's render check. */
  readonly thumbnail?: string;
  /** Motion: the meta the runtime validated (its params are the controls). */
  readonly motionMeta?: FreeCodeMeta;
  /** R2: the controller values chosen when it was imported or saved. */
  readonly params?: Readonly<Record<string, unknown>>;
  /** Soft-deleted (Restore brings it back). */
  readonly removed?: boolean;
  readonly addedAt: string;
  /** FX10: the project this item belongs to (none: saved before projects). */
  readonly projectId?: string;
}

/** The library id of a creator item (library ids allow no slash). */
export const creatorLibraryId = (key: string) => key.replace('/', '--');
export const isCreatorLibraryId = (id: string) => id.includes('--');

export class CreatorLibrary {
  #entries: CreatorEntry[] = [];
  /**
   * Phase 1 library (P1-22): the catalog's styles, motion and presets,
   * listed with the user's own items (keys `catalog/<id>`). They are read
   * from the catalog, never saved here, so rename and delete leave them.
   */
  #builtIn: CreatorEntry[] = [];
  readonly #listeners = new Set<() => void>();
  readonly ready: Promise<void>;
  #write: Promise<void> = Promise.resolve();

  /**
   * FX10: an item belongs to one project; a panel lists only the open
   * project's (a new project starts empty). `scope` names the open project.
   */
  constructor(
    private readonly store: Promise<MediaStore | null>,
    private readonly scope: () => string = () => '',
  ) {
    this.ready = this.#load();
  }
  #mine = (entry: CreatorEntry) => entry.projectId === this.scope();
  /** The open project changed: panels read the list again. */
  rescope() {
    this.#emit();
  }
  /** FX10: every project's own items (for Import AI templates), newest first. */
  listAll(): readonly CreatorEntry[] {
    return this.#entries
      .filter((entry) => !entry.removed)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }
  /** FX10: a copy of another project's item, owned by the open project. */
  async importCopy(entry: CreatorEntry) {
    const { projectId: _from, removed: _removed, ...rest } = entry;
    await this.add([{ ...rest, addedAt: new Date().toISOString() }]);
  }
  async #load() {
    try {
      const blob = await (await this.store)?.read(INDEX_KEY);
      const parsed = blob ? (JSON.parse(await blob.text()) as unknown) : null;
      if (Array.isArray(parsed)) this.#entries = parsed as CreatorEntry[];
    } catch {
      this.#entries = [];
    }
    // FX10: an item saved before projects existed joins the open project.
    const project = this.scope();
    if (project && this.#entries.some((entry) => !entry.projectId)) {
      this.#entries = this.#entries.map((entry) =>
        entry.projectId ? entry : { ...entry, projectId: project },
      );
      void this.#save().catch(() => undefined);
    }
    this.#emit();
  }
  #save(): Promise<void> {
    const text = JSON.stringify(this.#entries);
    this.#write = this.#write.then(async () => {
      const store = await this.store;
      await store?.write(
        INDEX_KEY,
        new Blob([text], { type: 'application/json' }),
      );
    });
    return this.#write;
  }
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #emit() {
    for (const listener of [...this.#listeners]) listener();
  }

  /** Items shown in the panels (soft-deleted ones are hidden). */
  list(): readonly CreatorEntry[] {
    const own = this.#entries.filter(
      (entry) => !entry.removed && this.#mine(entry),
    );
    const keys = new Set(own.map((entry) => entry.key));
    return [...this.#builtIn.filter((entry) => !keys.has(entry.key)), ...own];
  }
  find(key: string): CreatorEntry | undefined {
    return (
      this.#entries.find((entry) => entry.key === key && this.#mine(entry)) ??
      this.#builtIn.find((entry) => entry.key === key)
    );
  }
  /** Phase 1 library: replaces the catalog's items (after a refresh). */
  setBuiltIn(entries: readonly CreatorEntry[]) {
    this.#builtIn = [...entries];
    this.#emit();
  }
  /** Whether the entry comes from the catalog (not the user's own). */
  isBuiltIn(key: string): boolean {
    return key.startsWith('catalog/');
  }
  /** The version of a pack already in the library, or null. */
  packVersion(packId: string): number | null {
    const entry = this.#entries.find(
      (item) => item.packId === packId && !item.removed && this.#mine(item),
    );
    return entry ? entry.packVersion : null;
  }
  /**
   * Adds accepted items. `replacePack` first drops every item of that pack
   * (a new version of the pack replaces the old one).
   */
  async add(entries: readonly CreatorEntry[], replacePack?: string) {
    const keys = new Set(entries.map((entry) => entry.key));
    const project = this.scope();
    this.#entries = [
      ...this.#entries.filter(
        (entry) =>
          !(
            this.#mine(entry) &&
            (keys.has(entry.key) ||
              (replacePack !== undefined && entry.packId === replacePack))
          ),
      ),
      ...entries.map((entry) => ({ ...entry, projectId: project })),
    ];
    this.#emit();
    await this.#save();
  }
  async #update(key: string, change: Partial<CreatorEntry>) {
    this.#entries = this.#entries.map((entry) =>
      entry.key === key && this.#mine(entry) ? { ...entry, ...change } : entry,
    );
    this.#emit();
    await this.#save();
  }
  remove(key: string) {
    return this.#update(key, { removed: true });
  }
  restore(key: string) {
    return this.#update(key, { removed: false });
  }
  rename(key: string, name: string) {
    return this.#update(key, { name });
  }

  /** The native kinds as library items (they insert like built-in ones). */
  libraryItems(): LibraryItem[] {
    return this.list().flatMap((entry): LibraryItem[] => {
      const item = entry.item;
      if (
        item.type !== 'shape' &&
        item.type !== 'text' &&
        item.type !== 'background' &&
        item.type !== 'template'
      )
        return [];
      const section =
        item.type === 'background'
          ? 'backgrounds'
          : item.type === 'shape'
            ? 'creator'
            : item.type === 'text'
              ? 'styles'
              : undefined;
      return [
        {
          id: creatorLibraryId(entry.key),
          name: { en: entry.name, hi: entry.name },
          tags: [...item.tags, 'creator', entry.packId],
          ...(section ? { section } : {}),
          type: item.type,
          data:
            item.type === 'template'
              ? { ...item.data, category: 'creator' }
              : item.data,
        } as LibraryItem,
      ];
    });
  }
  /** Motion items (and R2 code compositions, Tier A) as code templates. */
  motionTemplates(): CodeTemplate[] {
    return this.list().flatMap((entry): CodeTemplate[] => {
      const item = entry.item;
      if (!entry.motionMeta) return [];
      if (item.type !== 'motion' && item.type !== 'composition') return [];
      const tier = item.type === 'motion' ? item.data.tier : 'A';
      return [
        {
          kind: 'code',
          id: creatorLibraryId(entry.key),
          name: entry.name,
          category: entry.motionMeta.category ?? 'code',
          createdAt: entry.addedAt,
          tier,
          source:
            item.type === 'motion'
              ? item.data.source
              : JSON.stringify(item.data.spec),
          meta: entry.motionMeta as unknown as Record<string, unknown>,
          params: entry.params ?? {},
          ...(entry.thumbnail ? { thumbnail: entry.thumbnail } : {}),
        },
      ];
    });
  }
  /** Presets (Animate > Creator). */
  presets(): CreatorEntry[] {
    return this.list().filter((entry) => entry.item.type === 'preset');
  }
}
