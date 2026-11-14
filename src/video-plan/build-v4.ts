// ROUND-C1 C1.2: the v4 fields on built layers. Each field maps to a
// command or capability the editor already has (docs/video-plan.md
// "Version 4" names them): SET_CLIP_FX (effects, filters, adjustments,
// colour grade), plugin:layer-blend:SET, plugin:chroma-key:SET,
// plugin:layer-masks:SET, SET_CLIP_TRANSITION, SET_PROPERTY keyframes,
// Creator presets (presetCommands), SET_CLIP_SPEED, SET_CLIP_REVERSED,
// SET_CLIP_TIMING (sourceIn), plugin:audio:SET (volume and fades), text
// properties (fontFamily, letterSpacing), Fit (scale and position),
// GROUP, the `locked` property, SET_LAYER_NAME and SET_LAYER_CODE (a new
// graphic). Nothing here changes src/core. DOM-free.
import type { Command, EditorEngine } from '../core';
import { codeRecord } from '../code-layer/layer';
import { registerLayerBlend } from '../blend/commands';
import { registerChromaKey } from '../chroma/commands';
import { registerLayerMasks } from '../masks/commands';
import { defaultAudioSettings, type AudioSettings } from '../audio/settings';
import { validateParams } from '../blocks/params';
import { blendIdOf } from './validate-v4';
import { getItem, sanitize } from '../fx';
import type { PlanLayer } from './schema';
import type { DefResult } from './defs';

type Layer = {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
  readonly transform: Record<string, { value: unknown }>;
  readonly properties: Record<string, { value: unknown } | undefined>;
};
type Clip = {
  readonly id: string;
  readonly startTime: number;
  readonly duration: number;
  readonly sourceIn: number;
  readonly sourceOut: number;
  readonly metadata: Record<string, unknown>;
};
export interface V4Context {
  readonly engine: EditorEngine;
  readonly compositionId: string;
  readonly width: number;
  readonly height: number;
  readonly layer: Layer;
  readonly clip: Clip | null;
  readonly plan: PlanLayer;
  /** Seconds of the layer's source media, when known. */
  readonly sourceSeconds?: number | undefined;
  readonly def?: DefResult | undefined;
  readonly defParams?: Readonly<Record<string, unknown>> | undefined;
  /** A Creator preset by id (from the Project's library), when one exists. */
  readonly preset?:
    ((id: string) => { name: string; preset: unknown } | undefined) | undefined;
  readonly presetCommands?:
    | ((
        layerId: string,
        apply: {
          id: string;
          name: string;
          preset: unknown;
          params: Record<string, unknown>;
        },
      ) => Command[])
    | undefined;
  readonly warn: (text: string) => void;
}
const num = (value: number) => ({
  type: 'number' as const,
  value,
  animated: false,
  keyframes: [] as [],
  constraints: [],
});
const str = (value: string) => ({
  type: 'string' as const,
  value,
  animated: false,
  keyframes: [] as [],
  constraints: [],
});
const bool = (value: boolean) => ({
  type: 'boolean' as const,
  value,
  animated: false,
  keyframes: [] as [],
  constraints: [],
});
const prop = (c: V4Context, key: string, property: unknown): Command =>
  ({
    type: 'SET_PROPERTY',
    compositionId: c.compositionId,
    layerId: c.layer.id,
    target: { kind: 'property', key },
    property,
  }) as unknown as Command;
const transform = (c: V4Context, key: string, property: unknown): Command =>
  ({
    type: 'SET_PROPERTY',
    compositionId: c.compositionId,
    layerId: c.layer.id,
    target: { kind: 'transform', key },
    property,
  }) as unknown as Command;

/** The commands for one layer's v4 fields, in one list (one transaction). */
export function v4Commands(c: V4Context): Command[] {
  const p = c.plan;
  const out: Command[] = [];
  const at = (s: string) => `Layer "${p.id}": ${s}`;
  if (p.name)
    out.push({
      type: 'SET_LAYER_NAME',
      compositionId: c.compositionId,
      layerId: c.layer.id,
      name: p.name,
    } as unknown as Command);
  // A new graphic of the plan: its code record (re-baked by the editor).
  if (c.def?.ok && c.def.meta && c.def.item?.type === 'motion') {
    const data = c.def.item.data;
    let params: Record<string, unknown> = {};
    try {
      params = {
        ...validateParams(c.def.params ?? [], (c.defParams ?? {}) as never),
      };
    } catch (e) {
      c.warn(at(`settings of the new graphic: ${(e as Error).message}`));
      params = { ...validateParams(c.def.params ?? [], {}) };
    }
    const duration = Math.max(0.1, c.clip?.duration ?? c.layer.duration);
    out.push({
      type: 'SET_LAYER_CODE',
      compositionId: c.compositionId,
      layerId: c.layer.id,
      code: codeRecord({
        tier: data.tier,
        source: data.source,
        meta: { ...c.def.meta, duration },
        params,
        templateId: `plan-graphics-${c.def.id}`,
        name: c.def.name,
      }),
    } as unknown as Command);
  }
  // Effects, filters, adjustments and the colour grade: one effect stack.
  const clean = (id: string, params: Record<string, unknown>) => {
    const def = getItem(id);
    return def
      ? {
          ...sanitize(
            (def as unknown as { params: never }).params,
            params as never,
          ),
        }
      : { ...params };
  };
  const stack = [
    ...(p.fx ?? []).map((f) => ({
      id: f.id,
      params: clean(f.id, { ...(f.params ?? {}) }),
    })),
  ];
  const g = p.grade;
  if (g)
    for (const [key, id] of [
      ['exposure', 'adjust.exposure'],
      ['contrast', 'adjust.contrast'],
      ['saturation', 'adjust.saturation'],
      ['temperature', 'adjust.temperature'],
    ] as const)
      if (g[key] !== undefined && g[key] !== 0)
        stack.push({ id, params: clean(id, { amount: g[key]! / 100 }) });
  if (stack.length && c.clip)
    out.push({
      type: 'SET_CLIP_FX',
      compositionId: c.compositionId,
      clipId: c.clip.id,
      fx: { version: 1, stack: stack.slice(0, 16) },
    } as unknown as Command);
  if (p.blend) {
    const id = blendIdOf(p.blend);
    if (id) {
      registerLayerBlend(c.engine);
      out.push({
        type: 'plugin:layer-blend:SET',
        input: {
          compositionId: c.compositionId,
          layerId: c.layer.id,
          blendMode: id,
        },
      } as unknown as Command);
    }
  }
  if (p.chromaKey && (c.layer.type === 'image' || c.layer.type === 'video')) {
    registerChromaKey(c.engine);
    out.push({
      type: 'plugin:chroma-key:SET',
      input: {
        compositionId: c.compositionId,
        layerId: c.layer.id,
        chromaKey: { ...p.chromaKey, color: p.chromaKey.color.toLowerCase() },
      },
    } as unknown as Command);
  }
  if (p.mask) {
    const w = Number(c.layer.properties.width?.value) || c.width;
    const h = Number(c.layer.properties.height?.value) || c.height;
    const m = p.mask;
    registerLayerMasks(c.engine);
    out.push({
      type: 'plugin:layer-masks:SET',
      input: {
        compositionId: c.compositionId,
        layerId: c.layer.id,
        masks: [
          {
            id: `plan-mask-${c.layer.id}`.slice(0, 120),
            type: m.shape,
            geometry: [
              [(m.x / 100) * w, (m.y / 100) * h],
              [((m.x + m.width) / 100) * w, ((m.y + m.height) / 100) * h],
            ],
            ...(m.feather !== undefined ? { feather: m.feather } : {}),
            ...(m.invert ? { invert: true } : {}),
          },
        ],
      },
    } as unknown as Command);
  }
  // Speed, reverse and the cut of the source (footage, music, graphics).
  if (c.clip) {
    const speed = p.speed ?? 1;
    if (p.sourceIn !== undefined && p.sourceIn > 0) {
      const room = c.sourceSeconds ? c.sourceSeconds - p.sourceIn : Infinity;
      if (room <= 0.1)
        c.warn(at(`"sourceIn" is past the end of its media; not cut.`));
      else {
        const duration = Math.min(c.clip.duration, room / speed);
        out.push({
          type: 'SET_CLIP_TIMING',
          compositionId: c.compositionId,
          clipId: c.clip.id,
          startTime: c.clip.startTime,
          duration,
          sourceIn: p.sourceIn,
          sourceOut: p.sourceIn + duration * speed,
        } as unknown as Command);
      }
    }
    if (p.speed !== undefined && p.speed !== 1)
      out.push({
        type: 'SET_CLIP_SPEED',
        compositionId: c.compositionId,
        clipId: c.clip.id,
        speed: p.speed,
      } as unknown as Command);
    if (p.reverse)
      out.push({
        type: 'SET_CLIP_REVERSED',
        compositionId: c.compositionId,
        clipId: c.clip.id,
        reversed: true,
      } as unknown as Command);
    if (p.transitionIn)
      out.push({
        type: 'SET_CLIP_TRANSITION',
        compositionId: c.compositionId,
        clipId: c.clip.id,
        transition: {
          type: p.transitionIn.type,
          duration: p.transitionIn.duration ?? 0.6,
        },
      } as unknown as Command);
    if (
      p.volume !== undefined ||
      p.fadeIn !== undefined ||
      p.fadeOut !== undefined
    ) {
      const base =
        (c.clip.metadata.audio as AudioSettings | undefined) ??
        defaultAudioSettings();
      out.push({
        type: 'plugin:audio:SET',
        input: {
          compositionId: c.compositionId,
          clipId: c.clip.id,
          settings: {
            ...base,
            ...(p.volume !== undefined ? { volume: p.volume } : {}),
            ...(p.fadeIn !== undefined ? { fadeIn: p.fadeIn } : {}),
            ...(p.fadeOut !== undefined ? { fadeOut: p.fadeOut } : {}),
          },
        },
      } as unknown as Command);
    }
  }
  if (c.layer.type === 'text') {
    if (p.font) out.push(prop(c, 'fontFamily', str(p.font)));
    if (p.letterSpacing !== undefined)
      out.push(prop(c, 'letterSpacing', num(p.letterSpacing)));
  }
  if (p.fit && (c.layer.type === 'image' || c.layer.type === 'video')) {
    const mw = Number(c.layer.properties.width?.value) || 0;
    const mh = Number(c.layer.properties.height?.value) || 0;
    if (mw > 0 && mh > 0) {
      const sx = c.width / mw,
        sy = c.height / mh;
      const scale: [number, number] =
        p.fit === 'stretch'
          ? [sx, sy]
          : p.fit === 'fit'
            ? [Math.min(sx, sy), Math.min(sx, sy)]
            : [Math.max(sx, sy), Math.max(sx, sy)];
      out.push(
        transform(c, 'scale', {
          type: 'vector2',
          value: scale,
          animated: false,
          keyframes: [],
          constraints: [],
        }),
      );
      out.push(
        transform(c, 'position', {
          type: 'vector2',
          value: [
            (c.width - mw * scale[0]) / 2,
            (c.height - mh * scale[1]) / 2,
          ],
          animated: false,
          keyframes: [],
          constraints: [],
        }),
      );
    }
  }
  out.push(...keyframeCommands(c));
  if (p.preset) {
    const found = c.preset?.(p.preset.id);
    if (!found || !c.presetCommands)
      c.warn(
        at(
          `there is no Creator preset "${p.preset.id}" in this Project; left out.`,
        ),
      );
    else
      try {
        out.push(
          ...c.presetCommands(c.layer.id, {
            id: p.preset.id,
            name: found.name,
            preset: found.preset,
            params: { ...(p.preset.controls ?? {}) },
          }),
        );
      } catch (e) {
        c.warn(at((e as Error).message));
      }
  }
  if (p.locked) out.push(prop(c, 'locked', bool(true)));
  return out;
}

/** Plan keyframes (seconds from the layer's start) as transform keyframes. */
function keyframeCommands(c: V4Context): Command[] {
  const keys = c.plan.keyframes ?? [];
  if (!keys.length) return [];
  const start = c.clip?.startTime ?? c.layer.startTime;
  const out: Command[] = [];
  const by = (p: string) =>
    keys.filter((k) => k.property === p).sort((a, b) => a.at - b.at);
  const w = (Number(c.layer.properties.width?.value) || 0) * scaleOf(c);
  const h = (Number(c.layer.properties.height?.value) || 0) * scaleOf(c);
  const pos = c.layer.transform.position?.value as [number, number] | undefined;
  const xs = by('x'),
    ys = by('y');
  if (xs.length || ys.length) {
    const times = [...new Set([...xs, ...ys].map((k) => k.at))].sort(
      (a, b) => a - b,
    );
    const valueAt = (
      list: typeof xs,
      t: number,
      fallback: number,
      side: number,
      span: number,
    ) => {
      const exact = list.find((k) => k.at === t);
      if (exact) return (exact.value / 100) * span - side / 2;
      const before = [...list].reverse().find((k) => k.at < t);
      return before ? (before.value / 100) * span - side / 2 : fallback;
    };
    out.push(
      transform(c, 'position', {
        type: 'vector2',
        value: [
          valueAt(xs, times[0]!, pos?.[0] ?? 0, w, c.width),
          valueAt(ys, times[0]!, pos?.[1] ?? 0, h, c.height),
        ],
        animated: true,
        keyframes: times.map((t) => ({
          time: start + t,
          value: [
            valueAt(xs, t, pos?.[0] ?? 0, w, c.width),
            valueAt(ys, t, pos?.[1] ?? 0, h, c.height),
          ],
          easing:
            [...xs, ...ys].find((k) => k.at === t)?.easing ?? 'ease-in-out',
        })),
        constraints: [],
      }),
    );
  }
  const scalar = (p: 'scale' | 'rotation' | 'opacity') => {
    const list = by(p);
    if (!list.length) return;
    const vec = p === 'scale';
    const v = (x: number) => (vec ? [x, x] : x);
    out.push(
      transform(c, p, {
        type: vec ? 'vector2' : 'number',
        value: v(list[0]!.value),
        animated: true,
        keyframes: list.map((k) => ({
          time: start + k.at,
          value: v(k.value),
          easing: k.easing ?? 'ease-in-out',
        })),
        constraints: [],
      }),
    );
  };
  scalar('scale');
  scalar('rotation');
  scalar('opacity');
  return out;
}
const scaleOf = (c: V4Context) => {
  const s = c.layer.transform.scale?.value;
  return Array.isArray(s) && typeof s[0] === 'number' ? (s[0] as number) : 1;
};
