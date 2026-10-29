// Phase 1 library (docs/LIBRARY.md, "Catalog"): the format of the signed
// catalog the owner publishes and the editor reads. It is transport only:
// the items it carries are the existing library records (`LibraryItem`),
// Creator Pack themes and styles, and media files (P1-03). Pure data and
// zod schemas, shared by the editor client and the owner's publish pipeline.
import { z } from 'zod';

/** One index file per library category (P1-04). */
export const CATALOG_CATEGORIES = [
  'elements',
  'draw',
  'text',
  'templates',
  'audio',
  'styles',
] as const;
export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

/** Item kinds: the library's own, the Creator Pack theme and style, media. */
export const CATALOG_KINDS = [
  'shape',
  'background',
  'text',
  'template',
  'transition',
  'theme',
  'style',
  'motion',
  'preset',
  'sound',
  'video',
  'image',
] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];
/** Kinds whose payload is a file too large to inline (P1-05). */
export const HEAVY_KINDS: readonly CatalogKind[] = ['sound', 'video', 'image'];
/** A payload under this many bytes is inlined in its category index. */
export const INLINE_LIMIT = 8 * 1024;

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
/** A content-hashed, immutable file: `files/<sha256>.<ext>`. */
const fileName = z.string().regex(/^files\/[0-9a-f]{64}\.[a-z0-9]{1,5}$/);
const iso = z.string().datetime({ offset: true });
export const fileRefSchema = z
  .object({
    url: fileName,
    sha256,
    size: z.number().int().nonnegative(),
    mime: z.string().min(3).max(80),
  })
  .strict();
export type FileRef = z.infer<typeof fileRefSchema>;

const name = z
  .object({ en: z.string().min(1).max(80), hi: z.string().min(1).max(80) })
  .strict();
export const licenseSchema = z
  .object({
    name: z.string().min(1).max(60),
    credit: z.string().max(200).optional(),
    url: z.string().url().max(300).optional(),
  })
  .strict();

export const catalogEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,64}$/),
    kind: z.enum(CATALOG_KINDS),
    name,
    tags: z.array(z.string().min(1).max(30)).max(12),
    license: licenseSchema,
    itemVersion: z.number().int().min(1),
    /** A small picture for the panel (SVG or raster), content-hashed. */
    thumbUrl: fileName.nullable(),
    /** A tiny placeholder drawn before the thumbnail (a data URL, P1-23). */
    blur: z
      .string()
      .max(1600)
      .regex(/^data:image\/(svg\+xml|png|webp);/),
    /** Bytes of the payload (inline JSON or the full file). */
    size: z.number().int().nonnegative(),
    /** Small items: the record itself; larger ones: a file. */
    payload: z.union([
      z.object({ inline: z.unknown() }).strict(),
      z.object({ file: fileRefSchema }).strict(),
    ]),
    /** Heavy media (P1-05): a poster or waveform, a small proxy, the file. */
    media: z
      .object({
        poster: fileRefSchema.optional(),
        proxy: fileRefSchema.optional(),
        full: fileRefSchema,
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        duration: z.number().finite().nonnegative().optional(),
      })
      .strict()
      .optional(),
    // Owner-controlled fields.
    hidden: z.boolean(),
    featured: z.boolean(),
    order: z.number().int(),
    /** Reserved for plans (Phase 2); null means free for everyone. */
    planKey: z.string().max(40).nullable(),
    publishAt: iso.nullable(),
    unpublishAt: iso.nullable(),
  })
  .strict();
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

export const categoryIndexSchema = z
  .object({
    format: z.literal('aive-catalog-index'),
    category: z.enum(CATALOG_CATEGORIES),
    catalogVersion: z.number().int().min(1),
    /** Templates only: the Templates panel's categories (D-143). */
    taxonomy: z.array(z.unknown()).max(40).optional(),
    entries: z.array(catalogEntrySchema).max(5000),
  })
  .strict()
  .superRefine((index, context) => {
    const seen = new Set<string>();
    for (const entry of index.entries) {
      if (seen.has(entry.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate catalog id ${entry.id}`,
        });
      seen.add(entry.id);
    }
  });
export type CategoryIndex = z.infer<typeof categoryIndexSchema>;

const categoryRef = z
  .object({ url: fileName, sha256, count: z.number().int().nonnegative() })
  .strict();
/** The signed part of manifest.json. */
export const catalogManifestSchema = z
  .object({
    format: z.literal('aive-catalog'),
    catalogVersion: z.number().int().min(1),
    generatedAt: iso,
    /** Set when this version re-points to an older one (P1-08). */
    rolledBackTo: z.number().int().min(1).optional(),
    categories: z
      .object({
        elements: categoryRef,
        draw: categoryRef,
        text: categoryRef,
        templates: categoryRef,
        audio: categoryRef,
        styles: categoryRef,
      })
      .strict(),
  })
  .strict();
export type CatalogManifest = z.infer<typeof catalogManifestSchema>;

/**
 * manifest.json: the manifest as the exact string that was signed, the
 * Ed25519 signature over its UTF-8 bytes (base64) and the key id.
 */
export const signedManifestSchema = z
  .object({
    signed: z.string().min(2).max(200_000),
    signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
    keyId: z.string().regex(/^[0-9a-f]{16}$/),
  })
  .strict();
export type SignedManifest = z.infer<typeof signedManifestSchema>;

/** The category an item is listed in (P1-04). */
export function categoryOf(
  kind: CatalogKind,
  section?: string,
): CatalogCategory {
  switch (kind) {
    case 'shape':
      // FIX7: flowchart shapes are Elements › Shapes (Draw holds the pens).
      void section;
      return 'elements';
    case 'background':
    case 'transition':
    case 'image':
    case 'video':
      return 'elements';
    case 'text':
      return 'text';
    case 'template':
      return 'templates';
    case 'sound':
      return 'audio';
    case 'theme':
    case 'style':
    case 'motion':
    case 'preset':
      return 'styles';
  }
}

/** Whether an entry is listed now: not hidden and inside its schedule. */
export function isListed(entry: CatalogEntry, now = Date.now()): boolean {
  if (entry.hidden) return false;
  if (entry.publishAt && Date.parse(entry.publishAt) > now) return false;
  if (entry.unpublishAt && Date.parse(entry.unpublishAt) <= now) return false;
  return true;
}
/** Featured first, then the owner's order, then the published order. */
export function orderEntries(entries: readonly CatalogEntry[]): CatalogEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        Number(b.entry.featured) - Number(a.entry.featured) ||
        a.entry.order - b.entry.order ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);
}

/** A plain sentence for the first problem in a value, or null. */
export function formatProblem(
  schema: z.ZodTypeAny,
  value: unknown,
): string | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0]!;
  return `${issue.path.join('.') || 'the file'}: ${issue.message}`;
}

/** Key id: the first 16 hex characters of the public key's SHA-256. */
export const KEY_ID_LENGTH = 16;
