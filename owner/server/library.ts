// Phase 1 library manager: the library operations behind the owner app's
// screens. Every change rebuilds the signed catalog in the output folder.
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  buildCatalog,
  listVersions,
  readManifest,
  rollbackCatalog,
  type BuildResult,
} from '../catalog/build';
import { generateKeys, loadKeys, type CatalogKeys } from '../catalog/keys';
import { publish, summary, type PublishResult } from '../catalog/publish';
import type { GateBrowser, GateFile } from '../catalog/gate';
import { fxCatalog } from '../catalog/sources';
import { ItemStore, type StoredItem } from '../catalog/store';
import { CATALOG_CATEGORIES } from '../../src/library-client/format';

export interface LibraryConfig {
  readonly dataDir: string;
  readonly outDir: string;
  readonly keysDir: string;
  readonly openBrowser: () => Promise<GateBrowser>;
}

export interface ItemView {
  readonly id: string;
  readonly category: string;
  readonly kind: string;
  readonly name: { en: string; hi: string };
  readonly tags: string[];
  readonly license: StoredItem['license'];
  readonly current: number;
  readonly versions: {
    itemVersion: number;
    createdAt: string;
    source: string;
  }[];
  readonly published: boolean;
  readonly hidden: boolean;
  readonly featured: boolean;
  readonly order: number;
  readonly planKey: string | null;
  readonly publishAt: string | null;
  readonly unpublishAt: string | null;
  /** The owner app's own URL of the thumbnail (owner data, not the CDN). */
  readonly thumb: string | null;
}

const view = (item: StoredItem): ItemView => {
  const version = item.versions.find((v) => v.itemVersion === item.current);
  return {
    id: item.id,
    category: item.category,
    kind: item.kind,
    name: item.name,
    tags: item.tags,
    license: item.license,
    current: item.current,
    versions: item.versions.map((v) => ({
      itemVersion: v.itemVersion,
      createdAt: v.createdAt,
      source: v.source,
    })),
    published: item.published,
    hidden: item.hidden,
    featured: item.featured,
    order: item.order,
    planKey: item.planKey,
    publishAt: item.publishAt,
    unpublishAt: item.unpublishAt,
    thumb: version?.thumb
      ? `/api/file/${version.thumb.sha256}.${version.thumb.ext}`
      : null,
  };
};

export class OwnerLibrary {
  constructor(private readonly config: LibraryConfig) {}
  private store() {
    return new ItemStore(this.config.dataDir);
  }
  private keys(): CatalogKeys {
    return loadKeys(this.config.keysDir);
  }
  private rebuild(store: ItemStore, force = false): BuildResult {
    store.save();
    return buildCatalog(store, this.config.outDir, this.keys(), {
      now: new Date().toISOString(),
      force,
    });
  }
  list(filter: { category?: string; q?: string } = {}): ItemView[] {
    const q = filter.q?.trim().toLowerCase();
    return this.store()
      .data.items.filter(
        (item) =>
          (!filter.category || item.category === filter.category) &&
          (!q ||
            item.id.includes(q) ||
            item.name.en.toLowerCase().includes(q) ||
            item.name.hi.includes(q) ||
            item.tags.some((tag) => tag.toLowerCase().includes(q))),
      )
      .map(view);
  }
  categories() {
    return CATALOG_CATEGORIES;
  }
  /** A stored file (thumbnails, posters) by its hash and extension. */
  filePath(name: string): string | null {
    const match = /^([0-9a-f]{64})\.([a-z0-9]{1,5})$/.exec(name);
    if (!match) return null;
    const file = path.join(this.config.dataDir, 'files', name);
    return existsSync(file) ? file : null;
  }
  update(
    id: string,
    change: Partial<{
      name: { en: string; hi: string };
      tags: string[];
      license: StoredItem['license'];
      hidden: boolean;
      featured: boolean;
      order: number;
      publishAt: string | null;
      unpublishAt: string | null;
      published: boolean;
      current: number;
    }>,
  ): { item: ItemView; build: BuildResult } {
    const store = this.store();
    const item = store.find(id);
    if (!item) throw new Error(`There is no item ${id}.`);
    if (change.name) {
      if (!change.name.en.trim() || !change.name.hi.trim())
        throw new Error('The item needs a name in English and Hindi.');
      item.name = {
        en: change.name.en.trim().slice(0, 80),
        hi: change.name.hi.trim().slice(0, 80),
      };
    }
    if (change.tags)
      item.tags = change.tags
        .map((tag) => tag.trim().slice(0, 30))
        .filter(Boolean)
        .slice(0, 12);
    if (change.license) {
      if (!change.license.name?.trim())
        throw new Error('The licence needs a name.');
      item.license = {
        name: change.license.name.trim().slice(0, 60),
        ...(change.license.credit?.trim()
          ? { credit: change.license.credit.trim().slice(0, 200) }
          : {}),
        ...(change.license.url?.trim()
          ? { url: change.license.url.trim().slice(0, 300) }
          : {}),
      };
    }
    for (const key of ['hidden', 'featured', 'published'] as const)
      if (typeof change[key] === 'boolean') item[key] = change[key];
    if (typeof change.order === 'number' && Number.isInteger(change.order))
      item.order = change.order;
    for (const key of ['publishAt', 'unpublishAt'] as const)
      if (change[key] !== undefined) {
        const value = change[key];
        if (value !== null && Number.isNaN(Date.parse(value)))
          throw new Error('The schedule time is not a date.');
        item[key] = value === null ? null : new Date(value).toISOString();
      }
    if (change.current !== undefined) {
      if (!item.versions.some((v) => v.itemVersion === change.current))
        throw new Error(`${id} has no version ${change.current}.`);
      item.current = change.current;
    }
    return { item: view(item), build: this.rebuild(store) };
  }
  remove(id: string): BuildResult {
    const store = this.store();
    const before = store.data.items.length;
    store.data.items = store.data.items.filter((item) => item.id !== id);
    if (store.data.items.length === before)
      throw new Error(`There is no item ${id}.`);
    return this.rebuild(store);
  }
  async upload(
    files: GateFile[],
    license?: { name: string; credit?: string },
  ): Promise<{ result: PublishResult; lines: string[] }> {
    const store = this.store();
    const result = await publish(files, {
      dataDir: this.config.dataDir,
      outDir: this.config.outDir,
      keys: this.keys(),
      openBrowser: this.config.openBrowser,
      fxCatalog: fxCatalog(),
      knownLibraryIds: store.data.items.map((item) => item.id),
      ...(license?.name ? { license } : {}),
    });
    return { result, lines: summary(result) };
  }
  versions() {
    const out = this.config.outDir;
    const live = existsSync(path.join(out, 'manifest.json'))
      ? readManifest(out).manifest.catalogVersion
      : null;
    return listVersions(out).map((version) => {
      const { manifest } = readManifest(out, `versions/${version}.json`);
      return {
        version,
        live: version === live,
        generatedAt: manifest.generatedAt,
        rolledBackTo: manifest.rolledBackTo ?? null,
        counts: Object.fromEntries(
          Object.entries(manifest.categories).map(([key, ref]) => [
            key,
            ref.count,
          ]),
        ),
      };
    });
  }
  rollback(to: number): BuildResult {
    return rollbackCatalog(this.store(), this.config.outDir, this.keys(), to);
  }
  /** A new signing key; the catalog is signed again at once. */
  rotateKey(): { keyId: string; publicKey: string; build: BuildResult } {
    const keys = generateKeys(this.config.keysDir, true);
    const build = this.rebuild(this.store(), true);
    return { keyId: keys.keyId, publicKey: keys.publicKey, build };
  }
}
