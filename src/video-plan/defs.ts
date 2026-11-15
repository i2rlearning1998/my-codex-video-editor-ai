// ROUND-C1 C1.2 and C1.5: custom graphics defined inside a plan
// (`defs.blocks`). Each def is checked exactly like a Creator Pack motion
// item: Tier B with the block compiler (literal metadata, the drawing
// policy), Tier C with the pack checks and policy (init and renderFrame,
// a duration, params). An accepted def becomes (1) the code record of the
// layers that use it, and (2) a Creator Pack item (motion, tier B or C)
// saved in the Video's AI library and the Project's graphics kit. This
// module loads the TypeScript parser: import it lazily.
import { compileBlock } from '../blocks/sandbox/compile';
import { blockMeta } from '../code-layer/meta';
import { checkPack } from '../creator-pack/check';
import type { CreatorItem } from '../creator-pack/schemas';
import type { ParamSpec } from '../blocks/types';
import { FX_IDS } from './validate-v4';
import { PLAN_DEF_LIMITS, type PlanDef } from './schema';

export interface DefResult {
  readonly id: string;
  readonly ok: boolean;
  readonly errors: readonly string[];
  /** The code layer's meta (common shape) and default params. */
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly params?: readonly ParamSpec[];
  readonly name?: string;
  readonly duration?: number;
  /** The Creator Pack item saved to the AI library. */
  readonly item?: CreatorItem;
}

const PACK = {
  id: 'plan-graphics',
  name: { en: 'New graphics', hi: 'नए ग्राफ़िक' },
  version: 1,
  author: 'ai' as const,
  createdWith: 'api' as const,
};
const paramNames = (params: readonly { name: string }[]) => {
  const seen = new Set<string>();
  const dup = params.find((p) =>
    seen.has(p.name) ? true : (seen.add(p.name), false),
  );
  return dup?.name;
};
const asControls = (params: readonly ParamSpec[]) =>
  params.map((p) => ({ ...p, label: { en: p.label } }));
const plainError = (at: string, e: string) => `${at}: ${e.replace(/\.$/, '')}.`;

/** Checks one def; never throws. */
export function checkDef(def: PlanDef): DefResult {
  const at = `New graphic "${def.id}"`;
  const fail = (...errors: string[]): DefResult => ({
    id: def.id,
    ok: false,
    errors,
  });
  if (def.source.length > PLAN_DEF_LIMITS.source)
    return fail(
      `${at}: the code is longer than ${PLAN_DEF_LIMITS.source} characters.`,
    );
  let data: { tier: 'B' | 'C'; source: string; meta: Record<string, unknown> };
  let params: ParamSpec[];
  let name: string;
  let duration: number;
  let meta: Record<string, unknown>;
  if (def.tier === 'B') {
    const compiled = compileBlock(def.source);
    if (!compiled.ok) return fail(plainError(at, compiled.error));
    const info = compiled.value.info;
    if (info.id !== def.id)
      return fail(
        `${at}: the code says its id is "${info.id}"; it must be "${def.id}".`,
      );
    params = [...info.params];
    name = info.name;
    duration = info.defaultDuration;
    meta = blockMeta(info) as unknown as Record<string, unknown>;
    data = {
      tier: 'B',
      source: def.source,
      meta: {
        id: info.id,
        name: info.name,
        version: info.version,
        category: info.category,
        defaultDuration: info.defaultDuration,
        params: asControls(info.params),
        ...(info.fps ? { fps: info.fps } : {}),
        ...(info.thumbnailTime !== undefined
          ? { thumbnailTime: info.thumbnailTime }
          : {}),
      },
    };
  } else {
    const m = (def.meta ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(m.params) ? (m.params as ParamSpec[]) : [];
    params = raw.map((p) => ({
      ...p,
      label:
        typeof p.label === 'string'
          ? p.label
          : ((p.label as { en?: string } | undefined)?.en ?? p.name),
    })) as ParamSpec[];
    name = typeof m.name === 'string' ? m.name : def.id;
    duration = typeof m.duration === 'number' ? m.duration : NaN;
    if (!Number.isFinite(duration))
      return fail(`${at}: a Tier C graphic needs "meta.duration" (seconds).`);
    meta = {
      id: def.id,
      name,
      version: typeof m.version === 'string' ? m.version : '1.0.0',
      category: typeof m.category === 'string' ? m.category : 'AI',
      duration,
      params,
      seekable: m.seekable !== false,
      keepFrame: m.keepFrame === true,
      libs: Array.isArray(m.libs) ? m.libs : [],
      thumbnailTime:
        typeof m.thumbnailTime === 'number' ? m.thumbnailTime : duration / 2,
    };
    data = {
      tier: 'C',
      source: def.source,
      meta: { ...meta, params: asControls(params) },
    };
  }
  if (params.length > PLAN_DEF_LIMITS.params)
    return fail(
      `${at}: it has ${params.length} settings; at most ${PLAN_DEF_LIMITS.params}.`,
    );
  const dup = paramNames(params);
  if (dup) return fail(`${at}: two settings are both called "${dup}".`);
  const pack = {
    format: 'creator-pack',
    version: 1,
    pack: PACK,
    items: [
      {
        id: def.id,
        type: 'motion',
        name: { en: name.slice(0, 80) },
        tags: ['ai-graphic'],
        data,
      },
    ],
  };
  const checked = checkPack(pack, { fxCatalog: FX_IDS, knownLibraryIds: [] });
  const result = checked.items[0];
  if (!checked.ok || !result || result.status === 'rejected' || !result.item)
    return fail(
      ...(result?.reasons.length ? result.reasons : checked.reasons).map((r) =>
        plainError(at, r),
      ),
    );
  return {
    id: def.id,
    ok: true,
    errors: [],
    meta,
    params,
    name,
    duration,
    item: result.item,
  };
}
/** Checks every def of a plan. */
export function checkDefs(defs: readonly PlanDef[]): {
  readonly ok: boolean;
  readonly results: readonly DefResult[];
  readonly errors: readonly string[];
} {
  const results = defs.map(checkDef);
  const errors = results.flatMap((r) => r.errors);
  return { ok: !errors.length, results, errors };
}
