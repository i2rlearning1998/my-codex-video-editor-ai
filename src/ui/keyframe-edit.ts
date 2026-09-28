// ANI-002/ANI-004/ANI-005 keyframe editing shared by the timeline, Inspector
// and palette. A timeline diamond stands for every keyframe of one layer at one
// time (all properties); each operation is one transaction of SET_PROPERTY.
import {
  evaluateProperty,
  type Command,
  type EditorEngine,
  type Easing,
  type Property,
} from '../core';
import {
  locateLayer,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';
import {
  copyProperty,
  isAnimated,
  keyframeTimes,
  setPropertyCommand,
} from './keyframes';
import type { EditorSession, SelectedKeyframe } from './session';

type Frame = { time: number; value: unknown; easing?: Easing };
interface Slot {
  kind: 'transform' | 'property';
  key: string;
  property: Property;
}
/** Every animated property of a layer, as mutable copies. */
function slots(layer: SceneLayer): Slot[] {
  const list: Slot[] = [];
  for (const [kind, record] of [
    ['transform', layer.transform],
    ['property', layer.properties],
  ] as const)
    for (const [key, value] of Object.entries(record as object))
      if (isAnimated(value))
        list.push({ kind, key, property: copyProperty(value) });
  return list;
}
const frames = (property: Property) => property.keyframes as Frame[];
const byLayer = (items: readonly SelectedKeyframe[]) => {
  const map = new Map<string, Set<number>>();
  for (const item of items)
    map.set(item.layerId, (map.get(item.layerId) ?? new Set()).add(item.time));
  return map;
};
const layerOf = (source: RenderSource, id: string) =>
  locateLayer(source.composition.layers, id)?.layer;
/** A property with new keyframes; with none left it becomes static at `hold`. */
function withFrames(slot: Slot, next: Frame[], hold: number): Property {
  next.sort((a, b) => a.time - b.time);
  if (!next.length)
    return {
      ...slot.property,
      value: structuredClone(evaluateProperty(slot.property, hold)),
      animated: false,
      keyframes: [],
    } as Property;
  return { ...slot.property, animated: true, keyframes: next } as Property;
}
const command = (
  source: RenderSource,
  layerId: string,
  slot: Slot,
  property: Property,
): Command =>
  setPropertyCommand(source.composition.id, layerId, slot, property);

export function deleteKeyframeCommands(
  source: RenderSource,
  items: readonly SelectedKeyframe[],
): Command[] {
  const commands: Command[] = [];
  for (const [layerId, times] of byLayer(items)) {
    const layer = layerOf(source, layerId);
    if (!layer) continue;
    for (const slot of slots(layer)) {
      const kept = frames(slot.property).filter(
        (frame) => !times.has(frame.time),
      );
      if (kept.length === frames(slot.property).length) continue;
      commands.push(
        command(
          source,
          layerId,
          slot,
          withFrames(slot, kept, source.currentTime ?? 0),
        ),
      );
    }
  }
  return commands;
}

/** Moves the selected keyframes by `delta` seconds (clamped at 0). */
export function moveKeyframeCommands(
  source: RenderSource,
  items: readonly SelectedKeyframe[],
  delta: number,
): Command[] {
  if (delta === 0) return [];
  const commands: Command[] = [];
  for (const [layerId, times] of byLayer(items)) {
    const layer = layerOf(source, layerId);
    if (!layer) continue;
    for (const slot of slots(layer)) {
      const moving = frames(slot.property).filter((frame) =>
        times.has(frame.time),
      );
      if (!moving.length) continue;
      const moved = moving.map((frame) => ({
        ...frame,
        time: Math.max(0, frame.time + delta),
      }));
      const landing = new Set(moved.map((frame) => frame.time));
      // A moved keyframe replaces an unselected one at the same time.
      const staying = frames(slot.property).filter(
        (frame) => !times.has(frame.time) && !landing.has(frame.time),
      );
      const unique = new Map(moved.map((frame) => [frame.time, frame]));
      commands.push(
        command(
          source,
          layerId,
          slot,
          withFrames(slot, [...staying, ...unique.values()], 0),
        ),
      );
    }
  }
  return commands;
}

export function setEasingCommands(
  source: RenderSource,
  items: readonly SelectedKeyframe[],
  easing: Easing,
): Command[] {
  const commands: Command[] = [];
  for (const [layerId, times] of byLayer(items)) {
    const layer = layerOf(source, layerId);
    if (!layer) continue;
    for (const slot of slots(layer)) {
      if (!frames(slot.property).some((frame) => times.has(frame.time)))
        continue;
      const next = frames(slot.property).map((frame) => {
        if (!times.has(frame.time)) return frame;
        if (easing === 'linear') {
          const { easing: _removed, ...rest } = frame;
          return rest;
        }
        return { ...frame, easing: structuredClone(easing) };
      });
      commands.push(command(source, layerId, slot, withFrames(slot, next, 0)));
    }
  }
  return commands;
}

/** In-app, transient keyframe clipboard: one layer, offsets from the first. */
interface Copied {
  layerId: string;
  entries: { kind: Slot['kind']; key: string; frames: Frame[] }[];
  span: number;
}
let copied: Copied | null = null;
export const hasCopiedKeyframes = () => copied !== null;
export function clearKeyframeClipboard(): void {
  copied = null;
}
export function copyKeyframes(
  source: RenderSource,
  items: readonly SelectedKeyframe[],
): boolean {
  const layerId = items[0]?.layerId;
  const layer = layerId ? layerOf(source, layerId) : undefined;
  if (!layer || !layerId) return false;
  const times = byLayer(items).get(layerId)!;
  const start = Math.min(...times),
    end = Math.max(...times);
  copied = {
    layerId,
    span: end - start,
    entries: slots(layer)
      .map((slot) => ({
        kind: slot.kind,
        key: slot.key,
        frames: frames(slot.property)
          .filter((frame) => times.has(frame.time))
          .map((frame) => ({
            ...structuredClone(frame),
            time: frame.time - start,
          })),
      }))
      .filter((entry) => entry.frames.length),
  };
  return true;
}
/** Pastes onto the copied layer at `time`; returns the pasted keyframes. */
export function pasteKeyframeCommands(
  source: RenderSource,
  time: number,
): { commands: Command[]; pasted: SelectedKeyframe[] } {
  const layer = copied ? layerOf(source, copied.layerId) : undefined;
  if (!copied || !layer) return { commands: [], pasted: [] };
  const commands: Command[] = [];
  const pasted = new Set<number>();
  for (const entry of copied.entries) {
    const record = (
      entry.kind === 'transform' ? layer.transform : layer.properties
    ) as Record<string, unknown>;
    const current = record[entry.key];
    if (!current) continue;
    const property = copyProperty(current as object);
    const incoming = entry.frames.map((frame) => ({
      ...structuredClone(frame),
      time: time + frame.time,
    }));
    const landing = new Set(incoming.map((frame) => frame.time));
    incoming.forEach((frame) => pasted.add(frame.time));
    const slot = { kind: entry.kind, key: entry.key, property };
    commands.push(
      command(
        source,
        layer.id,
        slot,
        withFrames(
          slot,
          [
            ...frames(property).filter((frame) => !landing.has(frame.time)),
            ...incoming,
          ],
          0,
        ),
      ),
    );
  }
  return {
    commands,
    pasted: [...pasted].map((at) => ({ layerId: layer.id, time: at })),
  };
}

/** The previous or next keyframe time of a layer (or one property) from `time`. */
export function adjacentKeyframe(
  times: readonly number[],
  time: number,
  direction: -1 | 1,
): number | null {
  const candidates =
    direction < 0
      ? times.filter((item) => item < time - 1e-9)
      : times.filter((item) => item > time + 1e-9);
  if (!candidates.length) return null;
  return direction < 0 ? Math.max(...candidates) : Math.min(...candidates);
}

/** Session-level actions with history labels, used by every surface. */
export function runKeyframeAction(
  engine: EditorEngine,
  session: EditorSession,
  action: 'delete' | 'copy' | 'paste' | 'duplicate',
): void {
  const source = session.source;
  const items = session.selectedKeyframes;
  if (action === 'copy') {
    copyKeyframes(source, items);
    return;
  }
  if (action === 'delete') {
    const commands = deleteKeyframeCommands(source, items);
    if (commands.length)
      engine.commands.transaction('Delete keyframes', commands);
    return;
  }
  let at = session.currentTime;
  if (action === 'duplicate') {
    if (!copyKeyframes(source, items)) return;
    at =
      Math.max(...items.map((item) => item.time)) + 1 / source.composition.fps;
  }
  const { commands, pasted } = pasteKeyframeCommands(source, at);
  if (!commands.length) return;
  engine.commands.transaction(
    action === 'paste' ? 'Paste keyframes' : 'Duplicate keyframes',
    commands,
  );
  session.selectKeyframes(pasted);
}

export function moveSelectedKeyframes(
  engine: EditorEngine,
  session: EditorSession,
  delta: number,
): void {
  const items = session.selectedKeyframes;
  const commands = moveKeyframeCommands(session.source, items, delta);
  if (!commands.length) return;
  engine.commands.transaction('Move keyframes', commands);
  session.selectKeyframes(
    items.map((item) => ({ ...item, time: Math.max(0, item.time + delta) })),
  );
}

export function setSelectedEasing(
  engine: EditorEngine,
  session: EditorSession,
  easing: Easing,
): void {
  const commands = setEasingCommands(
    session.source,
    session.selectedKeyframes,
    easing,
  );
  if (commands.length) engine.commands.transaction('Set easing', commands);
}

/** ANI-005: jumps the playhead to the selected layer's previous or next keyframe. */
export function jumpToKeyframe(
  session: EditorSession,
  direction: -1 | 1,
): boolean {
  const layer = session.selectedId
    ? layerOf(session.source, session.selectedId)
    : undefined;
  if (!layer) return false;
  const target = adjacentKeyframe(
    keyframeTimes(layer),
    session.currentTime,
    direction,
  );
  if (target === null) return false;
  session.setPlaying(false);
  session.setCurrentTime(target);
  return true;
}
