import { z } from 'zod';
import {
  compositionSpecSchema as authoredStructureSchema,
  resolvedSpecSchema,
  LIMITS,
} from './schema';
import type { CompositionSpec, Scalar } from './schema';
import { assertBoundedJson, canonicalJson, frozen } from './json';
import { blockData, fxData } from './catalogs/data';
import { compileBlock } from './vendor/blocks/sandbox/compile';
import { validateParams } from './vendor/blocks/params';
import type { ParamSpec } from './vendor/blocks/types';
export interface SpecIssue {
  path: string;
  message: string;
}
export type Validation =
  | {
      ok: true;
      spec: CompositionSpec;
      bindings: ReadonlyArray<{ path: string; param: string }>;
      cacheKey: string;
    }
  | { ok: false; errors: SpecIssue[] };
export const CATALOG_VERSION =
  'spec1-main9362645-blocks6a74c95-fx98a95f7-policy1';
const blocks = frozen(blockData),
  fx = frozen(fxData);
const pointer = (path: readonly (string | number)[]) =>
  '/' +
  path
    .map((v) => String(v).replaceAll('~', '~0').replaceAll('/', '~1'))
    .join('/');
export function validateSpec(
  input: unknown,
  overrides: Record<string, Scalar> = {},
): Validation {
  const errors: SpecIssue[] = [];
  const add = (path: (string | number)[], message: string) => {
    if (errors.length < 50) errors.push({ path: pointer(path), message });
  };
  try {
    if (typeof input === 'string') {
      if (
        input.length > LIMITS.bytes ||
        new TextEncoder().encode(input).length > LIMITS.bytes
      )
        throw Error('Document exceeds 1 MiB UTF-8 limit');
      input = JSON.parse(input);
    }
    assertBoundedJson(input);
    assertBoundedJson(overrides);
    const authored = authoredStructureSchema.safeParse(input);
    if (!authored.success)
      return {
        ok: false,
        errors: authored.error.issues
          .slice(0, 50)
          .map((i) => ({ path: pointer(i.path), message: i.message })),
      };
    const values = validateParams(authored.data.parameters, overrides);
    const bindings: { path: string; param: string }[] = [];
    function expand(v: unknown, path: (string | number)[]): unknown {
      if (Array.isArray(v))
        return v.map((child, i) => expand(child, [...path, i]));
      if (v && typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        if (Object.keys(obj).length === 1 && typeof obj.$param === 'string') {
          if (!Object.hasOwn(values, obj.$param)) {
            add(path, 'Unknown editable parameter: ' + obj.$param);
            return undefined;
          }
          bindings.push({ path: pointer(path), param: obj.$param });
          return values[obj.$param];
        }
        return Object.fromEntries(
          Object.entries(obj).map(([k, child]) => [
            k,
            expand(child, [...path, k]),
          ]),
        );
      }
      return v;
    }
    const resolved = resolvedSpecSchema.safeParse(expand(authored.data, []));
    if (!resolved.success) {
      for (const issue of resolved.error.issues) add(issue.path, issue.message);
      return { ok: false, errors };
    }
    const spec = resolved.data;
    const unique = (ids: string[], path: (string | number)[]) => {
      const seen = new Set<string>();
      ids.forEach((id, i) => {
        if (seen.has(id)) add([...path, i, 'id'], 'Duplicate id: ' + id);
        seen.add(id);
      });
    };
    unique(
      spec.scenes.map((s) => s.id),
      ['scenes'],
    );
    unique(
      spec.assets.map((a) => a.id),
      ['assets'],
    );
    unique(
      spec.blocks.map((b) => b.id),
      ['blocks'],
    );
    const registry = new Map<
      string,
      { version: string; params: readonly ParamSpec[] }
    >(
      blocks.map((b) => [
        b.id,
        { version: b.version, params: b.params as readonly ParamSpec[] },
      ]),
    );
    for (const [i, b] of spec.blocks.entries()) {
      if (registry.has(b.id)) {
        add(['blocks', i, 'id'], 'Block id collides with a registered block');
        continue;
      }
      const result = compileBlock(b.source);
      if (!result.ok) {
        add(['blocks', i, 'source'], result.error);
        continue;
      }
      if (result.value.info.id !== b.id)
        add(['blocks', i, 'id'], 'Block id must equal compiled metadata id');
      registry.set(b.id, {
        version: result.value.info.version,
        params: result.value.info.params,
      });
    }
    let duration = 0,
      count = 0;
    for (const [si, scene] of spec.scenes.entries()) {
      duration += scene.duration;
      count += scene.items.length;
      const base = ['scenes', si];
      unique(
        scene.items.map((i) => i.id),
        [...base, 'items'],
      );
      unique(
        scene.cameraMoves.map((m) => m.id),
        [...base, 'cameraMoves'],
      );
      let cameraEnd = 0;
      for (const [mi, move] of scene.cameraMoves.entries()) {
        if (move.start < cameraEnd - 1e-9)
          add(
            [...base, 'cameraMoves', mi, 'start'],
            'Camera moves must be ordered and non-overlapping',
          );
        cameraEnd = move.start + move.duration;
        if (cameraEnd > scene.duration + 1e-9)
          add(
            [...base, 'cameraMoves', mi],
            'Camera move exceeds scene duration',
          );
        if (move.from.shake.seed !== move.to.shake.seed)
          add(
            [...base, 'cameraMoves', mi],
            'Shake seed must remain constant during a move',
          );
      }
      if (scene.transition) {
        const next = spec.scenes[si + 1];
        if (!next)
          add(
            [...base, 'transition'],
            'Final scene cannot have an outgoing transition',
          );
        else if (
          scene.transition.duration >
          Math.min(scene.duration, next.duration) / 2
        )
          add(
            [...base, 'transition', 'duration'],
            'Transition exceeds half of either adjacent scene',
          );
      }
      for (const [ii, item] of scene.items.entries()) {
        const p = [...base, 'items', ii];
        if (item.start + item.duration > scene.duration + 1e-9)
          add(p, 'Item exceeds scene duration');
        if ('slot' in item) {
          const asset = spec.assets.find((a) => a.id === item.slot);
          if (!asset) add([...p, 'slot'], 'Unknown asset slot: ' + item.slot);
          else if (
            (item.kind === 'image-placeholder' && asset.kind !== 'image') ||
            (item.kind === 'audio-slot' && asset.kind !== 'audio') ||
            (item.kind === 'media-slot' && asset.kind === 'audio')
          )
            add([...p, 'slot'], 'Asset kind is incompatible with item');
        }
        if (item.kind === 'audio-slot' && item.fx.length)
          add([...p, 'fx'], 'Pixel FX cannot target an audio slot');
        if (item.kind === 'code-block') {
          const definition = registry.get(item.blockId);
          if (!definition)
            add([...p, 'blockId'], 'Unknown block reference: ' + item.blockId);
          else {
            if (item.blockVersion !== definition.version)
              add(
                [...p, 'blockVersion'],
                'Block version does not match catalog/source',
              );
            try {
              item.params = {
                ...validateParams(definition.params, item.params),
              };
            } catch (e) {
              add([...p, 'params'], String(e));
            }
          }
        }
        for (const [fi, effect] of item.fx.entries()) {
          const definition = fx.find((d) => d.id === effect.id);
          if (!definition) {
            add([...p, 'fx', fi, 'id'], 'Unknown FX library id: ' + effect.id);
            continue;
          }
          const raw = effect.params as Record<string, Scalar>,
            out: Record<string, Scalar> = {};
          for (const key of Object.keys(raw))
            if (!definition.params.some((v) => v.name === key))
              add([...p, 'fx', fi, 'params', key], 'Unknown FX parameter');
          for (const parameter of definition.params) {
            const v = raw[parameter.name] ?? parameter.default;
            const valid =
              parameter.type === 'number'
                ? typeof v === 'number' &&
                  v >= parameter.min &&
                  v <= parameter.max
                : parameter.type === 'boolean'
                  ? typeof v === 'boolean'
                  : parameter.type === 'color'
                    ? typeof v === 'string' && /^#[\da-f]{6}$/i.test(v)
                    : typeof v === 'string' &&
                      'options' in parameter &&
                      (parameter.options as readonly string[]).includes(v);
            if (!valid)
              add(
                [...p, 'fx', fi, 'params', parameter.name],
                'Invalid FX parameter value',
              );
            out[parameter.name] = v;
          }
          effect.params = out;
        }
      }
    }
    if (duration > LIMITS.duration + 1e-9)
      add(['scenes'], 'Total duration exceeds 180 seconds');
    if (count > LIMITS.items) add(['scenes'], 'Total item count exceeds 128');
    if (errors.length) return { ok: false, errors };
    // Cache identity includes authored bindings, defaults, explicit overrides and
    // pinned policy/catalog versions; array order is meaningful, object key order is not.
    const cacheKey =
      CATALOG_VERSION + ':' + canonicalJson({ spec: authored.data, values });
    return {
      ok: true,
      spec: frozen(spec) as CompositionSpec,
      bindings: frozen(bindings),
      cacheKey,
    };
  } catch (e) {
    return {
      ok: false,
      errors: [
        {
          path: '/',
          message:
            e instanceof z.ZodError
              ? e.message
              : e instanceof Error
                ? e.message
                : String(e),
        },
      ],
    };
  }
}
export function formatIssues(result: Validation): string {
  return result.ok
    ? 'Composition Spec v1 is valid'
    : result.errors.map((i) => `${i.path}: ${i.message}`).join('\n');
}

/** Complete Zod entry point, including bounded input, references and source policy. */
export const compositionSpecSchema = z.unknown().transform((input, ctx) => {
  const result = validateSpec(input);
  if (result.ok) return result.spec;
  for (const error of result.errors)
    ctx.addIssue({
      code: 'custom',
      path:
        error.path === '/'
          ? []
          : error.path
              .slice(1)
              .split('/')
              .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~')),
      message: error.message,
    });
  return z.NEVER;
});
