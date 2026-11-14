// ROUND-B: the offline proposal maker. With no model (the offline mock),
// Director still turns the common asks into real semantic commands: change
// text, bigger or smaller, recolour, remove, hide or show, replace a
// picture, fit, a code animation's own controls, the scene's background.
// A proposal is only data: nothing changes until it is applied as ONE
// transaction. A hand-edited layer is never touched without asking; a
// locked layer is refused. Pure.
import type {
  Composition,
  DeepReadonly,
  EditorCommand,
  Layer,
  Project,
} from '../core';
import { codeRecord } from '../code-layer/layer';
import {
  eachLayer,
  findLayer,
  hashLayer,
  isLocked,
  kindOf,
  stringOf,
} from './canvas-read';

type L = DeepReadonly<Layer>;
type Scene = DeepReadonly<Composition>;

export interface Proposal {
  readonly id: string;
  /** One sentence the person reads. */
  readonly summary: string;
  /** The undo step's name. */
  readonly label: string;
  readonly commands: readonly EditorCommand[];
  /** Layers the commands change (highlighted after Apply). */
  readonly layerIds: readonly string[];
  readonly sceneId: string;
  readonly credits: number;
}
export type ProposeResult =
  | { readonly kind: 'proposal'; readonly proposal: Proposal }
  /** Layers the person changed by hand: ask before touching them. */
  | {
      readonly kind: 'ask-hand-edited';
      readonly layers: readonly { id: string; name: string }[];
    }
  | { readonly kind: 'locked'; readonly name: string }
  | { readonly kind: 'gone' }
  /** Not something this maker can do: say so and offer these instead. */
  | { readonly kind: 'cannot'; readonly alternatives: readonly string[] };

export interface ProposeInput {
  readonly project: DeepReadonly<Project>;
  readonly sceneId: string;
  readonly selectedIds: readonly string[];
  readonly text: string;
  /** Layer hashes as Director last left them. */
  readonly touched: Readonly<Record<string, string>>;
  /** Hand-edited layers the person already allowed in this ask. */
  readonly allowed?: readonly string[];
  /** A file to place (a drop, or "replace with ..."). */
  readonly assetId?: string;
  readonly lang: 'en' | 'hi';
  /** Fit / fill commands for a picture or video (the editor's own). */
  readonly fit?: (
    sceneId: string,
    layerId: string,
    mode: 'fit' | 'fill',
  ) => readonly EditorCommand[];
}

const COLOURS: Record<string, string> = {
  red: '#e5484d',
  लाल: '#e5484d',
  blue: '#3b82f6',
  नीला: '#3b82f6',
  नीली: '#3b82f6',
  green: '#30a46c',
  हरा: '#30a46c',
  हरी: '#30a46c',
  yellow: '#f5d90a',
  पीला: '#f5d90a',
  पीली: '#f5d90a',
  orange: '#f76b15',
  नारंगी: '#f76b15',
  purple: '#8e4ec6',
  बैंगनी: '#8e4ec6',
  pink: '#e93d82',
  गुलाबी: '#e93d82',
  white: '#ffffff',
  सफ़ेद: '#ffffff',
  सफेद: '#ffffff',
  black: '#111111',
  काला: '#111111',
  काली: '#111111',
  gold: '#f5c542',
  सुनहरा: '#f5c542',
  grey: '#8b8d98',
  gray: '#8b8d98',
};
export function colourIn(text: string): string | null {
  const hex = /#[0-9a-f]{6}\b/i.exec(text)?.[0];
  if (hex) return hex.toLowerCase();
  const t = text.toLowerCase();
  for (const [word, value] of Object.entries(COLOURS))
    if (new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, 'u').test(t))
      return value;
  return null;
}
/** The words a person wants a text to say: quotes, or after "to" / "say". */
export function quotedText(text: string): string | null {
  const q = /["“”'‘’«]([^"“”«»]{1,400})["“”'‘’»]/.exec(text)?.[1];
  if (q) return q.trim();
  const m =
    /(?:\b(?:text|title|heading|caption|it|this)\s+(?:to|as)|\bsay(?:s)?|\bwrite|में लिखो|लिखो|लिखें)\s*:?\s+(.{1,400})$/iu.exec(
      text.trim(),
    )?.[1];
  return m ? m.trim().replace(/[.]$/, '') : null;
}
const has = (text: string, re: RegExp) => re.test(text.toLowerCase());
const RE = {
  remove: /\b(remove|delete|get rid of|take (it|this) out)\b|हटा|मिटा|निकाल/u,
  bigger: /\b(bigger|larger|increase|enlarge|grow)\b|बड़ा|बड़ी|बड़े/u,
  smaller: /\b(smaller|reduce|shrink|decrease)\b|छोटा|छोटी|छोटे/u,
  hide: /\b(hide|invisible)\b|छिपा|छुपा/u,
  show: /\b(show|unhide|visible)\b|दिखा/u,
  fit: /\bfit\b|फ़िट|फिट/u,
  fill: /\b(fill|cover)\b|भर/u,
  replace:
    /\b(replace|swap|use this|change (the )?(picture|image|photo|video))\b|बदल/u,
  background: /\bbackground\b|बैकग्राउंड|पृष्ठभूमि/u,
  centre: /\b(centre|center|middle)\b|बीच/u,
  allText:
    /\b(all|every)\b.{0,12}\b(text|title|word)s?\b|सारे टेक्स्ट|सभी टेक्स्ट/u,
  faster: /\b(faster|speed up|quicker)\b|तेज़|तेज/u,
  slower: /\b(slower|slow down)\b|धीमा|धीरे/u,
};

let seq = 0;
const newId = () => `p-${Date.now().toString(36)}-${(++seq).toString(36)}`;
const copy = (x: unknown) =>
  JSON.parse(JSON.stringify(x)) as Record<string, unknown>;
const prop = (
  type: 'string' | 'color' | 'boolean' | 'number',
  value: string | boolean | number,
) => ({ type, value, animated: false, keyframes: [], constraints: [] });

function setProperty(
  sceneId: string,
  layer: L,
  key: string,
  type: 'string' | 'color' | 'boolean' | 'number',
  value: string | boolean | number,
): EditorCommand {
  const current = layer.properties[key];
  return {
    type: 'SET_PROPERTY',
    compositionId: sceneId,
    layerId: layer.id,
    target: { kind: 'property', key },
    property:
      current && current.type === type
        ? { ...copy(current), value, animated: false, keyframes: [] }
        : prop(type, value),
  } as EditorCommand;
}
function setTransform(
  sceneId: string,
  layer: L,
  key: 'scale' | 'position' | 'opacity',
  value: number | [number, number],
): EditorCommand {
  return {
    type: 'SET_PROPERTY',
    compositionId: sceneId,
    layerId: layer.id,
    target: { kind: 'transform', key },
    property: { ...copy(layer.transform[key]), value },
  } as EditorCommand;
}
const clipOf = (scene: Scene, layerId: string) => {
  for (const track of scene.tracks)
    for (const clip of track.clips) if (clip.layerId === layerId) return clip;
  return null;
};
/** The layer that carries a colour: itself, or a group's first coloured child. */
const colourKey = (layer: L): string | null =>
  layer.type === 'text' || layer.type === 'shape'
    ? layer.properties.fillGradient && layer.type === 'shape'
      ? 'fill'
      : 'fill'
    : null;

/** Suggested actions for the bubble on a selected layer, by its kind. */
export function suggestionsFor(layer: L): string[] {
  const kind = kindOf(layer);
  if (kind === 'text') return ['changeText', 'bigger', 'recolour', 'remove'];
  if (kind === 'picture' || kind === 'video')
    return ['replace', 'fit', 'bigger', 'remove'];
  if (kind === 'shape') return ['recolour', 'bigger', 'smaller', 'remove'];
  if (kind === 'animation') return ['faster', 'recolour', 'remove'];
  return ['bigger', 'smaller', 'remove'];
}

interface PlainCode {
  tier: 'B' | 'C';
  source: string;
  meta: Record<string, unknown>;
  params: Record<string, unknown>;
  templateId?: string;
}
/** The layer's code record as plain data (its JSON type is too deep to infer). */
const plainCode = (layer: L): PlainCode | null =>
  (layer.code as unknown as PlainCode | undefined) ?? null;

/** A code animation's own controls named in the ask, with a new value. */
function codeChange(layer: L, text: string): Record<string, unknown> | null {
  const code = plainCode(layer);
  if (!code) return null;
  const specs = ((code.meta as { params?: unknown }).params ?? []) as readonly {
    name: string;
    label?: string;
    type: string;
    min?: number;
    max?: number;
    options?: readonly string[];
    default?: unknown;
  }[];
  const t = text.toLowerCase();
  const next: Record<string, unknown> = {};
  const current = (name: string, fallback: unknown) =>
    (code.params as Record<string, unknown>)[name] ?? fallback;
  const colour = colourIn(text);
  const number = /-?\d+(?:\.\d+)?/.exec(text)?.[0];
  const words = quotedText(text);
  for (const spec of specs) {
    const named =
      t.includes(spec.name.toLowerCase()) ||
      (!!spec.label && t.includes(spec.label.toLowerCase()));
    if (spec.type === 'color' && colour && (named || !Object.keys(next).length))
      next[spec.name] = colour;
    else if (spec.type === 'number') {
      const now = Number(current(spec.name, spec.default ?? 0));
      const lo = spec.min ?? -Infinity;
      const hi = spec.max ?? Infinity;
      const clamp = (n: number) => Math.min(hi, Math.max(lo, n));
      if (named && number !== undefined)
        next[spec.name] = clamp(Number(number));
      else if (/speed|rate|tempo/i.test(spec.name) && has(text, RE.faster))
        next[spec.name] = clamp(now * 1.5 || 1.5);
      else if (/speed|rate|tempo/i.test(spec.name) && has(text, RE.slower))
        next[spec.name] = clamp(now / 1.5);
      else if (named && has(text, RE.bigger))
        next[spec.name] = clamp(now * 1.25);
      else if (named && has(text, RE.smaller))
        next[spec.name] = clamp(now * 0.8);
    } else if (
      spec.type === 'text' &&
      words &&
      (named || specs.filter((s) => s.type === 'text').length === 1)
    )
      next[spec.name] = words;
    else if (spec.type === 'bool' && named)
      next[spec.name] = !/\b(off|no|without|false)\b|बंद/u.test(t);
    else if (spec.type === 'select') {
      const opt = spec.options?.find((o) => t.includes(o.toLowerCase()));
      if (opt) next[spec.name] = opt;
    }
  }
  return Object.keys(next).length ? next : null;
}

export function propose(x: ProposeInput): ProposeResult {
  const scene = x.project.compositions.find((s) => s.id === x.sceneId);
  if (!scene) return { kind: 'gone' };
  const targets: L[] = [];
  for (const id of x.selectedIds) {
    const hit = findLayer(x.project, id);
    if (!hit || hit.scene.id !== scene.id) return { kind: 'gone' };
    targets.push(hit.layer);
  }
  const text = x.text.trim();
  const commands: EditorCommand[] = [];
  const changed = new Set<string>();
  const say: string[] = [];
  const en = x.lang !== 'hi';
  const name = (l: L) => `"${l.name}"`;
  const use = (layer: L, list: readonly EditorCommand[], what: string) => {
    if (!list.length) return;
    commands.push(...list);
    changed.add(layer.id);
    say.push(what);
  };

  if (targets.length) {
    for (const layer of targets) {
      if (isLocked(layer)) return { kind: 'locked', name: layer.name };
      const kind = kindOf(layer);
      const colour = colourIn(text);
      const words = quotedText(text);
      if (has(text, RE.remove)) {
        use(
          layer,
          [
            {
              type: 'DELETE_LAYER',
              compositionId: scene.id,
              layerId: layer.id,
            },
          ],
          en ? `remove ${name(layer)}` : `${name(layer)} हटाना`,
        );
        continue;
      }
      if (x.assetId && (kind === 'picture' || kind === 'video')) {
        use(
          layer,
          [
            {
              type: 'SET_LAYER_ASSET',
              compositionId: scene.id,
              layerId: layer.id,
              assetId: x.assetId,
            },
          ],
          en
            ? `replace ${name(layer)} with your file`
            : `${name(layer)} को आपकी फ़ाइल से बदलना`,
        );
        continue;
      }
      const params = codeChange(layer, text);
      const code = plainCode(layer);
      if (params && code) {
        use(
          layer,
          [
            {
              type: 'SET_LAYER_CODE',
              compositionId: scene.id,
              layerId: layer.id,
              code: codeRecord({
                tier: code.tier,
                source: code.source,
                meta: code.meta as Record<string, unknown>,
                params: {
                  ...(code.params as Record<string, unknown>),
                  ...params,
                },
                ...(code.templateId ? { templateId: code.templateId } : {}),
              }),
            } as EditorCommand,
          ],
          en
            ? `change ${Object.keys(params).join(', ')} of ${name(layer)}`
            : `${name(layer)} का ${Object.keys(params).join(', ')} बदलना`,
        );
        continue;
      }
      if (kind === 'text' && words)
        use(
          layer,
          [setProperty(scene.id, layer, 'text', 'string', words)],
          en
            ? `change the text of ${name(layer)} to "${words}"`
            : `${name(layer)} का टेक्स्ट "${words}" करना`,
        );
      if (colour && colourKey(layer))
        use(
          layer,
          [setProperty(scene.id, layer, colourKey(layer)!, 'color', colour)],
          en
            ? `recolour ${name(layer)} (${colour})`
            : `${name(layer)} का रंग बदलना (${colour})`,
        );
      const grow = has(text, RE.bigger)
        ? 1.25
        : has(text, RE.smaller)
          ? 0.8
          : 0;
      if (grow) {
        const size = layer.properties.fontSize;
        if (kind === 'text' && size && size.type === 'number')
          use(
            layer,
            [
              setProperty(
                scene.id,
                layer,
                'fontSize',
                'number',
                Math.max(8, Math.round(size.value * grow)),
              ),
            ],
            en
              ? `make ${name(layer)} ${grow > 1 ? 'bigger' : 'smaller'}`
              : `${name(layer)} को ${grow > 1 ? 'बड़ा' : 'छोटा'} करना`,
          );
        else if (!layer.transform.scale.animated) {
          const [sx, sy] = layer.transform.scale.value as readonly [
            number,
            number,
          ];
          use(
            layer,
            [setTransform(scene.id, layer, 'scale', [sx * grow, sy * grow])],
            en
              ? `make ${name(layer)} ${grow > 1 ? 'bigger' : 'smaller'}`
              : `${name(layer)} को ${grow > 1 ? 'बड़ा' : 'छोटा'} करना`,
          );
        }
      }
      const fitMode = has(text, RE.fit)
        ? 'fit'
        : has(text, RE.fill)
          ? 'fill'
          : null;
      if (fitMode && x.fit && (kind === 'picture' || kind === 'video'))
        use(
          layer,
          x.fit(scene.id, layer.id, fitMode),
          en
            ? `${fitMode} ${name(layer)} to the canvas`
            : `${name(layer)} को कैनवस में फ़िट करना`,
        );
      const hide = has(text, RE.hide);
      const show = !hide && has(text, RE.show);
      const clip = clipOf(scene, layer.id);
      if ((hide || show) && clip)
        use(
          layer,
          [
            {
              type: 'SET_CLIP_ENABLED',
              compositionId: scene.id,
              clipId: clip.id,
              enabled: show,
            },
          ],
          en
            ? `${hide ? 'hide' : 'show'} ${name(layer)}`
            : `${name(layer)} को ${hide ? 'छिपाना' : 'दिखाना'}`,
        );
    }
  } else {
    // Scene work with nothing selected.
    const colour = colourIn(text);
    if (colour && has(text, RE.background)) {
      commands.push({
        type: 'SET_COMPOSITION_BACKGROUND',
        compositionId: scene.id,
        color: colour,
      });
      say.push(
        en
          ? `set this scene's background to ${colour}`
          : `इस सीन का बैकग्राउंड ${colour} करना`,
      );
    } else {
      // "the title", "all text": find the layers the ask names.
      const t = text.toLowerCase();
      const named: L[] = [];
      eachLayer(scene.layers, (layer, parent) => {
        if (parent && parent.type !== 'group') return;
        const n = layer.name.toLowerCase();
        const kind = kindOf(layer);
        const byName = n.length > 2 && t.includes(n);
        const byKind =
          (has(text, RE.allText) && kind === 'text') ||
          (/\b(title|heading)\b|शीर्षक/u.test(t) &&
            kind === 'text' &&
            !named.some((l) => kindOf(l) === 'text'));
        if (byName || byKind) named.push(layer);
      });
      if (named.length)
        return propose({ ...x, selectedIds: named.map((l) => l.id) });
    }
  }
  if (!commands.length)
    return {
      kind: 'cannot',
      alternatives: targets[0]
        ? suggestionsFor(targets[0])
        : ['background', 'allText', 'selectFirst'],
    };
  // A layer the person changed by hand since Director last left it.
  const allowed = new Set(x.allowed ?? []);
  const hand = [...changed]
    .map((id) => findLayer(x.project, id)!.layer)
    .filter(
      (layer) =>
        x.touched[layer.id] !== undefined &&
        x.touched[layer.id] !== hashLayer(layer) &&
        !allowed.has(layer.id),
    );
  if (hand.length)
    return {
      kind: 'ask-hand-edited',
      layers: hand.map((l) => ({ id: l.id, name: l.name })),
    };
  const summary = en
    ? `I will ${say.join(', and ')}.`
    : `मैं यह करूँगा: ${say.join('; ')}।`;
  return {
    kind: 'proposal',
    proposal: {
      id: newId(),
      summary,
      label: 'Director change',
      commands,
      layerIds: [...changed],
      sceneId: scene.id,
      credits: 0,
    },
  };
}

/** Whether a proposal can still be applied (its layers and scene exist). */
export function stillValid(
  project: DeepReadonly<Project>,
  proposal: Proposal,
): boolean {
  if (!project.compositions.some((s) => s.id === proposal.sceneId))
    return false;
  return proposal.layerIds.every((id) => findLayer(project, id) !== null);
}
/** The text a text layer shows now (the bubble's "Change text" starts with it). */
export const textOf = (layer: L) => stringOf(layer, 'text');
