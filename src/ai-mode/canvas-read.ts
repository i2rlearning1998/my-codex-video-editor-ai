// ROUND-B: Director reads the canvas fresh on every message. Nothing here
// is stored: a short summary for the context pack, and a hash per layer so a
// hand edit (a layer that is no longer as Director left it) is noticed. Pure.
import type { Composition, DeepReadonly, Layer, Project } from '../core';

type L = DeepReadonly<Layer>;
type Scene = DeepReadonly<Composition>;

/** cyrb53: a small, stable string hash. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
/** What a person can change about a layer by hand, as one hash. */
export function hashLayer(layer: L): string {
  return hashText(
    JSON.stringify([
      layer.name,
      layer.transform,
      layer.properties,
      layer.assetId,
      layer.code?.bakeKey ?? null,
      layer.children.map(hashLayer),
    ]),
  );
}
export function eachLayer(
  layers: readonly L[],
  visit: (layer: L, parent: L | null) => void,
  parent: L | null = null,
): void {
  for (const layer of layers) {
    visit(layer, parent);
    eachLayer(layer.children, visit, layer);
  }
}
/** Every layer of the project (children too) to its hash. */
export function layerHashes(
  project: DeepReadonly<Project>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const scene of project.compositions)
    eachLayer(scene.layers, (layer) => {
      out[layer.id] = hashLayer(layer);
    });
  return out;
}
export function findLayer(
  project: DeepReadonly<Project>,
  layerId: string,
): { scene: Scene; layer: L } | null {
  for (const scene of project.compositions) {
    let hit: L | null = null;
    eachLayer(scene.layers, (layer) => {
      if (layer.id === layerId) hit = layer;
    });
    if (hit) return { scene, layer: hit };
  }
  return null;
}
export const stringOf = (layer: L, key: string): string => {
  const p = layer.properties[key];
  return p && p.type === 'string' ? p.value : '';
};
export const isLocked = (layer: L): boolean => {
  const p = layer.properties.locked;
  return !!p && p.type === 'boolean' && p.value === true;
};
/** What kind of thing a layer is, for the bubble and the summary. */
export function kindOf(
  layer: L,
): 'text' | 'picture' | 'video' | 'shape' | 'animation' | 'group' | 'audio' {
  if (layer.code) return 'animation';
  if (layer.type === 'image') return 'picture';
  if (layer.type === 'group') return 'group';
  return layer.type as 'text' | 'video' | 'shape' | 'audio';
}
const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;
export function layerLine(layer: L): string {
  const text = stringOf(layer, 'text');
  return `${layer.name} (${kindOf(layer)})${text ? `: "${clip(text.replace(/\s+/g, ' '), 60)}"` : ''}`;
}
export const seconds = (n: number) => `${Math.round(n * 10) / 10} s`;
/** The live canvas for the context pack: the scene list, and the open scene's layers. */
export function canvasSummary(
  project: DeepReadonly<Project>,
  openSceneId: string,
  touched: Readonly<Record<string, string>> = {},
): { scenes: string[]; layers: string[] } {
  const scenes = project.compositions.map(
    (scene, i) =>
      `${i + 1}. ${scene.name} (${seconds(scene.duration)}, ${scene.layers.length} layers)${scene.id === openSceneId ? ' [open]' : ''}`,
  );
  const open = project.compositions.find((s) => s.id === openSceneId);
  const layers: string[] = [];
  if (open)
    eachLayer(open.layers, (layer, parent) => {
      if (parent) return;
      const hand =
        touched[layer.id] !== undefined &&
        touched[layer.id] !== hashLayer(layer);
      layers.push(
        `${layerLine(layer)}${hand ? ' [changed by hand]' : ''}${isLocked(layer) ? ' [locked]' : ''}`,
      );
    });
  return { scenes, layers: layers.slice(0, 40) };
}
/** One line per scene for the Video sheet. */
export function sceneLines(project: DeepReadonly<Project>): string[] {
  return project.compositions.map((scene, i) => {
    const texts: string[] = [];
    eachLayer(scene.layers, (layer) => {
      const t = stringOf(layer, 'text');
      if (t && texts.length < 2) texts.push(clip(t.replace(/\s+/g, ' '), 50));
    });
    return `Scene ${i + 1}: ${scene.name} (${seconds(scene.duration)})${texts.length ? `: ${texts.join(' / ')}` : ''}`;
  });
}
