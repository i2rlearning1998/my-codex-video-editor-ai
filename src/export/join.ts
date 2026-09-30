// G5: export joins every scene into one video. The scenes are laid end to end
// in one in-memory composition, so the export worker and the audio mix stay
// single-composition: each scene's clips, layer times, keyframes and markers
// move by the length of the scenes before it, and its ids get a scene prefix
// so nothing collides. Nothing here touches the project.
import type { Composition, DeepReadonly } from '../core';

type Json = unknown;
interface LooseLayer {
  id: string;
  startTime: number;
  transform: Json;
  properties: Json;
  children: LooseLayer[];
  [key: string]: Json;
}
interface LooseClip {
  id: string;
  layerId: string;
  startTime: number;
  metadata: Record<string, Json>;
  [key: string]: Json;
}
interface LooseTrack {
  id: string;
  clips: LooseClip[];
  [key: string]: Json;
}
interface LooseScene {
  duration: number;
  layers: LooseLayer[];
  tracks: LooseTrack[];
  markers: { id: string; time: number }[];
}

/** Adds `offset` to every keyframe time inside a property record. */
function shiftKeyframes(record: Json, offset: number): Json {
  if (!record || typeof record !== 'object') return record;
  return Object.fromEntries(
    Object.entries(record as Record<string, Json>).map(([key, property]) => {
      if (
        !property ||
        typeof property !== 'object' ||
        !Array.isArray((property as { keyframes?: unknown }).keyframes)
      )
        return [key, property];
      const typed = property as { keyframes: { time: number }[] };
      return [
        key,
        {
          ...typed,
          keyframes: typed.keyframes.map((frame) => ({
            ...frame,
            time: frame.time + offset,
          })),
        },
      ];
    }),
  );
}

export function joinScenes(
  scenes: readonly DeepReadonly<Composition>[],
): DeepReadonly<Composition> {
  const first = scenes[0];
  if (!first) throw new Error('There are no scenes to export.');
  if (scenes.length === 1) return first;
  if (
    scenes.some(
      (scene) => scene.width !== first.width || scene.height !== first.height,
    )
  )
    throw new Error(
      'The scenes have different sizes; export the current scene only.',
    );
  let offset = 0;
  const layers: LooseLayer[] = [];
  const tracks: LooseTrack[] = [];
  const markers: { id: string; time: number }[] = [];
  scenes.forEach((original, index) => {
    // A detached JSON copy: plain data, safe to rewrite.
    const scene = JSON.parse(JSON.stringify(original)) as LooseScene;
    const prefix = `scene${index + 1}-`;
    const id = (value: string) => `${prefix}${value}`;
    const shiftLayer = (layer: LooseLayer): LooseLayer => ({
      ...layer,
      id: id(layer.id),
      startTime: layer.startTime + offset,
      transform: shiftKeyframes(layer.transform, offset),
      properties: shiftKeyframes(layer.properties, offset),
      children: layer.children.map(shiftLayer),
    });
    layers.push(...scene.layers.map(shiftLayer));
    for (const track of scene.tracks)
      tracks.push({
        ...track,
        id: id(track.id),
        clips: track.clips.map((clip) => {
          const metadata = { ...clip.metadata };
          for (const key of ['linkId', 'detachedFrom'])
            if (typeof metadata[key] === 'string')
              metadata[key] = id(metadata[key] as string);
          return {
            ...clip,
            id: id(clip.id),
            layerId: id(clip.layerId),
            startTime: clip.startTime + offset,
            metadata,
          };
        }),
      });
    for (const marker of scene.markers)
      markers.push({
        ...marker,
        id: id(marker.id),
        time: marker.time + offset,
      });
    offset += scene.duration;
  });
  return {
    ...first,
    id: 'all-scenes',
    name: 'All scenes',
    duration: offset,
    layers,
    tracks,
    markers,
  } as unknown as DeepReadonly<Composition>;
}
