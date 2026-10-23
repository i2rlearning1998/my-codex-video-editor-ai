// FINAL3 V1.3 and V1.4: reading a Video Plan v2. Errors are plain sentences
// that name the scene and layer ("Scene 2 (intro), layer "logo": ..."); an
// unknown field is a warning, not a failure; the quality gate adds what
// would make a weak video (too much narration for the time, text too long
// to read, a media layer that says nothing to look for, unknown kit ids).
import type { ZodIssue } from 'zod';
import {
  PLAN_LIMITS,
  strictPlanSchema,
  videoPlanSchema,
  type VideoPlan,
} from './schema';
import { isKitId } from './kit';
import { estimateSceneDuration } from './timing';
import { getBlock } from '../blocks/starters';
import { validateParams } from '../blocks/params';

export interface PlanCheck {
  readonly ok: boolean;
  readonly plan: VideoPlan | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** "Line 3, column 7" for a JSON syntax error, when it can be found. */
function jsonError(text: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const at = /position (\d+)/.exec(message);
  if (at) {
    const index = Number(at[1]);
    const before = text.slice(0, index).split('\n');
    return `The plan is not valid JSON: line ${before.length}, column ${before.at(-1)!.length + 1}.`;
  }
  return 'The plan is not valid JSON. Check commas, quotes and brackets.';
}

/** Where an issue is, in words. */
function where(path: readonly (string | number)[], input: unknown): string {
  const parts: string[] = [];
  let node: unknown = input;
  for (let i = 0; i < path.length; i++) {
    const key = path[i]!;
    const next = (node as Record<string | number, unknown> | undefined)?.[key];
    if (path[i - 1] === 'scenes' && typeof key === 'number') {
      const id = (next as { id?: unknown } | undefined)?.id;
      parts.push(`Scene ${key + 1}${typeof id === 'string' ? ` (${id})` : ''}`);
    } else if (path[i - 1] === 'layers' && typeof key === 'number') {
      const id = (next as { id?: unknown } | undefined)?.id;
      parts.push(`layer ${typeof id === 'string' ? `"${id}"` : key + 1}`);
    } else if (path[i - 1] === 'sfx' && typeof key === 'number')
      parts.push(`sound ${key + 1}`);
    else if (key !== 'scenes' && key !== 'layers' && key !== 'sfx')
      parts.push(`"${String(key)}"`);
    node = next;
  }
  return parts.length ? parts.join(', ') : 'The plan';
}
function say(issue: ZodIssue, input: unknown): string {
  const at = where(issue.path, input);
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined'
        ? `${at} is missing.`
        : `${at} should be ${issue.expected}, not ${issue.received}.`;
    case 'invalid_enum_value':
      return `${at} must be one of ${issue.options.join(', ')} (it is "${String(issue.received)}").`;
    case 'invalid_literal':
      return `${at} must be ${JSON.stringify(issue.expected)}.`;
    case 'too_small':
      return issue.type === 'array'
        ? `${at} needs at least ${issue.minimum}.`
        : issue.type === 'string'
          ? `${at} is empty.`
          : `${at} must be at least ${issue.minimum}.`;
    case 'too_big':
      return issue.type === 'array'
        ? `${at} has more than ${issue.maximum}.`
        : issue.type === 'string'
          ? `${at} is longer than ${issue.maximum} characters.`
          : `${at} must be at most ${issue.maximum}.`;
    case 'invalid_string':
      return `${at}: ${issue.message}.`;
    case 'invalid_union':
      return `${at} has a value the plan does not allow.`;
    default:
      return `${at}: ${issue.message}`;
  }
}

/** What one layer needs, by kind. */
function checkLayer(
  layer: VideoPlan['scenes'][number]['layers'][number],
  at: string,
  errors: string[],
  warnings: string[],
) {
  if (
    (layer.kind === 'title' ||
      layer.kind === 'text' ||
      layer.kind === 'bubble') &&
    !layer.text
  )
    errors.push(`${at} is a ${layer.kind} without "text".`);
  if (layer.kind === 'media' && !layer.mediaIntent)
    errors.push(`${at} is media without "mediaIntent" (what to look for).`);
  if (layer.poses?.length && layer.kind !== 'media')
    errors.push(`${at}: "poses" belong on a media layer.`);
  if (layer.kind === 'block') {
    const info = layer.block ? getBlock(layer.block) : undefined;
    if (!layer.block)
      errors.push(`${at} is a block layer without "block" (which block).`);
    else if (!info)
      errors.push(`${at}: there is no graphics block "${layer.block}".`);
    else {
      try {
        validateParams(info.params, layer.params ?? {});
      } catch (e) {
        errors.push(
          `${at}: block "${layer.block}": ${String((e as Error).message ?? e)}.`,
        );
      }
    }
  }
  if (layer.kind === 'kit' && !layer.kit)
    errors.push(`${at} is a kit layer without "kit" (which item).`);
  if (layer.kind === 'kit' && layer.kit && !isKitId(layer.kit))
    warnings.push(
      `${at}: the starter kit has no "${layer.kit}"; the layer is left out.`,
    );
  if (layer.kind === 'shape') {
    if (!layer.shape) errors.push(`${at} is a shape without "shape".`);
    else if (
      (layer.shape === 'line' || layer.shape === 'arrow') &&
      !(layer.from && layer.to)
    )
      errors.push(`${at}: a ${layer.shape} needs "from" and "to".`);
    else if (
      layer.shape === 'arc' &&
      (!layer.at ||
        layer.radius === undefined ||
        layer.startAngle === undefined ||
        layer.endAngle === undefined)
    )
      errors.push(
        `${at}: an arc needs "at" (centre), "radius", "startAngle" and "endAngle".`,
      );
    else if (
      layer.shape === 'protractor' &&
      (!layer.at || layer.radius === undefined)
    )
      errors.push(
        `${at}: a protractor needs "at" (centre of its base line) and "radius".`,
      );
  }
  if (layer.text && layer.text.length > 120)
    warnings.push(
      `${at}: ${layer.text.length} characters is a lot to read on screen.`,
    );
}

/** Checks a plan (JSON text or a value). */
export function validatePlan(input: unknown): PlanCheck {
  let value = input;
  if (typeof input === 'string') {
    if (input.length > 1_048_576)
      return fail(['The plan is larger than 1 MB.']);
    try {
      value = JSON.parse(input);
    } catch (error) {
      return fail([jsonError(input, error)]);
    }
  }
  const loose = videoPlanSchema.safeParse(value);
  if (!loose.success)
    return fail(dedupe(loose.error.issues.map((issue) => say(issue, value))));
  const warnings: string[] = [];
  const strict = strictPlanSchema.safeParse(value);
  if (!strict.success)
    for (const issue of strict.error.issues)
      if (issue.code === 'unrecognized_keys')
        warnings.push(
          `${where(issue.path, value)}: unknown field${issue.keys.length > 1 ? 's' : ''} ${issue.keys.map((k) => `"${k}"`).join(', ')} (ignored).`,
        );
  const plan = loose.data;
  const errors: string[] = [];
  const sceneIds = new Set<string>();
  let total = 0;
  plan.scenes.forEach((scene, index) => {
    const name = `Scene ${index + 1} (${scene.id})`;
    if (sceneIds.has(scene.id))
      errors.push(`${name}: another scene has this id.`);
    sceneIds.add(scene.id);
    if (!scene.layers.length && !scene.narration)
      errors.push(`${name} has no layers and no narration: nothing to show.`);
    const layerIds = new Set<string>();
    for (const layer of scene.layers) {
      const at = `${name}, layer "${layer.id}"`;
      if (layerIds.has(layer.id))
        errors.push(`${at}: another layer has this id.`);
      layerIds.add(layer.id);
      checkLayer(layer, at, errors, warnings);
    }
    for (const shot of [scene.camera, ...(scene.cameras ?? [])])
      if (shot?.target && !layerIds.has(shot.target))
        errors.push(
          `${name}: the camera target "${shot.target}" is not a layer of this scene.`,
        );
    if (plan.meta.build === 'timeline' && scene.transitionOut)
      warnings.push(
        `${name}: a timeline is one scene, so "transitionOut" is not used (fade layers in and out instead).`,
      );
    const duration = estimateSceneDuration(scene);
    total += duration;
    if (scene.narration && scene.durationHint) {
      const words = scene.narration.trim().split(/\s+/).length;
      if (words / scene.durationHint > 3.5)
        warnings.push(
          `${name}: ${words} words in ${scene.durationHint} s is fast; the scene will be longer than its hint.`,
        );
    }
  });
  const overlayIds = new Set<string>();
  for (const layer of plan.overlays) {
    const at = `Overlay "${layer.id}"`;
    if (overlayIds.has(layer.id))
      errors.push(`${at}: another overlay has this id.`);
    overlayIds.add(layer.id);
    checkLayer(layer, at, errors, warnings);
  }
  if (plan.narrationTrack && !plan.narrationTrack.query.trim())
    errors.push('"narrationTrack" needs a "query" (the narration file name).');
  if (total > PLAN_LIMITS.duration)
    errors.push(
      `The video would be about ${Math.round(total)} s; the limit is ${PLAN_LIMITS.duration} s.`,
    );
  return errors.length
    ? { ok: false, plan: null, errors, warnings }
    : { ok: true, plan, errors: [], warnings };
}
const dedupe = (list: string[]) => [...new Set(list)];
const fail = (errors: string[]): PlanCheck => ({
  ok: false,
  plan: null,
  errors,
  warnings: [],
});
