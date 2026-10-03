// I2: My Templates. "Save as template" keeps a copy of a scene in this
// browser (localStorage `aive.myTemplates`), never in the project and never
// on the Undo stack. Media stay references: their bytes are already in the
// media store (D-004). When the media a scene uses are larger than
// MEDIA_LIMIT, the media layers are left out and the user is told.
import type {
  Asset,
  Command,
  Composition,
  DeepReadonly,
  Layer,
  Project,
} from '../core';
import { createComposition } from '../core';
import type { RenderSource } from '../render/adapter';
import { trackForNewClip } from './editing';
import {
  applyTracks,
  type LibraryInsert,
  type TemplateMode,
} from './library-insert';
import { cloneScene, placeScene } from './scenes';

export const MY_TEMPLATES_KEY = 'aive.myTemplates';
/** Media used by a saved scene are kept up to this total size. */
export const MEDIA_LIMIT = 50 * 1024 * 1024;
const MAX_TEMPLATES = 60;

export interface MyTemplate {
  readonly id: string;
  readonly name: string;
  /** A category id from the template taxonomy (or "my"). */
  readonly category: string;
  readonly createdAt: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly scene: Composition;
  readonly assets: readonly Asset[];
  readonly mediaIncluded: boolean;
  /** A small PNG data URL of the scene's first frame. */
  readonly poster?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();
function read(): MyTemplate[] {
  try {
    const raw = localStorage.getItem(MY_TEMPLATES_KEY);
    const value = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(value)
      ? (value.filter(
          (item) =>
            item &&
            typeof item === 'object' &&
            typeof (item as MyTemplate).id === 'string' &&
            typeof (item as MyTemplate).name === 'string' &&
            (item as MyTemplate).scene &&
            Array.isArray((item as MyTemplate).scene.layers),
        ) as MyTemplate[])
      : [];
  } catch {
    return [];
  }
}
function write(list: readonly MyTemplate[]) {
  // A full storage throws: the caller reports it.
  localStorage.setItem(MY_TEMPLATES_KEY, JSON.stringify(list));
  listeners.forEach((listener) => listener());
}

export const myTemplates = {
  list(): readonly MyTemplate[] {
    return read();
  },
  find(id: string) {
    return read().find((item) => item.id === id);
  },
  save(template: MyTemplate) {
    write([template, ...read()].slice(0, MAX_TEMPLATES));
  },
  remove(id: string) {
    write(read().filter((item) => item.id !== id));
  },
  onChange(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const MEDIA_TYPES = new Set(['image', 'video', 'audio']);
/** Asset ids the scene's layers and clips use. */
function usedAssets(scene: DeepReadonly<Composition>) {
  const ids = new Set<string>();
  const walk = (layers: readonly DeepReadonly<Layer>[]) => {
    for (const layer of layers) {
      if (layer.assetId) ids.add(layer.assetId);
      walk(layer.children);
    }
  };
  walk(scene.layers);
  for (const track of scene.tracks)
    for (const clip of track.clips) if (clip.assetId) ids.add(clip.assetId);
  return ids;
}

/**
 * A copy of a scene to keep as a template. Media layers stay when their
 * files together fit MEDIA_LIMIT; otherwise they are left out
 * (`mediaIncluded` false) and the user is warned.
 */
export function templateFromScene(
  project: DeepReadonly<Project>,
  sceneId: string,
  name: string,
  category: string,
  poster?: string,
): MyTemplate {
  const scene = project.compositions.find((item) => item.id === sceneId);
  if (!scene) throw new Error('Unknown scene');
  const ids = usedAssets(scene);
  const assets = (project.assets as unknown as readonly Asset[]).filter(
    (asset) => ids.has(asset.id),
  );
  const media = assets.filter(
    (asset) => MEDIA_TYPES.has(asset.type) && asset.source.kind === 'local',
  );
  const bytes = media.reduce(
    (sum, asset) =>
      sum + (typeof asset.metadata.size === 'number' ? asset.metadata.size : 0),
    0,
  );
  const copy = JSON.parse(JSON.stringify(scene)) as Composition;
  let mediaIncluded = true;
  let kept = assets;
  if (media.length && bytes > MEDIA_LIMIT) {
    mediaIncluded = false;
    const dropped = new Set<string>();
    const strip = (layers: Layer[]): Layer[] =>
      layers
        .filter((layer) => {
          const drop = MEDIA_TYPES.has(layer.type);
          if (drop) dropped.add(layer.id);
          return !drop;
        })
        .map((layer) => ({ ...layer, children: strip(layer.children) }));
    copy.layers = strip(copy.layers);
    for (const track of copy.tracks)
      track.clips = track.clips.filter((clip) => !dropped.has(clip.layerId));
    copy.tracks = copy.tracks.filter(
      (track) => track.type !== 'audio' || track.clips.length,
    );
    kept = assets.filter((asset) => !MEDIA_TYPES.has(asset.type));
  }
  return {
    id: `my-${crypto.randomUUID()}`,
    name,
    category,
    createdAt: new Date().toISOString(),
    width: scene.width,
    height: scene.height,
    background: scene.backgroundColor,
    scene: copy,
    assets: JSON.parse(JSON.stringify(kept)) as Asset[],
    mediaIncluded,
    ...(poster ? { poster } : {}),
  };
}

/** Moves and scales top-level layers (and their keyframes) to fit a canvas. */
function fitLayers(
  layers: Layer[],
  from: { width: number; height: number },
  to: { width: number; height: number },
) {
  if (from.width === to.width && from.height === to.height) return false;
  const s = Math.min(to.width / from.width, to.height / from.height);
  const ox = (to.width - from.width * s) / 2,
    oy = (to.height - from.height * s) / 2;
  const move = ([x, y]: readonly number[]): [number, number] => [
    x! * s + ox,
    y! * s + oy,
  ];
  const grow = ([x, y]: readonly number[]): [number, number] => [
    x! * s,
    y! * s,
  ];
  for (const layer of layers) {
    const { position, scale } = layer.transform;
    position.value = move(position.value);
    position.keyframes = position.keyframes.map((frame) => ({
      ...frame,
      value: move(frame.value),
    }));
    scale.value = grow(scale.value);
    scale.keyframes = scale.keyframes.map((frame) => ({
      ...frame,
      value: grow(frame.value),
    }));
  }
  return true;
}

/** The commands that add a saved template (replace, add onto, new scene). */
export function myTemplateCommands(
  project: DeepReadonly<Project>,
  source: RenderSource,
  template: MyTemplate,
  mode: TemplateMode,
): LibraryInsert {
  const composition = source.composition;
  const canvas = { width: composition.width, height: composition.height };
  const copy = cloneScene(template.scene, template.name);
  const scaled = fitLayers(copy.layers, template, canvas);
  const commands: Command[] = [];
  // Assets the template refers to that this project lacks (references only).
  for (const asset of template.assets)
    if (!project.assets.some((item) => item.id === asset.id))
      commands.push({ type: 'ADD_ASSET', asset } as Command);
  if (mode === 'new') {
    const scene = createComposition({
      id: copy.id,
      name: template.name,
      width: canvas.width,
      height: canvas.height,
      fps: composition.fps,
      // J1: the scene's own background when it was saved.
      backgroundColor: /^#[0-9a-fA-F]{6}$/.test(template.background)
        ? template.background
        : composition.backgroundColor,
    }) as Composition;
    scene.layers = copy.layers;
    scene.tracks = copy.tracks;
    scene.markers = copy.markers;
    const placed = placeScene(project as never, composition.id, scene);
    commands.push(...placed.commands);
    return { label: 'Add template', commands, sceneId: placed.id, scaled };
  }
  if (mode === 'replace')
    for (const layer of composition.layers)
      commands.push({
        type: 'DELETE_LAYER',
        compositionId: composition.id,
        layerId: layer.id,
      } as Command);
  let target = (
    mode === 'replace'
      ? {
          ...composition,
          layers: [],
          tracks: composition.tracks.map((track) => ({ ...track, clips: [] })),
        }
      : composition
  ) as RenderSource['composition'];
  const clipOf = (layerId: string) => {
    for (const track of copy.tracks)
      for (const clip of track.clips) if (clip.layerId === layerId) return clip;
    return null;
  };
  for (const layer of copy.layers) {
    const clip = clipOf(layer.id);
    const start = clip?.startTime ?? layer.startTime;
    const length = clip?.duration ?? layer.duration;
    const placed = trackForNewClip(target, layer.type, start, start + length);
    const added: Command[] = [
      ...placed.commands,
      {
        type: 'CREATE_LAYER',
        compositionId: composition.id,
        parentId: null,
        layer,
      } as Command,
    ];
    if (clip) {
      const metadata = { ...(clip.metadata as Record<string, unknown>) };
      delete metadata.linkId;
      delete metadata.detachedFrom;
      added.push({
        type: 'CREATE_CLIP',
        compositionId: composition.id,
        trackId: placed.trackId,
        clip: { ...clip, metadata },
      } as Command);
    }
    commands.push(...added);
    target = applyTracks(target, added);
  }
  return {
    label: mode === 'replace' ? 'Replace with template' : 'Add template',
    commands,
    ...(copy.layers.length ? { layerId: copy.layers.at(-1)!.id } : {}),
    scaled,
  };
}
