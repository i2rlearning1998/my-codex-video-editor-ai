// Phase 1 library: the owner's item store (the source of truth the catalog
// is built from). JSON files in a data folder (D-330: node:sqlite is not in
// Node 20, the CI runtime), written atomically. Files (payloads, thumbnails,
// media) are kept once by their SHA-256.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type {
  CatalogCategory,
  CatalogKind,
} from '../../src/library-client/format';
import type { CatalogConfig, Place } from '../../src/library-client/taxonomy';
import { sha256Hex } from './keys';

export interface StoredFile {
  readonly sha256: string;
  readonly ext: string;
  readonly mime: string;
  readonly size: number;
}
export interface StoredVersion {
  readonly itemVersion: number;
  /** SHA-256 of the canonical payload (or the full file): the identity. */
  readonly contentHash: string;
  /** Small items: the record itself. */
  readonly inline?: unknown;
  /** A payload too large to inline. */
  readonly file?: StoredFile;
  readonly thumb?: StoredFile;
  readonly blur: string;
  readonly media?: {
    readonly poster?: StoredFile;
    readonly proxy?: StoredFile;
    readonly full: StoredFile;
    readonly width?: number;
    readonly height?: number;
    readonly duration?: number;
  };
  readonly createdAt: string;
  /** Where it came from (a pack file name, "seed", an upload). */
  readonly source: string;
}
export interface StoredItem {
  readonly id: string;
  readonly category: CatalogCategory;
  readonly kind: CatalogKind;
  name: { en: string; hi: string };
  tags: string[];
  license: { name: string; credit?: string; url?: string };
  versions: StoredVersion[];
  /** The item version the catalog lists. */
  current: number;
  /** False after Unpublish: the item stays here but leaves the catalog. */
  published: boolean;
  hidden: boolean;
  featured: boolean;
  order: number;
  planKey: string | null;
  publishAt: string | null;
  unpublishAt: string | null;
  /** FIX7: where the owner lists it (absent: by its kind). */
  place?: Place;
  /** FIX7: copies: more places it is also listed in. */
  alsoIn?: Place[];
}
export interface StoreData {
  version: 1;
  /** The Templates panel's categories (D-143). */
  taxonomy: unknown[];
  items: StoredItem[];
  /** FIX7: the owner's taxonomy and controls (published, signed). */
  config?: CatalogConfig;
}

const empty = (): StoreData => ({ version: 1, taxonomy: [], items: [] });

export class ItemStore {
  readonly filesDir: string;
  private readonly file: string;
  data: StoreData;
  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.filesDir = path.join(dir, 'files');
    mkdirSync(this.filesDir, { recursive: true });
    this.file = path.join(dir, 'items.json');
    this.data = existsSync(this.file)
      ? (JSON.parse(readFileSync(this.file, 'utf8')) as StoreData)
      : empty();
  }
  save(): void {
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data, null, 1));
    renameSync(temp, this.file);
  }
  find(id: string): StoredItem | undefined {
    return this.data.items.find((item) => item.id === id);
  }
  /** Keeps a file once by its hash; returns its record. */
  putFile(bytes: Uint8Array, ext: string, mime: string): StoredFile {
    const sha256 = sha256Hex(bytes);
    const target = path.join(this.filesDir, `${sha256}.${ext}`);
    if (!existsSync(target)) writeFileSync(target, bytes);
    return { sha256, ext, mime, size: bytes.byteLength };
  }
  filePath(file: StoredFile): string {
    return path.join(this.filesDir, `${file.sha256}.${file.ext}`);
  }
}

/** A stable JSON text (sorted keys) for hashing records. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value);
}

export interface Candidate {
  readonly id: string;
  readonly kind: CatalogKind;
  readonly category: CatalogCategory;
  readonly name: { en: string; hi: string };
  readonly tags: readonly string[];
  readonly license: { name: string; credit?: string; url?: string };
  readonly version: Omit<StoredVersion, 'itemVersion' | 'createdAt'>;
}

/**
 * Adds a candidate as a new item or a new version. The same item with the
 * same content is skipped (idempotent publish, P1-07).
 */
export function upsertCandidate(
  store: ItemStore,
  candidate: Candidate,
  now: string,
): 'added' | 'updated' | 'unchanged' {
  const existing = store.find(candidate.id);
  if (!existing) {
    store.data.items.push({
      id: candidate.id,
      category: candidate.category,
      kind: candidate.kind,
      name: { ...candidate.name },
      tags: [...candidate.tags],
      license: { ...candidate.license },
      versions: [{ ...candidate.version, itemVersion: 1, createdAt: now }],
      current: 1,
      published: true,
      hidden: false,
      featured: false,
      order: store.data.items.length,
      planKey: null,
      publishAt: null,
      unpublishAt: null,
    });
    return 'added';
  }
  const latest = existing.versions.at(-1)!;
  if (latest.contentHash === candidate.version.contentHash) {
    if (existing.current === latest.itemVersion && existing.published)
      return 'unchanged';
    existing.current = latest.itemVersion;
    existing.published = true;
    return 'updated';
  }
  const itemVersion = latest.itemVersion + 1;
  existing.versions.push({ ...candidate.version, itemVersion, createdAt: now });
  existing.current = itemVersion;
  existing.published = true;
  existing.name = { ...candidate.name };
  existing.tags = [...candidate.tags];
  existing.license = { ...candidate.license };
  return 'updated';
}
