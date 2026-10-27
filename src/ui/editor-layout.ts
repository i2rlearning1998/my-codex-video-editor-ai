// FIX6: the editor's layout as data. The left rail (which categories show,
// in what order, with which icon and plan key) is read from one layout
// object instead of being fixed in the shell. The shipped default is below.
// Later (Phase 3) the owner app publishes a signed layout the same way it
// publishes the library catalog; `resolveEditorLayout` is where such a
// layout is checked. A layout is plain data: it can show, hide, reorder and
// lock the editor's own categories, but it can never add code or a category
// the editor does not have.
import { z } from 'zod';

/** The categories the editor has panels for (a layout may only use these). */
export const RAIL_CATEGORY_IDS = [
  'Templates',
  'Elements',
  'Text',
  'Media',
  'Draw',
  'Scene',
  'Record',
  'Audio',
  'AI',
  'MyTemplates',
  'Theme',
] as const;
export type RailCategoryId = (typeof RAIL_CATEGORY_IDS)[number];

const railItemSchema = z
  .object({
    id: z.enum(RAIL_CATEGORY_IDS),
    /** An icon name from the editor's icon set. */
    icon: z.string().min(1).max(32),
    /** False hides the category (its panel is not mounted in the rail). */
    visible: z.boolean().default(true),
    /** A feature key (plan lock); see the feature-key registry. */
    featureKey: z.string().min(1).max(64).optional(),
  })
  .strict();
export type RailItem = z.infer<typeof railItemSchema>;

const layoutSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1).max(48),
    rail: z.array(railItemSchema).min(1).max(RAIL_CATEGORY_IDS.length),
  })
  .strict()
  .superRefine((layout, ctx) => {
    const seen = new Set<string>();
    for (const item of layout.rail) {
      if (seen.has(item.id))
        ctx.addIssue({ code: 'custom', message: `Duplicate ${item.id}` });
      seen.add(item.id);
    }
    if (!layout.rail.some((item) => item.visible))
      ctx.addIssue({ code: 'custom', message: 'No category is visible' });
  });
export type EditorLayout = z.infer<typeof layoutSchema>;

/** H2: the order a user reaches for them. */
export const DEFAULT_EDITOR_LAYOUT: EditorLayout = {
  version: 1,
  id: 'default',
  rail: [
    { id: 'Templates', icon: 'templates', visible: true },
    { id: 'Elements', icon: 'elements', visible: true },
    { id: 'Text', icon: 'text', visible: true },
    { id: 'Media', icon: 'media', visible: true },
    { id: 'Draw', icon: 'pen', visible: true },
    { id: 'Scene', icon: 'layers', visible: true },
    // V7 (spec 11.4): Record & create, before Audio.
    { id: 'Record', icon: 'mic', visible: true },
    { id: 'Audio', icon: 'audio', visible: true },
    // Q4: everything imported from Creator Packs.
    { id: 'AI', icon: 'magic', visible: true },
    // R5: the user's own saved elements and scenes.
    { id: 'MyTemplates', icon: 'folder', visible: true },
    // T1: one-click themes.
    { id: 'Theme', icon: 'color', visible: true },
  ],
};

/**
 * A layout from outside (a published one, a saved one) checked and made
 * complete: a layout that is not valid gives the default; categories the
 * layout leaves out are hidden, not lost (they keep their default icon).
 */
export function resolveEditorLayout(value: unknown): EditorLayout {
  const parsed = layoutSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_EDITOR_LAYOUT;
}

/** The categories the rail shows, in order. */
export function railCategories(layout: EditorLayout): RailCategoryId[] {
  return layout.rail.filter((item) => item.visible).map((item) => item.id);
}

/** A category's icon in this layout. */
export function railIcon(layout: EditorLayout, id: RailCategoryId): string {
  return (
    layout.rail.find((item) => item.id === id)?.icon ??
    DEFAULT_EDITOR_LAYOUT.rail.find((item) => item.id === id)!.icon
  );
}
