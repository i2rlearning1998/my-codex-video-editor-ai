// G5 scenes: commands that add, duplicate, reorder, rename and delete scenes
// (compositions) and move or copy a layer between them. Everything goes
// through the Command Bus as one undo step per action; no schema change.
import {
  adoptFreeLayers,
  createComposition,
  findClipByLayer,
  type Command,
  type Composition,
  type DeepReadonly,
  type Layer,
  type Project,
} from '../core';
import { t } from '../i18n';
import { trackForNewClip } from './editing';
import { createExampleProject } from './example';

type ReadonlyProject = DeepReadonly<Project>;
const newId = () => crypto.randomUUID();

/** A deep copy of a scene with new ids for it and everything in it. */
export function cloneScene(
  // Structural `object`: the deep readonly model is too deep for the checker.
  scene: object,
  name: string,
): Composition {
  const copy = JSON.parse(JSON.stringify(scene)) as Composition;
  const layerIds = new Map<string, string>();
  const links = new Map<string, string>();
  const clipIds = new Map<string, string>();
  const relayer = (layers: Layer[]) => {
    for (const layer of layers) {
      const id = newId();
      layerIds.set(layer.id, id);
      layer.id = id;
      relayer(layer.children);
    }
  };
  relayer(copy.layers);
  for (const track of copy.tracks) {
    track.id = newId();
    for (const clip of track.clips) {
      const id = newId();
      clipIds.set(clip.id, id);
      clip.id = id;
      clip.layerId = layerIds.get(clip.layerId) ?? clip.layerId;
    }
  }
  for (const track of copy.tracks)
    for (const clip of track.clips) {
      const metadata = clip.metadata as Record<string, unknown>;
      if (typeof metadata.linkId === 'string') {
        if (!links.has(metadata.linkId)) links.set(metadata.linkId, newId());
        metadata.linkId = links.get(metadata.linkId);
      }
      if (typeof metadata.detachedFrom === 'string')
        metadata.detachedFrom =
          clipIds.get(metadata.detachedFrom) ?? metadata.detachedFrom;
    }
  for (const marker of copy.markers) marker.id = newId();
  return { ...copy, id: newId(), name };
}

/** A new scene placed right after `afterId`, and the commands that add it. */
function place(
  project: ReadonlyProject,
  afterId: string,
  scene: Composition,
): { id: string; commands: Command[] } {
  const index = project.compositions.findIndex((item) => item.id === afterId);
  return {
    id: scene.id,
    commands: [
      { type: 'CREATE_COMPOSITION', composition: scene },
      {
        type: 'MOVE_COMPOSITION',
        compositionId: scene.id,
        index: index < 0 ? project.compositions.length : index + 1,
      },
    ],
  };
}
const nextName = (project: ReadonlyProject) =>
  t('scene.defaultName', { n: String(project.compositions.length + 1) });

export function blankScene(project: ReadonlyProject, afterId: string) {
  const current =
    project.compositions.find((item) => item.id === afterId) ??
    project.compositions[0]!;
  return place(
    project,
    afterId,
    createComposition({
      id: newId(),
      name: nextName(project),
      width: current.width,
      height: current.height,
      fps: current.fps,
    }),
  );
}

export function duplicateScene(project: ReadonlyProject, id: string) {
  const scene = project.compositions.find((item) => item.id === id);
  if (!scene) throw new Error('Unknown scene');
  return place(
    project,
    id,
    cloneScene(scene as object, t('scene.copyName', { name: scene.name })),
  );
}

/** The built-in layout (the example design) as a new scene. */
export function templateScene(project: ReadonlyProject, afterId: string) {
  const example = adoptFreeLayers(createExampleProject()).project;
  return place(
    project,
    afterId,
    cloneScene(example.compositions[0]!, t('scene.templateName')),
  );
}

/**
 * Moves (or, with `copy`, copies) a top-level layer to another scene, at the
 * same time on a free or new compatible track there. A moved layer keeps its
 * id; a copy gets new ids. A clip's link to other clips is not carried over.
 */
export function moveLayerToScene(
  project: ReadonlyProject,
  fromId: string,
  layerId: string,
  toId: string,
  copy: boolean,
): Command[] {
  if (fromId === toId) return [];
  const from = project.compositions.find((item) => item.id === fromId);
  const to = project.compositions.find((item) => item.id === toId);
  if (!from || !to) throw new Error('Unknown scene');
  const original = from.layers.find((item) => item.id === layerId);
  if (!original) throw new Error(t('scene.moveTopLevel'));
  const located = findClipByLayer(from, layerId);
  if (!copy && located?.track.locked) throw new Error(t('scene.moveLocked'));
  const layer = JSON.parse(JSON.stringify(original)) as Layer;
  if (copy) {
    const relayer = (item: Layer) => {
      item.id = newId();
      item.children.forEach(relayer);
    };
    relayer(layer);
  }
  const commands: Command[] = [];
  if (!copy)
    commands.push({ type: 'DELETE_LAYER', compositionId: fromId, layerId });
  commands.push({
    type: 'CREATE_LAYER',
    compositionId: toId,
    parentId: null,
    layer,
  });
  if (located) {
    const clip = JSON.parse(JSON.stringify(located.clip)) as {
      startTime: number;
      duration: number;
      metadata: Record<string, unknown>;
    };
    const metadata = { ...clip.metadata };
    delete metadata.linkId;
    const target = trackForNewClip(
      to,
      layer.type,
      clip.startTime,
      clip.startTime + clip.duration,
    );
    commands.push(...target.commands, {
      type: 'CREATE_CLIP',
      compositionId: toId,
      trackId: target.trackId,
      clip: { ...clip, id: newId(), layerId: layer.id, metadata } as never,
    });
  }
  return commands;
}
