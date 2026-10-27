// Phase 1 library (P1-04, P1-05, P1-08): writes the signed catalog from the
// item store into an output folder that stands in for the CDN:
//   manifest.json                the current signed manifest (mutable)
//   versions/<n>.json            every signed manifest ever published
//   versions/<n>.items.json      what that version listed (for rollback)
//   files/<sha256>.<ext>         indexes, payloads, thumbnails, media
// Everything under files/ is content-hashed and never rewritten.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  CATALOG_CATEGORIES,
  categoryIndexSchema,
  catalogManifestSchema,
  formatProblem,
  signedManifestSchema,
  type CatalogCategory,
  type CatalogEntry,
  type CatalogManifest,
  type CategoryIndex,
  type FileRef,
  type SignedManifest,
} from '../../src/library-client/format';
import { signBytes, sha256Hex, type CatalogKeys } from './keys';
import type { ItemStore, StoredFile, StoredItem } from './store';

export interface VersionSnapshot {
  readonly catalogVersion: number;
  readonly items: readonly {
    readonly id: string;
    readonly itemVersion: number;
    readonly published: boolean;
    readonly hidden: boolean;
    readonly featured: boolean;
    readonly order: number;
    readonly planKey: string | null;
    readonly publishAt: string | null;
    readonly unpublishAt: string | null;
  }[];
}

const writeAtomic = (file: string, text: string) => {
  const temp = `${file}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
};

/** The current catalog version in a folder (0 when none). */
export function currentVersion(outDir: string): number {
  const file = path.join(outDir, 'manifest.json');
  if (!existsSync(file)) return 0;
  return readManifest(outDir).manifest.catalogVersion;
}
export function readManifest(
  outDir: string,
  file = 'manifest.json',
): { signed: SignedManifest; manifest: CatalogManifest } {
  const signed = signedManifestSchema.parse(
    JSON.parse(readFileSync(path.join(outDir, file), 'utf8')),
  );
  return {
    signed,
    manifest: catalogManifestSchema.parse(JSON.parse(signed.signed)),
  };
}
export function listVersions(outDir: string): number[] {
  const dir = path.join(outDir, 'versions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => /^(\d+)\.json$/.exec(name)?.[1])
    .filter((value): value is string => !!value)
    .map(Number)
    .sort((a, b) => a - b);
}

function refFor(store: ItemStore, outDir: string, file: StoredFile): FileRef {
  const url = `files/${file.sha256}.${file.ext}`;
  const target = path.join(outDir, url);
  if (!existsSync(target)) copyFileSync(store.filePath(file), target);
  return { url, sha256: file.sha256, size: file.size, mime: file.mime };
}

function entryFor(
  store: ItemStore,
  outDir: string,
  item: StoredItem,
): CatalogEntry {
  const version = item.versions.find((v) => v.itemVersion === item.current)!;
  const payload = version.file
    ? { file: refFor(store, outDir, version.file) }
    : { inline: version.inline };
  const size = version.media
    ? version.media.full.size
    : version.file
      ? version.file.size
      : Buffer.byteLength(JSON.stringify(version.inline ?? null));
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    tags: item.tags,
    license: item.license,
    itemVersion: version.itemVersion,
    thumbUrl: version.thumb ? refFor(store, outDir, version.thumb).url : null,
    blur: version.blur,
    size,
    payload,
    ...(version.media
      ? {
          media: {
            ...(version.media.poster
              ? { poster: refFor(store, outDir, version.media.poster) }
              : {}),
            ...(version.media.proxy
              ? { proxy: refFor(store, outDir, version.media.proxy) }
              : {}),
            full: refFor(store, outDir, version.media.full),
            ...(version.media.width ? { width: version.media.width } : {}),
            ...(version.media.height ? { height: version.media.height } : {}),
            ...(version.media.duration !== undefined
              ? { duration: version.media.duration }
              : {}),
          },
        }
      : {}),
    hidden: item.hidden,
    featured: item.featured,
    order: item.order,
    planKey: item.planKey,
    publishAt: item.publishAt,
    unpublishAt: item.unpublishAt,
  };
}

export interface BuildResult {
  readonly catalogVersion: number;
  /** False when nothing changed (no new version was written). */
  readonly changed: boolean;
}

/**
 * Builds the catalog from the store. A new version is written only when an
 * index differs from the current manifest's (idempotent).
 */
export function buildCatalog(
  store: ItemStore,
  outDir: string,
  keys: CatalogKeys,
  options: { now: string; rolledBackTo?: number; force?: boolean } = {
    now: new Date().toISOString(),
  },
): BuildResult {
  mkdirSync(path.join(outDir, 'files'), { recursive: true });
  mkdirSync(path.join(outDir, 'versions'), { recursive: true });
  const previous = existsSync(path.join(outDir, 'manifest.json'))
    ? readManifest(outDir).manifest
    : null;
  const catalogVersion = (previous?.catalogVersion ?? 0) + 1;
  const indexes = {} as Record<CatalogCategory, CategoryIndex>;
  for (const category of CATALOG_CATEGORIES)
    indexes[category] = {
      format: 'aive-catalog-index',
      category,
      // The version that first carries this exact index text: the index
      // file is reused while its entries stay the same.
      catalogVersion,
      ...(category === 'templates' ? { taxonomy: store.data.taxonomy } : {}),
      entries: [],
    };
  for (const item of store.data.items)
    if (item.published)
      indexes[item.category].entries.push(entryFor(store, outDir, item));
  const categories = {} as CatalogManifest['categories'];
  let changed = !previous || options.force === true;
  // An unchanged index keeps its old file (and its old version number);
  // a rollback re-points to the target version's own files.
  const known: CatalogManifest[] = [];
  if (options.rolledBackTo !== undefined)
    known.push(
      readManifest(outDir, `versions/${options.rolledBackTo}.json`).manifest,
    );
  if (previous) known.push(previous);
  const without = (index: CategoryIndex) =>
    JSON.stringify({ ...index, catalogVersion: 0 });
  for (const category of CATALOG_CATEGORIES) {
    const index = indexes[category];
    const wanted = without(index);
    const reuse = known
      .map((manifest) => manifest.categories[category])
      .find(
        (ref) =>
          without(
            JSON.parse(
              readFileSync(path.join(outDir, ref.url), 'utf8'),
            ) as CategoryIndex,
          ) === wanted,
      );
    if (reuse) {
      categories[category] = reuse;
      if (reuse !== previous?.categories[category]) changed = true;
      continue;
    }
    const problem = formatProblem(categoryIndexSchema, index);
    if (problem)
      throw new Error(`The ${category} index is invalid: ${problem}`);
    const text = JSON.stringify(index);
    const sha256 = sha256Hex(text);
    const url = `files/${sha256}.json`;
    if (!existsSync(path.join(outDir, url)))
      writeFileSync(path.join(outDir, url), text);
    categories[category] = { url, sha256, count: index.entries.length };
    changed = true;
  }
  if (!changed) return { catalogVersion: previous!.catalogVersion, changed };
  const manifest: CatalogManifest = {
    format: 'aive-catalog',
    catalogVersion,
    generatedAt: options.now,
    ...(options.rolledBackTo !== undefined
      ? { rolledBackTo: options.rolledBackTo }
      : {}),
    categories,
  };
  catalogManifestSchema.parse(manifest);
  const signedText = JSON.stringify(manifest);
  const signed: SignedManifest = {
    signed: signedText,
    signature: signBytes(keys, signedText),
    keyId: keys.keyId,
  };
  const snapshot: VersionSnapshot = {
    catalogVersion,
    items: store.data.items.map((item) => ({
      id: item.id,
      itemVersion: item.current,
      published: item.published,
      hidden: item.hidden,
      featured: item.featured,
      order: item.order,
      planKey: item.planKey,
      publishAt: item.publishAt,
      unpublishAt: item.unpublishAt,
    })),
  };
  const versions = path.join(outDir, 'versions');
  writeFileSync(
    path.join(versions, `${catalogVersion}.json`),
    JSON.stringify(signed),
  );
  writeFileSync(
    path.join(versions, `${catalogVersion}.items.json`),
    JSON.stringify(snapshot),
  );
  writeAtomic(path.join(outDir, 'manifest.json'), JSON.stringify(signed));
  return { catalogVersion, changed: true };
}

/**
 * Rollback (P1-08): the store's items go back to what version `to` listed
 * (its item versions and owner fields), and a new catalog version is
 * published that points to the same index files. Old versions stay readable.
 */
export function rollbackCatalog(
  store: ItemStore,
  outDir: string,
  keys: CatalogKeys,
  to: number,
  now = new Date().toISOString(),
): BuildResult {
  const file = path.join(outDir, 'versions', `${to}.items.json`);
  if (!existsSync(file))
    throw new Error(`Catalog version ${to} does not exist`);
  const snapshot = JSON.parse(readFileSync(file, 'utf8')) as VersionSnapshot;
  const listed = new Map(snapshot.items.map((item) => [item.id, item]));
  for (const item of store.data.items) {
    const old = listed.get(item.id);
    if (!old) {
      item.published = false;
      continue;
    }
    Object.assign(item, {
      current: old.itemVersion,
      published: old.published,
      hidden: old.hidden,
      featured: old.featured,
      order: old.order,
      planKey: old.planKey,
      publishAt: old.publishAt,
      unpublishAt: old.unpublishAt,
    });
  }
  store.save();
  return buildCatalog(store, outDir, keys, { now, rolledBackTo: to });
}
