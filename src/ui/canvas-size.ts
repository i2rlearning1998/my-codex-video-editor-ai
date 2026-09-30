// H3: the canvas size (Clipchamp's aspect presets). A new size applies to
// every scene in one undo step; each scene's top-level layers move by half the
// change, so they stay centred relative to the old canvas.
import type { Command, EditorEngine } from '../core';
import type { SceneLayer } from '../render/adapter';
import { copyProperty } from './keyframes';

export interface CanvasPreset {
  readonly id: string;
  readonly ratio: string;
  readonly width: number;
  readonly height: number;
}
export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { id: 'wide', ratio: '16:9', width: 1920, height: 1080 },
  { id: 'vertical', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'square', ratio: '1:1', width: 1080, height: 1080 },
  { id: 'classic', ratio: '4:3', width: 1440, height: 1080 },
  { id: 'social', ratio: '4:5', width: 1080, height: 1350 },
  { id: 'cinema', ratio: '21:9', width: 2520, height: 1080 },
  { id: 'portrait', ratio: '2:3', width: 1080, height: 1620 },
];
export const CANVAS_LIMITS = [16, 7680] as const;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** "16:9" for 1920 × 1080 or 1280 × 720; the reduced ratio otherwise. */
export function ratioLabel(width: number, height: number): string {
  const preset = CANVAS_PRESETS.find(
    (item) => Math.abs(item.width / item.height - width / height) < 0.005,
  );
  if (preset) return preset.ratio;
  const divisor = gcd(Math.round(width), Math.round(height)) || 1;
  const a = Math.round(width) / divisor,
    b = Math.round(height) / divisor;
  return a <= 64 && b <= 64 ? `${a}:${b}` : `${width}×${height}`;
}
export function presetFor(width: number, height: number) {
  return (
    CANVAS_PRESETS.find(
      (item) => item.width === width && item.height === height,
    ) ?? null
  );
}

/** Moves a layer by (dx, dy) in its parent, every position keyframe too. */
export function shiftLayerCommand(
  compositionId: string,
  layer: SceneLayer,
  dx: number,
  dy: number,
): Command | null {
  if (!dx && !dy) return null;
  const position = layer.transform.position;
  const [x, y] = position.value as readonly [number, number];
  return {
    type: 'SET_PROPERTY',
    compositionId,
    layerId: layer.id,
    target: { kind: 'transform', key: 'position' },
    property: {
      ...copyProperty(position),
      value: [x + dx, y + dy],
      keyframes: position.keyframes.map((frame) => ({
        ...frame,
        value: [
          (frame.value as readonly number[])[0]! + dx,
          (frame.value as readonly number[])[1]! + dy,
        ],
      })),
    },
  } as Command;
}

/** Every command that resizes every scene, keeping the layers centred. */
export function canvasSizeCommands(
  project: {
    readonly compositions: readonly {
      readonly id: string;
      readonly width: number;
      readonly height: number;
      readonly layers: readonly unknown[];
    }[];
  },
  width: number,
  height: number,
): Command[] {
  const [min, max] = CANVAS_LIMITS;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < min ||
    height < min ||
    width > max ||
    height > max
  )
    throw new RangeError(
      `Canvas size must be whole pixels from ${min} to ${max}`,
    );
  const commands: Command[] = [];
  for (const composition of project.compositions) {
    if (composition.width === width && composition.height === height) continue;
    const dx = (width - composition.width) / 2,
      dy = (height - composition.height) / 2;
    commands.push({
      type: 'SET_COMPOSITION_SIZE',
      compositionId: composition.id,
      width,
      height,
    });
    for (const layer of composition.layers as readonly SceneLayer[]) {
      const command = shiftLayerCommand(composition.id, layer, dx, dy);
      if (command) commands.push(command);
    }
  }
  return commands;
}

/** Applies a canvas size as one undo step; returns false when nothing changed. */
export function applyCanvasSize(
  engine: EditorEngine,
  width: number,
  height: number,
): boolean {
  const commands = canvasSizeCommands(engine.state, width, height);
  if (!commands.length) return false;
  engine.commands.transaction('Canvas size', commands);
  return true;
}
