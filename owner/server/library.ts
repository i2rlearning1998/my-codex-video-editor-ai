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
import {
  ASSET_LABELS,
  ASSET_TYPES,
  CONTROL_REGISTRY,
  SURFACE_LABELS,
  controlKey,
  offKeys,
} from '../../src/library-client/controls';
import { generateKeys, loadKeys, type CatalogKeys } from '../catalog/keys';
import { publish, summary, type PublishResult } from '../catalog/publish';
import type { GateBrowser, GateFile } from '../catalog/gate';
import { fxCatalog } from '../catalog/sources';
import { ItemStore, type StoredItem } from '../catalog/store';
import {
  catalogConfigSchema,
  defaultPlace,
  addCategory,
  addSection,
  addSub,
  emptyConfig,
  isBuiltinCategory,
  isBuiltinNode,
  mergeTaxonomy,
  moveNode,
  patchNode,
  removeNode,
  type NodePatch,
  type NodePath,
  type CatalogConfig,
  type Place,
  type TaxCategory,
} from '../../src/library-client/taxonomy';

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
  /** FIX7: where the editor lists it (the owner's choice or its kind's). */
  readonly place: Place;
  readonly placed: boolean;
  /** The owner app's own URL of the thumbnail (owner data, not the CDN). */
  readonly thumb: string | null;
}

const placeOf = (item: StoredItem): Place => {
  if (item.place) return item.place;
  const version = item.versions.find((v) => v.itemVersion === item.current);
  const record = version?.inline as { section?: unknown } | undefined;
  return defaultPlace(
    item.kind,
    typeof record?.section === 'string' ? record.section : undefined,
  );
};

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
    place: placeOf(item),
    placed: !!item.place,
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
  list(
    filter: {
      category?: string;
      sub?: string;
      section?: string;
      q?: string;
    } = {},
  ): ItemView[] {
    const q = filter.q?.trim().toLowerCase();
    return this.store()
      .data.items.filter(
        (item) =>
          (!filter.category || placeOf(item).category === filter.category) &&
          (!filter.sub || placeOf(item).sub === filter.sub) &&
          (!filter.section || placeOf(item).section === filter.section) &&
          (!q ||
            item.id.includes(q) ||
            item.name.en.toLowerCase().includes(q) ||
            item.name.hi.includes(q) ||
            item.tags.some((tag) => tag.toLowerCase().includes(q))),
      )
      .map(view);
  }
  /** FIX7: the tree the editor shows, with how many items sit in each node. */
  taxonomy(): {
    tree: (TaxCategory & {
      count: number;
      builtin: boolean;
      subs: (TaxCategory['subs'][number] & {
        count: number;
        builtin: boolean;
        sections: (TaxCategory['subs'][number]['sections'][number] & {
          count: number;
          builtin: boolean;
        })[];
      })[];
    })[];
    config: CatalogConfig;
  } {
    const store = this.store();
    const config = store.data.config ?? emptyConfig();
    const places = store.data.items.map(placeOf);
    const count = (test: (place: Place) => boolean) =>
      places.filter(test).length;
    const tree = mergeTaxonomy(config).map((cat) => ({
      ...cat,
      count: count((p) => p.category === cat.id),
      builtin: isBuiltinCategory(cat.id),
      subs: cat.subs.map((sub) => ({
        ...sub,
        count: count((p) => p.category === cat.id && p.sub === sub.id),
        builtin: isBuiltinNode(cat.id, sub.id),
        sections: sub.sections.map((section) => ({
          ...section,
          builtin: isBuiltinNode(cat.id, sub.id, section.id),
          count: count(
            (p) =>
              p.category === cat.id &&
              p.sub === sub.id &&
              p.section === section.id,
          ),
        })),
      })),
    }));
    return { tree, config };
  }
  /** Saves the owner's taxonomy (what they added or changed). */
  saveConfig(next: unknown): BuildResult {
    const parsed = catalogConfigSchema.safeParse(next);
    if (!parsed.success)
      throw new Error(
        `The categories are not valid: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
      );
    const store = this.store();
    // An added category, sub-category or section that still holds items
    // cannot be removed: move the items first.
    const tree = mergeTaxonomy(parsed.data);
    const has = (place: Place) => {
      const cat = tree.find((c) => c.id === place.category);
      if (!cat) return false;
      if (!place.sub) return true;
      const sub = cat.subs.find((s) => s.id === place.sub);
      if (!sub) return false;
      return !place.section || sub.sections.some((x) => x.id === place.section);
    };
    for (const item of store.data.items) {
      const place = placeOf(item);
      if (!has(place))
        throw new Error(
          `"${item.name.en}" is still listed in something you removed. Move it first.`,
        );
    }
    store.data.config = {
      ...(store.data.config ?? emptyConfig()),
      ...parsed.data,
    };
    return this.rebuild(store);
  }
  /** The controls the owner can switch, and which are off now. */
  controls() {
    return {
      surfaces: SURFACE_LABELS,
      types: ASSET_TYPES.map((id) => ({ id, name: ASSET_LABELS[id] })),
      registry: CONTROL_REGISTRY,
      off: [...offKeys(this.store().data.config?.controls)],
    };
  }
  /** Saves the switched-off list (only keys the editor really has). */
  saveControls(off: unknown): BuildResult {
    if (!Array.isArray(off))
      throw new Error('Send the list of switched-off controls.');
    const known = new Set(
      CONTROL_REGISTRY.flatMap((def) =>
        def.types.map((type) => controlKey(def.surface, type, def.id)),
      ),
    );
    const clean = [...new Set(off.map(String))].filter((key) => known.has(key));
    const store = this.store();
    const config = store.data.config ?? emptyConfig();
    store.data.config = {
      ...config,
      controls: { ...config.controls, off: clean },
    };
    return this.rebuild(store);
  }
  /** One edit of the taxonomy (the owner app sends these). */
  taxonomyOp(op: {
    op: 'addCategory' | 'addSub' | 'addSection' | 'patch' | 'remove' | 'move';
    category?: string;
    sub?: string;
    section?: string;
    name?: { en: string; hi: string };
    patch?: NodePatch;
    direction?: -1 | 1;
  }): { build: BuildResult; id?: string } {
    const store = this.store();
    const config = store.data.config ?? emptyConfig();
    const tree = mergeTaxonomy(config);
    const name = op.name
      ? {
          en: op.name.en.trim().slice(0, 40),
          hi: op.name.hi.trim().slice(0, 40),
        }
      : undefined;
    if (
      (op.op === 'addCategory' ||
        op.op === 'addSub' ||
        op.op === 'addSection') &&
      (!name?.en || !name.hi)
    )
      throw new Error('Give the name in English and in Hindi.');
    const path: NodePath = {
      category: op.category ?? '',
      ...(op.sub ? { sub: op.sub } : {}),
      ...(op.section ? { section: op.section } : {}),
    };
    let next: CatalogConfig;
    let id: string | undefined;
    if (op.op === 'addCategory') {
      const made = addCategory(config, tree, name!);
      next = made.config;
      id = made.id;
    } else if (op.op === 'addSub') {
      const made = addSub(config, tree, path.category, name!);
      next = made.config;
      id = made.id;
    } else if (op.op === 'addSection') {
      if (!path.sub) throw new Error('Choose the sub-category first.');
      const made = addSection(config, tree, path.category, path.sub, name!);
      next = made.config;
      id = made.id;
    } else if (op.op === 'patch') {
      const patch = { ...(op.patch ?? {}) };
      if (patch.name) {
        patch.name = {
          en: patch.name.en.trim().slice(0, 40),
          hi: patch.name.hi.trim().slice(0, 40),
        };
        if (!patch.name.en || !patch.name.hi)
          throw new Error('Give the name in English and in Hindi.');
      }
      next = patchNode(config, tree, path, patch);
    } else if (op.op === 'remove') next = removeNode(config, path);
    else next = moveNode(config, tree, path, op.direction === -1 ? -1 : 1);
    return { build: this.saveConfig(next), ...(id ? { id } : {}) };
  }
  categories() {
    return mergeTaxonomy(this.store().data.config ?? null).map((c) => c.id);
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
      place: Place | null;
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
    if (change.place !== undefined) {
      if (change.place === null) delete item.place;
      else {
        const tree = mergeTaxonomy(store.data.config ?? null);
        const cat = tree.find((c) => c.id === change.place!.category);
        const sub = change.place.sub
          ? cat?.subs.find((x) => x.id === change.place!.sub)
          : undefined;
        if (!cat) throw new Error('That category does not exist.');
        if (change.place.sub && !sub)
          throw new Error('That sub-category does not exist.');
        if (
          change.place.section &&
          !sub?.sections.some((x) => x.id === change.place!.section)
        )
          throw new Error('That section does not exist.');
        item.place = {
          category: change.place.category,
          sub: change.place.sub ?? null,
          section: change.place.section ?? null,
        };
      }
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
    place?: Place,
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
    if (place && (result.added.length || result.updated.length)) {
      for (const id of [...result.added, ...result.updated])
        this.update(id, { place });
    }
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
