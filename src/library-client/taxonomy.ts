// FIX7: the library's shape, as the editor shows it and as the owner edits
// it: category → sub-category → section → assets. The editor's own
// categories and the sub-categories and sections its panels already have are
// built in (they can be renamed, hidden and re-ordered, never deleted);
// the owner may add sub-categories and sections to any category, and whole
// new categories. All of it is plain data in the signed catalog: no code.
import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,38}$/);
const label = z
  .object({ en: z.string().min(1).max(40), hi: z.string().min(1).max(40) })
  .strict();

const sectionSchema = z
  .object({
    id: slug,
    name: label,
    hidden: z.boolean().default(false),
    order: z.number().int().default(0),
  })
  .strict();
const subSchema = z
  .object({
    id: slug,
    name: label,
    hidden: z.boolean().default(false),
    order: z.number().int().default(0),
    sections: z.array(sectionSchema).max(60).default([]),
  })
  .strict();
const categorySchema = z
  .object({
    /** An editor category id (Elements …) or a custom one (x-slug). */
    id: z.string().regex(/^[A-Za-z][A-Za-z0-9-]{0,38}$/),
    name: label,
    /** An icon from the editor's icon set. */
    icon: z.string().min(1).max(32),
    hidden: z.boolean().default(false),
    order: z.number().int().default(0),
    subs: z.array(subSchema).max(60).default([]),
  })
  .strict();
export type TaxSection = z.infer<typeof sectionSchema>;
export type TaxSub = z.infer<typeof subSchema>;
export type TaxCategory = z.infer<typeof categorySchema>;

/** The owner's signed settings document (taxonomy now; controls next). */
export const catalogConfigSchema = z
  .object({
    format: z.literal('aive-config'),
    version: z.literal(1),
    categories: z.array(categorySchema).max(40).default([]),
    /** Which editor controls are on, per asset type (see controls.ts). */
    controls: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type CatalogConfig = z.infer<typeof catalogConfigSchema>;
export const emptyConfig = (): CatalogConfig => ({
  format: 'aive-config',
  version: 1,
  categories: [],
  controls: {},
});

/** Where an item is listed (the entry's owner-set placement). */
export const placeSchema = z
  .object({
    category: z.string().regex(/^[A-Za-z][A-Za-z0-9-]{0,38}$/),
    sub: slug.nullable(),
    section: slug.nullable(),
  })
  .strict();
export type Place = z.infer<typeof placeSchema>;

const n = (en: string, hi: string = en) => ({ en, hi });
const section = (id: string, en: string, hi?: string): TaxSection => ({
  id,
  name: n(en, hi),
  hidden: false,
  order: 0,
});
const sub = (
  id: string,
  en: string,
  hi: string | undefined,
  sections: TaxSection[] = [],
): TaxSub => ({ id, name: n(en, hi), hidden: false, order: 0, sections });
const category = (
  id: string,
  en: string,
  hi: string,
  icon: string,
  subs: TaxSub[],
): TaxCategory => ({
  id,
  name: n(en, hi),
  icon,
  hidden: false,
  order: 0,
  subs,
});

/** What the editor's panels have today (names as the panels show them). */
export const BUILTIN_TAXONOMY: readonly TaxCategory[] = [
  category('Templates', 'Templates', 'टेम्पलेट', 'templates', [
    sub('video', 'Video Templates', 'वीडियो टेम्पलेट', []),
    sub('social', 'Social posts', 'सोशल पोस्ट', []),
    sub('print', 'Print and documents', 'प्रिंट और दस्तावेज़', []),
  ]),
  category('Elements', 'Elements', 'एलिमेंट', 'elements', [
    sub('shapes', 'Shapes', 'आकृतियाँ', [
      section('basic', 'Basic shapes', 'बुनियादी आकृतियाँ'),
      section('arrows', 'Arrows', 'तीर'),
      section('polygons', 'Polygons', 'बहुभुज'),
      section('stars', 'Stars', 'तारे'),
      section('flowchart', 'Flowchart shapes', 'फ़्लोचार्ट आकृतियाँ'),
    ]),
    sub('graphics', 'Graphics', 'ग्राफ़िक्स', [
      section('backgrounds', 'Backgrounds', 'बैकग्राउंड'),
      section('gradients', 'Gradients', 'ग्रेडिएंट'),
    ]),
    sub('transitions', 'Transitions', 'ट्रांज़िशन', [
      section('fades', 'Fades and blurs', 'फ़ेड और ब्लर'),
      section('wipes', 'Wipes', 'वाइप'),
      section('pushes', 'Pushes', 'पुश'),
      section('cartoon', 'Cartoon', 'कार्टून'),
      section('glitches', 'Glitches', 'ग्लिच'),
      section('3d', '3D', '3D'),
    ]),
    sub('photos', 'Photos', 'फ़ोटो'),
    sub('videos', 'Videos', 'वीडियो'),
  ]),
  category('Text', 'Text', 'टेक्स्ट', 'text', [
    sub('default', 'Default text styles', 'डिफ़ॉल्ट टेक्स्ट स्टाइल'),
    sub('combinations', 'Font combinations', 'फ़ॉन्ट कॉम्बिनेशन'),
    sub('plain', 'Plain text', 'सादा टेक्स्ट'),
    sub('styles', 'Text styles', 'टेक्स्ट स्टाइल'),
    sub('titles', 'Titles', 'टाइटल'),
    sub('two-line', 'Two line', 'दो लाइन'),
  ]),
  category('Media', 'Media', 'मीडिया', 'media', [
    sub('photos', 'Photos', 'फ़ोटो'),
    sub('videos', 'Videos', 'वीडियो'),
  ]),
  category('Draw', 'Draw', 'ड्रॉ', 'pen', [
    sub('pens', 'Pens and brushes', 'पेन और ब्रश'),
    sub('stickers', 'Stickers and stamps', 'स्टिकर और स्टैम्प'),
    sub('sketch-shapes', 'Hand-drawn shapes', 'हाथ से बनी आकृतियाँ'),
  ]),
  category('Scene', 'Scene', 'सीन', 'layers', [
    sub('backgrounds', 'Scene backgrounds', 'सीन बैकग्राउंड'),
    sub('camera', 'Camera moves', 'कैमरा मूवमेंट'),
  ]),
  category('Audio', 'Audio', 'ऑडियो', 'audio', [
    sub('sound-effects', 'Sound effects', 'साउंड इफ़ेक्ट'),
    sub('music', 'Music', 'संगीत'),
  ]),
  category('Theme', 'Theme', 'थीम', 'color', [
    sub('themes', 'Themes', 'थीम'),
    sub('styles', 'Styles', 'स्टाइल'),
    sub('motion', 'Motion and presets', 'मोशन और प्रीसेट'),
  ]),
];

/**
 * The taxonomy the editor and the owner app use: the built-in tree with
 * the owner's changes laid over it (renames, hidden, order, additions).
 */
export function mergeTaxonomy(config: CatalogConfig | null): TaxCategory[] {
  const owner = config?.categories ?? [];
  const mergeSections = (
    base: readonly TaxSection[],
    own: readonly TaxSection[],
  ) => [
    ...base.map((item) => ({
      ...item,
      ...(own.find((o) => o.id === item.id) ?? {}),
    })),
    ...own.filter((o) => !base.some((item) => item.id === o.id)),
  ];
  const mergeSubs = (base: readonly TaxSub[], own: readonly TaxSub[]) => [
    ...base.map((item) => {
      const o = own.find((x) => x.id === item.id);
      return o
        ? { ...item, ...o, sections: mergeSections(item.sections, o.sections) }
        : item;
    }),
    ...own.filter((o) => !base.some((item) => item.id === o.id)),
  ];
  const merged: TaxCategory[] = BUILTIN_TAXONOMY.map((item) => {
    const o = owner.find((x) => x.id === item.id);
    return o ? { ...item, ...o, subs: mergeSubs(item.subs, o.subs) } : item;
  });
  for (const o of owner)
    if (!BUILTIN_TAXONOMY.some((item) => item.id === o.id)) merged.push(o);
  const byOrder = <T extends { order: number }>(list: T[]) =>
    list
      .map((item, index) => ({ item, index }))
      .sort((a, b) => a.item.order - b.item.order || a.index - b.index)
      .map((entry) => entry.item);
  return byOrder(merged).map((cat) => ({
    ...cat,
    subs: byOrder(cat.subs).map((s) => ({
      ...s,
      sections: byOrder(s.sections),
    })),
  }));
}

/** Whether an id names one of the editor's own categories. */
export const isBuiltinCategory = (id: string) =>
  BUILTIN_TAXONOMY.some((item) => item.id === id);

/** Whether a node is one of the editor's own (it can be hidden, not deleted). */
export function isBuiltinNode(
  category: string,
  sub?: string,
  section?: string,
): boolean {
  const cat = BUILTIN_TAXONOMY.find((item) => item.id === category);
  if (!cat) return false;
  if (!sub) return true;
  const s = cat.subs.find((item) => item.id === sub);
  if (!s) return false;
  return !section || s.sections.some((item) => item.id === section);
}

/** A custom category's id: `x-` and a slug. */
export const customCategoryId = (name: string) =>
  `x-${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'new'
  }`;

/**
 * Where an item lives when the owner has not placed it: the editor panel
 * that shows its kind (and section, when it has one).
 */
export function defaultPlace(kind: string, section: string | undefined): Place {
  const s = section ?? null;
  switch (kind) {
    case 'shape':
      return { category: 'Elements', sub: 'shapes', section: s };
    case 'background':
      return { category: 'Elements', sub: 'graphics', section: s };
    case 'transition':
      return { category: 'Elements', sub: 'transitions', section: s };
    case 'image':
      return { category: 'Elements', sub: 'photos', section: null };
    case 'video':
      return { category: 'Elements', sub: 'videos', section: null };
    case 'text':
      return { category: 'Text', sub: s ?? 'plain', section: null };
    case 'template':
      return { category: 'Templates', sub: null, section: null };
    case 'sound':
      return { category: 'Audio', sub: 'sound-effects', section: null };
    case 'theme':
      return { category: 'Theme', sub: 'themes', section: null };
    case 'style':
      return { category: 'Theme', sub: 'styles', section: null };
    case 'motion':
    case 'preset':
      return { category: 'Theme', sub: 'motion', section: null };
    default:
      return { category: 'Elements', sub: null, section: null };
  }
}

// --- Editing (the owner app): pure functions on the owner's config ----------

export interface NodePath {
  readonly category: string;
  readonly sub?: string;
  readonly section?: string;
}
export interface NodePatch {
  name?: { en: string; hi: string };
  hidden?: boolean;
  order?: number;
  icon?: string;
}
const clone = <T>(value: T): T => structuredClone(value);

/** The slug a new node's name becomes (unique among its siblings). */
export function uniqueSlug(name: string, taken: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'new';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

function ownerCategory(
  config: CatalogConfig,
  tree: readonly TaxCategory[],
  id: string,
): TaxCategory {
  let own = config.categories.find((c) => c.id === id);
  if (!own) {
    const base = tree.find((c) => c.id === id);
    if (!base) throw new Error('That category does not exist.');
    own = { ...clone(base), subs: [] };
    config.categories.push(own);
  }
  return own;
}
function ownerSub(
  config: CatalogConfig,
  tree: readonly TaxCategory[],
  category: string,
  id: string,
): TaxSub {
  const cat = ownerCategory(config, tree, category);
  let own = cat.subs.find((s) => s.id === id);
  if (!own) {
    const base = tree
      .find((c) => c.id === category)
      ?.subs.find((s) => s.id === id);
    if (!base) throw new Error('That sub-category does not exist.');
    own = { ...clone(base), sections: [] };
    cat.subs.push(own);
  }
  return own;
}

/** A new category (always a custom one) with no sub-categories yet. */
export function addCategory(
  config: CatalogConfig,
  tree: readonly TaxCategory[],
  name: { en: string; hi: string },
  icon = 'folder',
): { config: CatalogConfig; id: string } {
  const next = clone(config);
  const id = `x-${uniqueSlug(
    name.en,
    tree.map((c) => c.id.replace(/^x-/, '')),
  )}`;
  next.categories.push({
    id,
    name,
    icon,
    hidden: false,
    order: tree.length * 10,
    subs: [],
  });
  return { config: next, id };
}
export function addSub(
  config: CatalogConfig,
  tree: readonly TaxCategory[],
  category: string,
  name: { en: string; hi: string },
): { config: CatalogConfig; id: string } {
  const next = clone(config);
  const cat = ownerCategory(next, tree, category);
  const existing = tree.find((c) => c.id === category)?.subs ?? [];
  const id = uniqueSlug(
    name.en,
    existing.map((s) => s.id),
  );
  cat.subs.push({
    id,
    name,
    hidden: false,
    order: existing.length * 10,
    sections: [],
  });
  return { config: next, id };
}
export function addSection(
  config: CatalogConfig,
  tree: readonly TaxCategory[],
  category: string,
  sub: string,
  name: { en: string; hi: string },
): { config: CatalogConfig; id: string } {
  const next = clone(config);
  const own = ownerSub(next, tree, category, sub);
  const existing =
    tree.find((c) => c.id === category)?.subs.find((s) => s.id === sub)
      ?.sections ?? [];
  const id = uniqueSlug(
    name.en,
    existing.map((s) => s.id),
  );
  own.sections.push({
    id,
    name,
    hidden: false,
    order: existing.length * 10,
  });
  return { config: next, id };
}
/** Renames, hides or re-orders a node (any node, built in or added). */
export function patchNode(
  config: CatalogConfig,
  tree: readonly TaxCategory[],
  path: NodePath,
  patch: NodePatch,
): CatalogConfig {
  const next = clone(config);
  if (path.section && path.sub) {
    const sub = ownerSub(next, tree, path.category, path.sub);
    let own = sub.sections.find((s) => s.id === path.section);
    if (!own) {
      const base = tree
        .find((c) => c.id === path.category)
        ?.subs.find((s) => s.id === path.sub)
        ?.sections.find((s) => s.id === path.section);
      if (!base) throw new Error('That section does not exist.');
      own = clone(base);
      sub.sections.push(own);
    }
    const { icon: _icon, ...rest } = patch;
    Object.assign(own, rest);
  } else if (path.sub) {
    const own = ownerSub(next, tree, path.category, path.sub);
    const { icon: _icon, ...rest } = patch;
    Object.assign(own, rest);
  } else Object.assign(ownerCategory(next, tree, path.category), patch);
  return next;
}
/** Removes a node the owner added (built-in ones can only be hidden). */
export function removeNode(
  config: CatalogConfig,
  path: NodePath,
): CatalogConfig {
  const next = clone(config);
  const builtinCat = BUILTIN_TAXONOMY.find((c) => c.id === path.category);
  if (!path.sub) {
    if (builtinCat)
      throw new Error('The editor’s own categories can only be hidden.');
    next.categories = next.categories.filter((c) => c.id !== path.category);
    return next;
  }
  const builtinSub = builtinCat?.subs.find((s) => s.id === path.sub);
  const cat = next.categories.find((c) => c.id === path.category);
  if (!path.section) {
    if (builtinSub)
      throw new Error('The editor’s own sub-categories can only be hidden.');
    if (cat) cat.subs = cat.subs.filter((s) => s.id !== path.sub);
    return next;
  }
  if (builtinSub?.sections.some((x) => x.id === path.section))
    throw new Error('The editor’s own sections can only be hidden.');
  const sub = cat?.subs.find((s) => s.id === path.sub);
  if (sub) sub.sections = sub.sections.filter((x) => x.id !== path.section);
  return next;
}
/** Moves a node one place up or down among its siblings. */
export function moveNode(
  config: CatalogConfig,
  tree: readonly TaxCategory[],
  path: NodePath,
  direction: -1 | 1,
): CatalogConfig {
  const siblings: { id: string }[] = path.section
    ? (tree
        .find((c) => c.id === path.category)
        ?.subs.find((s) => s.id === path.sub)?.sections ?? [])
    : path.sub
      ? (tree.find((c) => c.id === path.category)?.subs ?? [])
      : [...tree];
  const id = path.section ?? path.sub ?? path.category;
  const at = siblings.findIndex((s) => s.id === id);
  const to = at + direction;
  if (at < 0 || to < 0 || to >= siblings.length) return config;
  const order = siblings.map((s) => s.id);
  [order[at], order[to]] = [order[to]!, order[at]!];
  let next = config;
  order.forEach((siblingId, index) => {
    const nodePath: NodePath = path.section
      ? { ...path, section: siblingId }
      : path.sub
        ? { ...path, sub: siblingId }
        : { category: siblingId };
    next = patchNode(next, tree, nodePath, { order: index * 10 });
  });
  return next;
}
