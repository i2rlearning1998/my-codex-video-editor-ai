// B1: My briefs. A saved New AI video form lives in the media store under
// `brief/<id>` (OPFS, IndexedDB fallback), like My themes: never in a project
// and never an undo step. Values are read back defensively.
import type { MediaStore } from '../media/store';
import { normalizeBriefForm, type BriefFormValues } from '../ai-brief/form';

export interface BriefItem {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly values: BriefFormValues;
}
const PREFIX = 'brief/';
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export class BriefLibrary {
  #items: BriefItem[] = [];
  readonly #listeners = new Set<() => void>();
  readonly ready: Promise<void>;

  constructor(private readonly store: Promise<MediaStore | null>) {
    this.ready = this.#load().catch(() => undefined);
  }
  async #load() {
    const store = await this.store;
    if (!store) return;
    const items: BriefItem[] = [];
    for (const key of await store.keys()) {
      if (!key.startsWith(PREFIX)) continue;
      try {
        const raw = JSON.parse(
          await ((await store.read(key))?.text() ?? 'null'),
        ) as Record<string, unknown> | null;
        if (!raw || typeof raw.id !== 'string' || key !== PREFIX + raw.id)
          continue;
        items.push({
          id: raw.id,
          name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : '',
          createdAt:
            typeof raw.createdAt === 'string'
              ? raw.createdAt
              : new Date(0).toISOString(),
          values: normalizeBriefForm(raw.values),
        });
      } catch {
        // A damaged entry is skipped, never shown half-read.
      }
    }
    this.#items = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    this.#emit();
  }
  #emit() {
    for (const listener of [...this.#listeners]) listener();
  }
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  list(): readonly BriefItem[] {
    return this.#items;
  }
  find(id: string): BriefItem | undefined {
    return this.#items.find((item) => item.id === id);
  }
  async #write(item: BriefItem) {
    const store = await this.store;
    await store?.write(
      PREFIX + item.id,
      new Blob([JSON.stringify(item)], { type: 'application/json' }),
    );
  }
  async save(name: string, values: BriefFormValues, id?: string) {
    const item: BriefItem = {
      id: id && ID.test(id) ? id : crypto.randomUUID(),
      name: name.slice(0, 80),
      createdAt: new Date().toISOString(),
      values: normalizeBriefForm(values),
    };
    this.#items = [
      item,
      ...this.#items.filter((other) => other.id !== item.id),
    ];
    this.#emit();
    await this.#write(item);
    return item;
  }
  async rename(id: string, name: string) {
    const item = this.find(id);
    if (!item) return;
    const next = { ...item, name: name.slice(0, 80) };
    this.#items = this.#items.map((other) => (other.id === id ? next : other));
    this.#emit();
    await this.#write(next);
  }
  async remove(id: string) {
    this.#items = this.#items.filter((item) => item.id !== id);
    this.#emit();
    await (await this.store)?.remove(PREFIX + id);
  }
}
