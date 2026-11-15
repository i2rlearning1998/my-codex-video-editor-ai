// ROUND-C1 C1.5: "change this graphic" and "make a new one here" in AI mode.
// A model writes (or rewrites) one new graphic; it is checked exactly like
// a plan's def (compiler or pack policy) with one repair call, and becomes
// ONE proposal: a new code layer at the playhead, or the selected graphic's
// code replaced with its controller values kept where the setting still
// exists (same controllers). Apply is one undo step. Offline the caller
// says plainly that this needs the real model.
import type { EditorCommand } from '../core';
import type { PlatformConfig } from '../platform-config';
import { codeLayerCommands, codeRecord } from '../code-layer/layer';

export const GRAPHIC_ASK =
  /\b(new graphic|make (a|another) (new )?(graphic|animation|one here)|draw (me )?(a|an)\b|redraw|change (the|this) (graphic|drawing|animation)'?s? (look|drawing|shape|style)|rewrite (the|this) graphic)\b|नया ग्राफ़िक|ग्राफ़िक बदल/iu;
interface Scene {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly tracks: readonly unknown[];
}
interface CodeLayerLike {
  readonly id: string;
  readonly name: string;
  readonly code?:
    | {
        tier: 'B' | 'C';
        source: string;
        meta: Record<string, unknown>;
        params: Record<string, unknown>;
        templateId?: string;
      }
    | undefined;
}
export interface GraphicEditInput {
  readonly config: PlatformConfig;
  readonly scene: Scene;
  /** The selected graphic to change, or null to make a new one. */
  readonly layer: CodeLayerLike | null;
  readonly text: string;
  readonly time: number;
  /** One model call: system prompt and the person's ask; the JSON answer. */
  readonly ask: (system: string, user: string) => Promise<string>;
  readonly ids?: { layer: string; clip: string; track: string };
}
export type GraphicEdit =
  | {
      readonly ok: true;
      readonly commands: readonly EditorCommand[];
      readonly label: string;
      readonly name: string;
      readonly layerId: string;
    }
  | { readonly ok: false; readonly errors: readonly string[] };

const extract = (text: string): unknown => {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('The answer is not JSON.');
  return JSON.parse(text.slice(s, e + 1));
};
export async function graphicEdit(x: GraphicEditInput): Promise<GraphicEdit> {
  const { checkDef } = await import('../video-plan/defs');
  const guide =
    x.config.director.authoring.guide || 'Tier A before Tier B before Tier C.';
  const now = x.layer?.code;
  const system = [
    'You are Director. TASK: write ONE new graphic for the editor as JSON only:',
    '{"def": {"id": "<a-z0-9->", "tier": "B" | "C", "source": "<code>", "meta"?: {...}, "summary": "<one line>"}}',
    'Tier B: one parenthesized block object with id, version, name, category, defaultDuration, params and render(ctx, t, size, params, seed).',
    'Tier C: export default { meta: {id, name, version, category, duration, params}, init(...), renderFrame(...) }.',
    'Draw only inside size.width and size.height; draw something from the first frame.',
    guide,
    now
      ? `CHANGE this graphic and keep its setting names where they still make sense (they are the person's controllers). Its code:\n${now.source.slice(0, 20000)}`
      : `MAKE a new graphic for a ${x.scene.width} x ${x.scene.height} canvas.`,
  ].join('\n');
  let errors: string[] = [];
  let user = x.text;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: unknown;
    try {
      raw = extract(await x.ask(system, user));
    } catch (e) {
      errors = [(e as Error).message];
      user = `${x.text}\nYour last answer failed: ${errors.join(' ')} Answer with the JSON only.`;
      continue;
    }
    const def = (
      raw as {
        def?: {
          id: string;
          tier: 'B' | 'C';
          source: string;
          meta?: Record<string, unknown>;
        };
      }
    ).def;
    if (
      !def ||
      typeof def.source !== 'string' ||
      (def.tier !== 'B' && def.tier !== 'C')
    ) {
      errors = ['The answer has no "def" with a tier and a source.'];
    } else {
      const checked = checkDef({
        id: String(def.id ?? 'graphic'),
        tier: def.tier,
        source: def.source,
        ...(def.meta ? { meta: def.meta } : {}),
      });
      if (checked.ok && checked.item?.type === 'motion') {
        const params: Record<string, unknown> = {};
        for (const p of checked.params ?? [])
          params[p.name] = (p as { default: unknown }).default;
        // Same controllers: a value the person set is kept when the setting exists.
        if (now)
          for (const p of checked.params ?? [])
            if (p.name in now.params) params[p.name] = now.params[p.name];
        const meta = { ...checked.meta };
        const name = checked.name ?? def.id;
        if (now && x.layer) {
          const duration =
            typeof now.meta.duration === 'number'
              ? now.meta.duration
              : checked.duration;
          return {
            ok: true,
            name,
            layerId: x.layer.id,
            label: 'Change graphic',
            commands: [
              {
                type: 'SET_LAYER_CODE',
                compositionId: x.scene.id,
                layerId: x.layer.id,
                code: codeRecord({
                  tier: def.tier,
                  source: def.source,
                  meta: { ...meta, duration },
                  params,
                  templateId: `plan-graphics-${checked.id}`,
                }),
              } as EditorCommand,
            ],
          };
        }
        const built = codeLayerCommands(
          x.scene as never,
          {
            tier: def.tier,
            source: def.source,
            meta,
            params,
            templateId: `plan-graphics-${checked.id}`,
            name,
          },
          x.time,
          x.ids,
        );
        return {
          ok: true,
          name,
          layerId: built.layerId,
          label: 'New graphic',
          commands: built.commands as EditorCommand[],
        };
      }
      errors = [...checked.errors];
    }
    user = `${x.text}\nYour last graphic failed these checks:\n${errors.map((e) => `- ${e}`).join('\n')}\nFix exactly these and answer with the JSON only.`;
  }
  return { ok: false, errors };
}
