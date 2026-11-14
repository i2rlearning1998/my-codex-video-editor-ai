// ROUND-C1 C1.2: the v4 checks. Every id a plan names (effects, filters,
// adjustments, blend modes, transitions) is checked against the editor's
// real FX catalog; an unknown id is a plain error that names the nearest
// valid ids. DOM-free and light (no compiler here: graphics defs are
// compiled by defs.ts, loaded lazily).
import { adjustments, blendModes, effects, filters, transitions } from '../fx';
import { TRANSITION_TYPES } from '../core/transitions';
import { getBlock } from '../blocks/starters';
import { KIT_TRANSITIONS } from './kit-ids';
import { PLAN_DEF_LIMITS, type PlanLayer, type VideoPlan } from './schema';

/** Edit distance (small strings only). */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = keep;
    }
  }
  return row[b.length]!;
}
/** Up to three valid ids nearest to `word`. */
export function nearest(
  word: string,
  valid: readonly string[],
  n = 3,
): string[] {
  const w = word.toLowerCase();
  return [...valid]
    .map((v) => {
      const short = v.replace(/^[a-z]+\./, '');
      return {
        v,
        d:
          Math.min(
            distance(w, v),
            distance(w.replace(/^[a-z]+\./, ''), short),
          ) - (v.includes(w.replace(/^[a-z]+\./, '')) ? 2 : 0),
      };
    })
    .sort((a, b) => a.d - b.d || (a.v < b.v ? -1 : 1))
    .slice(0, n)
    .map((x) => x.v);
}
const unknown = (
  at: string,
  what: string,
  id: string,
  valid: readonly string[],
) =>
  `${at}: there is no ${what} "${id}". Nearest: ${nearest(id, valid).join(', ')}.`;

export const FX_IDS = [...effects, ...filters, ...adjustments].map((d) => d.id);
export const BLEND_IDS = blendModes.map((d) => d.id);
export const PIXEL_TRANSITION_IDS = transitions.map((d) => d.id);
export const CLIP_TRANSITION_IDS = [
  ...TRANSITION_TYPES,
  ...PIXEL_TRANSITION_IDS,
];
/** "multiply" or "blend.multiply" as the catalog id, or null. */
export const blendIdOf = (name: string): string | null => {
  const id = name.startsWith('blend.') ? name : `blend.${name}`;
  return BLEND_IDS.includes(id) ? id : null;
};

/** The v4 fields of one layer. */
export function checkLayerV4(
  layer: PlanLayer,
  at: string,
  errors: string[],
  warnings: string[],
  defIds: ReadonlySet<string>,
): void {
  for (const fx of layer.fx ?? [])
    if (!FX_IDS.includes(fx.id))
      errors.push(unknown(at, 'effect or filter', fx.id, FX_IDS));
  if (layer.blend && !blendIdOf(layer.blend))
    errors.push(unknown(at, 'blend mode', layer.blend, BLEND_IDS));
  if (
    layer.transitionIn &&
    !CLIP_TRANSITION_IDS.includes(layer.transitionIn.type)
  )
    errors.push(
      unknown(at, 'transition', layer.transitionIn.type, CLIP_TRANSITION_IDS),
    );
  const media = layer.kind === 'media';
  const picture = media && layer.mediaIntent?.type !== 'audio';
  if (layer.chromaKey && !picture)
    errors.push(`${at}: "chromaKey" works on a picture or video layer only.`);
  if (layer.fit && !picture)
    errors.push(`${at}: "fit" works on a picture or video layer only.`);
  const timed =
    media &&
    (layer.mediaIntent?.type === 'video' ||
      layer.mediaIntent?.type === 'audio');
  for (const field of ['speed', 'reverse', 'sourceIn'] as const)
    if (layer[field] !== undefined && !timed && layer.kind !== 'block')
      errors.push(
        `${at}: "${field}" works on video, sound and graphics layers only.`,
      );
  if (
    (layer.volume !== undefined ||
      layer.fadeIn !== undefined ||
      layer.fadeOut !== undefined) &&
    !timed
  )
    errors.push(
      `${at}: "volume", "fadeIn" and "fadeOut" work on video and sound layers only.`,
    );
  if (
    (layer.font || layer.letterSpacing !== undefined) &&
    !['title', 'text', 'bubble'].includes(layer.kind)
  )
    warnings.push(`${at}: "font" and "letterSpacing" are for text; ignored.`);
  if (layer.queries?.length && !media)
    errors.push(`${at}: "queries" belong on a media layer.`);
  const keys = layer.keyframes ?? [];
  for (const p of new Set(keys.map((k) => k.property))) {
    const times = keys.filter((k) => k.property === p).map((k) => k.at);
    if (new Set(times).size !== times.length)
      errors.push(`${at}: two "${p}" keyframes at the same time.`);
  }
  if (
    layer.kind === 'block' &&
    layer.block &&
    defIds.has(layer.block) &&
    getBlock(layer.block)
  )
    errors.push(
      `${at}: "${layer.block}" is both a built-in block and a new graphic.`,
    );
}

/** Plan-level v4 checks: defs, scene transitions. */
export function checkPlanV4(
  plan: VideoPlan,
  errors: string[],
  warnings: string[],
): Set<string> {
  const defs = plan.defs?.blocks ?? [];
  const ids = new Set<string>();
  defs.forEach((def, i) => {
    const at = `New graphic ${i + 1} (${def.id})`;
    if (ids.has(def.id)) errors.push(`${at}: another new graphic has this id.`);
    if (getBlock(def.id))
      errors.push(
        `${at}: "${def.id}" is a built-in block; give the new graphic its own id.`,
      );
    ids.add(def.id);
  });
  if (defs.length > PLAN_DEF_LIMITS.defs)
    errors.push(`A plan may define ${PLAN_DEF_LIMITS.defs} new graphics.`);
  plan.scenes.forEach((scene, i) => {
    const type = scene.transitionOut?.type;
    if (
      type &&
      type.startsWith('transition.') &&
      !PIXEL_TRANSITION_IDS.includes(type)
    )
      errors.push(
        unknown(`Scene ${i + 1} (${scene.id})`, 'transition', type, [
          ...KIT_TRANSITIONS,
          ...PIXEL_TRANSITION_IDS,
        ]),
      );
  });
  if (
    plan.meta.assets?.onlyMine &&
    (plan.meta.assets.aiImagesMax || plan.meta.assets.aiVideosMax)
  )
    warnings.push(
      '"Use only my files" is on, so no AI pictures or videos are made.',
    );
  return ids;
}
