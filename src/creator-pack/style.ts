// B1: the kit check of a `style` item. A kit id must exist in the editor,
// or be marked `{id, optional: true}`. Animate presets are always known;
// FX ids are checked against the FX catalog and library ids against the
// known library when the caller supplies them (the editor always does);
// without a catalog an id cannot be checked, which is a warning, never a
// silent pass.
import { IN_OUT_PRESETS, LOOP_PRESETS } from '../core/clip-animation';
import type { KitId, StyleData } from './schemas';

/** The editor's own Animate presets, valid in every kit. */
export const BUILT_IN_PRESETS: readonly string[] = [
  ...IN_OUT_PRESETS,
  ...LOOP_PRESETS,
  'ken-burns',
];
export const kitIdOf = (entry: KitId) =>
  typeof entry === 'string' ? entry : entry.id;
export const kitOptional = (entry: KitId) => typeof entry !== 'string';

export interface StyleKitContext {
  fxCatalog: readonly string[];
  knownLibraryIds: readonly string[];
  packId: string;
  packItems: readonly string[];
}

/** Throws on a required id that is unknown; returns warnings. */
export function checkStyleKit(
  data: StyleData,
  context: StyleKitContext,
): string[] {
  const warnings: string[] = [];
  const library = new Set(
    context.knownLibraryIds.flatMap((id) => [id, id.replace('/', '--')]),
  );
  const local = (id: string) =>
    context.packItems.some(
      (item) =>
        id === item ||
        id === `${context.packId}/${item}` ||
        id === `${context.packId}--${item}`,
    );
  /** A library id (pack/item) that cannot be checked without the library. */
  const libraryShaped = (id: string) => id.includes('/') || id.includes('--');
  const groups: [keyof StyleData['kit'], (id: string) => boolean | null][] = [
    [
      'presets',
      (id) =>
        BUILT_IN_PRESETS.includes(id) || local(id) || library.has(id)
          ? true
          : !library.size && libraryShaped(id)
            ? null
            : false,
    ],
    [
      'transitions',
      (id) =>
        context.fxCatalog.length ? context.fxCatalog.includes(id) : null,
    ],
    [
      'effects',
      (id) =>
        context.fxCatalog.length ? context.fxCatalog.includes(id) : null,
    ],
    [
      'preferLibrary',
      (id) => local(id) || (library.size ? library.has(id) : null),
    ],
  ];
  const unchecked: string[] = [];
  const KIT_WORD: Record<string, string> = {
    transitions: 'a transition',
    effects: 'an effect',
    preferLibrary: 'a library item',
  };
  for (const [group, known] of groups)
    for (const entry of data.kit[group]) {
      const id = kitIdOf(entry);
      const found = known(id);
      if (found === true) continue;
      if (kitOptional(entry)) {
        // FIX1 F7: in plain words (the owner reads these).
        if (found === false)
          warnings.push(
            `This style asks for ${KIT_WORD[group]} "${plainKitName(id)}" that this editor does not have yet; it will be skipped.`,
          );
        continue;
      }
      if (found === null) unchecked.push(`${group}: ${id}`);
      else
        throw Error(
          `Unknown kit ${group.replace(/s$/, '')} ${id}: use an id from the editor's library index or mark it {"id": "${id}", "optional": true}.`,
        );
    }
  if (unchecked.length)
    warnings.push(
      `Kit ids not checked (no catalog supplied): ${unchecked.join(', ')}.`,
    );
  const policy = data.assetPolicy;
  if (
    !policy.order.includes('ai') &&
    (policy.aiImagesMax > 0 || policy.aiVideosMax > 0)
  )
    throw Error(
      'assetPolicy allows AI images or videos but its order has no "ai"; add "ai" last or set both maxima to 0.',
    );
  return warnings;
}
/** FIX1 F7: "transition.dip-to-black" → "dip to black". */
function plainKitName(id: string): string {
  const last = id.split(/[./]/).filter(Boolean).at(-1) ?? id;
  return last.replace(/[-_]+/g, ' ').trim() || id;
}
