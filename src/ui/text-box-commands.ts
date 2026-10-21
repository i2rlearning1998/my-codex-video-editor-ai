// FINAL3 T1: the commands behind the Canva text box: a corner drag scales
// the font (size, spacing, a fixed width and the runs' sizes) instead of the
// layer; a double-click on a side handle makes the box auto width again; a
// side drag stores the fixed width. Each is ordinary SET_PROPERTY commands
// for one transaction (one undo step).
import type { Command, TransformValues } from '../core';
import type { SceneLayer } from '../render/adapter';
import { formatListLevels, formatRuns, parseRuns } from '../render/rich-text';
import { listOn } from '../text-engine/editing';
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

/**
 * FINAL3 T3: turning a list on, changing it or off. Lists act on
 * paragraphs: a stale empty line is removed first (one line → one bullet);
 * with `range` (the paragraphs selected while editing) only those join the
 * list. One undo step.
 */
export function listCommands(
  compositionId: string,
  layer: SceneLayer,
  style: 'none' | 'bullet' | 'number' | 'check',
  range: [number, number] | null = null,
): Command[] {
  const commands: Command[] = [];
  const add = (key: string, value: string) => {
    const old = layer.properties[key];
    if (!old && !value) return;
    const command = textPropertyCommand(compositionId, layer, key, value);
    if (command) commands.push(command);
  };
  const text = layer.properties.text;
  const value = text?.type === 'string' ? text.value : layer.name;
  if (style === 'none') {
    add('listStyle', '');
    add('listLevels', '');
    add('listChecked', '');
    return commands;
  }
  const on = listOn(value, range);
  if (on.text !== value) {
    add('text', on.text);
    // Runs past the trimmed end are dropped by the reader; keep them valid.
    const runs = layer.properties.textRuns;
    if (runs?.type === 'string' && runs.value)
      add('textRuns', formatRuns(parseRuns(runs.value, on.text.length)));
  }
  add('listStyle', style);
  add('listLevels', formatListLevels(on.levels));
  if (style !== 'check') add('listChecked', '');
  return commands;
}

/**
 * FINAL3 (Canva Text position): superscript, subscript or none on the whole
 * text box (while editing, the editor applies it to the selection).
 */
export function scriptCommands(
  compositionId: string,
  layer: SceneLayer,
  script: 'super' | 'sub' | 'none',
): Command[] {
  const text = layer.properties.text;
  const value = text?.type === 'string' ? text.value : layer.name;
  const property = layer.properties.textRuns;
  const runs = parseRuns(
    property?.type === 'string' ? property.value : undefined,
    value.length,
  );
  // Every character gets the script; the rest of each run is kept.
  const cuts = new Set([0, value.length]);
  for (const run of runs) cuts.add(run.start).add(run.end);
  const points = [...cuts].sort((a, b) => a - b);
  const next = points.slice(0, -1).flatMap((start, index) => {
    const end = points[index + 1]!;
    if (end <= start) return [];
    const own = runs.find((run) => run.start <= start && end <= run.end);
    const {
      start: _s,
      end: _e,
      script: _old,
      ...rest
    } = own ?? {
      start,
      end,
    };
    void _s;
    void _e;
    void _old;
    const piece = {
      start,
      end,
      ...rest,
      ...(script === 'none' ? {} : { script }),
    };
    return Object.keys(piece).length > 2 ? [piece] : [];
  });
  const command = textPropertyCommand(
    compositionId,
    layer,
    'textRuns',
    formatRuns(next),
  );
  return command ? [command] : [];
}

/** FINAL3 (Canva Typography): kerning or ligatures on one or every text. */
export function typographyCommands(
  compositionId: string,
  layers: readonly SceneLayer[],
  key: 'fontKerning' | 'fontLigatures',
  value: boolean,
): Command[] {
  return layers.flatMap((layer) => {
    if (layer.type !== 'text') return [];
    const old = layer.properties[key];
    if (!old && value) return [];
    const command = textPropertyCommand(compositionId, layer, key, value);
    return command ? [command] : [];
  });
}
