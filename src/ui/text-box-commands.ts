// FINAL3 T1: the commands behind the Canva text box: a corner drag scales
// the font (size, spacing, a fixed width and the runs' sizes) instead of the
// layer; a double-click on a side handle makes the box auto width again; a
// side drag stores the fixed width. Each is ordinary SET_PROPERTY commands
// for one transaction (one undo step).
import type { Command, TransformValues } from '../core';
import type { SceneLayer } from '../render/adapter';
import { formatRuns, parseRuns } from '../render/rich-text';
import { textBoxMode, textHeightFixed } from '../render/text-box';
import { buildTransformCommands } from './transform-commands';
import { withValueAt } from './keyframes';

type Value = string | number | boolean;
/** A SET_PROPERTY of a text property, or null when it would not change. */
export function textPropertyCommand(
  compositionId: string,
  layer: SceneLayer,
  key: string,
  value: Value,
  time?: number,
): Command | null {
  const old = layer.properties[key];
  if (old && old.value === value && !old.animated) return null;
  const type =
    typeof value === 'number'
      ? 'number'
      : typeof value === 'boolean'
        ? 'boolean'
        : 'string';
  if (old && old.type !== type && !(type === 'string' && old.type === 'color'))
    throw new TypeError(`Incompatible ${key} property`);
  const property = old
    ? withValueAt(old, value, time)
    : {
        type,
        value,
        animated: false,
        keyframes: [],
        constraints: [],
      };
  return {
    type: 'SET_PROPERTY',
    compositionId,
    layerId: layer.id,
    target: { kind: 'property', key },
    property,
  } as Command;
}
const numeric = (layer: SceneLayer, key: string) => {
  const value = layer.properties[key];
  return value?.type === 'number' && Number.isFinite(value.value)
    ? value.value
    : undefined;
};
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * A corner drag ended at `target`: the move and the scale it implies, with
 * the scale carried by the font size instead of the layer's scale.
 */
export function fontScaleCommands(
  compositionId: string,
  layer: SceneLayer,
  target: TransformValues,
  time?: number,
): Command[] {
  const before = Math.abs(layer.transform.scale.value[0]) || 1;
  const factor = Math.abs(target.scale.value[0]) / before;
  const kept: TransformValues = {
    ...target,
    scale: { ...target.scale, value: layer.transform.scale.value },
  } as TransformValues;
  const commands = buildTransformCommands(
    compositionId,
    layer,
    kept,
    undefined,
    time,
  );
  if (!Number.isFinite(factor) || Math.abs(factor - 1) < 1e-6) return commands;
  const add = (key: string, value: Value) => {
    const command = textPropertyCommand(compositionId, layer, key, value, time);
    if (command) commands.push(command);
  };
  const size = numeric(layer, 'fontSize') ?? 32;
  add('fontSize', Math.max(1, Math.min(4096, round(size * factor))));
  for (const key of ['letterSpacing', 'paragraphSpacing'] as const) {
    const value = numeric(layer, key);
    if (value) add(key, round(value * factor));
  }
  if (textBoxMode(layer) === 'fixed') {
    const width = numeric(layer, 'width');
    if (width) add('width', round(width * factor));
  }
  if (textHeightFixed(layer)) {
    const height = numeric(layer, 'height');
    if (height) add('height', round(height * factor));
  }
  const text = layer.properties.text;
  const length = text?.type === 'string' ? text.value.length : 0;
  const runsProperty = layer.properties.textRuns;
  const runs = parseRuns(
    runsProperty?.type === 'string' ? runsProperty.value : undefined,
    length,
  );
  if (runs.some((run) => run.size !== undefined))
    add(
      'textRuns',
      formatRuns(
        runs.map((run) =>
          run.size === undefined
            ? run
            : {
                ...run,
                size: Math.max(1, Math.min(4096, round(run.size * factor))),
              },
        ),
      ),
    );
  return commands;
}

/** Auto width: the box grows with the text and never wraps by itself. */
export function resetTextWidthCommands(
  compositionId: string,
  layer: SceneLayer,
): Command[] {
  const commands: Command[] = [];
  for (const [key, value] of [
    ['textBox', 'auto'],
    ['textWrap', false],
    ['textFixedHeight', false],
  ] as const) {
    const old = layer.properties[key];
    if (!old && value === false) continue;
    const command = textPropertyCommand(compositionId, layer, key, value);
    if (command) commands.push(command);
  }
  return commands;
}
