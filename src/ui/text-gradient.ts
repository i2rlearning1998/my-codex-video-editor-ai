// FINAL3 (Canva text colour › gradient): a text's colour can be a linear or
// radial gradient of 2 to 10 colours, stored in `textGradient` (JSON, schema
// unchanged) and drawn by the shared text renderer (preview and export).
// Solid stores an empty value; `fill` keeps the first colour so older
// readers and the caret still have one colour. Each change is one step.
import type { Command } from '../core';
import { t } from '../i18n';
import type { SceneLayer } from '../render/adapter';
import { formatGradient, parseGradient, type Gradient } from '../render/paint';
import { createColorField } from './components/color-picker';
import { createNumberField } from './components/number-field';
import { textPropertyCommand } from './text-box-commands';

export const TEXT_GRADIENT_MAX_STOPS = 10;
export interface TextGradientDeps {
  readonly compositionId: () => string;
  readonly layer: () => SceneLayer | null;
  readonly run: (label: string, commands: Command[]) => void;
  readonly documentColors?: () => readonly string[];
}
const fillOf = (layer: SceneLayer) => {
  const fill = layer.properties.fill;
  return fill?.type === 'color' ? fill.value.slice(0, 7) : '#000000';
};
export function textGradientOf(layer: SceneLayer): Gradient | null {
  const property = layer.properties.textGradient;
  return parseGradient(
    property?.type === 'string' ? property.value : undefined,
    TEXT_GRADIENT_MAX_STOPS,
  );
}
/** The commands that store a gradient (or Solid, with null). */
export function textGradientCommands(
  compositionId: string,
  layer: SceneLayer,
  gradient: Gradient | null,
): Command[] {
  const commands: Command[] = [];
  const set = textPropertyCommand(
    compositionId,
    layer,
    'textGradient',
    gradient ? formatGradient(gradient) : '',
  );
  if (set) commands.push(set);
  const first = gradient?.stops[0]?.color;
  if (first && first !== fillOf(layer)) {
    const old = layer.properties.fill as
      | { animated: boolean; keyframes: unknown[]; constraints: unknown[] }
      | undefined;
    commands.push({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: layer.id,
      target: { kind: 'property', key: 'fill' },
      property: {
        type: 'color',
        value: first,
        animated: false,
        keyframes: [],
        constraints: old?.constraints ?? [],
      },
    } as unknown as Command);
  }
  return commands;
}

/** Fill type, the colours (add up to 10, remove down to 2) and the angle. */
export function buildTextGradientEditor(
  deps: TextGradientDeps,
): HTMLElement | null {
  const layer = deps.layer();
  if (!layer || layer.type !== 'text') return null;
  const gradient = textGradientOf(layer);
  const wrap = document.createElement('div');
  wrap.className = 'text-gradient';
  wrap.id = 'text-gradient';
  const commit = (next: Gradient | null) => {
    const current = deps.layer();
    if (!current) return;
    deps.run(
      next ? 'Set text gradient' : 'Remove text gradient',
      textGradientCommands(deps.compositionId(), current, next),
    );
  };
  const types = document.createElement('div');
  types.className = 'segmented';
  types.setAttribute('role', 'radiogroup');
  types.setAttribute('aria-label', t('gradient.title'));
  for (const type of ['solid', 'linear', 'radial'] as const) {
    const item = document.createElement('button');
    item.type = 'button';
    item.dataset.fillType = type;
    item.setAttribute('role', 'radio');
    const active = type === 'solid' ? !gradient : gradient?.type === type;
    item.setAttribute('aria-checked', String(active));
    item.textContent = t(`gradient.${type}`);
    item.onclick = () => {
      if (active) return;
      if (type === 'solid') return commit(null);
      const fill = fillOf(layer);
      commit({
        type,
        angle: gradient?.angle ?? 0,
        stops: gradient?.stops ?? [
          { offset: 0, color: fill },
          { offset: 1, color: fill === '#ffffff' ? '#7c5cff' : '#ffffff' },
        ],
      });
    };
    types.append(item);
  }
  wrap.append(types);
  if (!gradient) return wrap;
  const stops = document.createElement('ol');
  stops.className = 'text-gradient-stops';
  gradient.stops.forEach((stop, index) => {
    const row = document.createElement('li');
    row.dataset.stop = String(index);
    const change = (next: { offset?: number; color?: string }) =>
      commit({
        ...gradient,
        stops: gradient.stops.map((item, at) =>
          at === index ? { ...item, ...next } : item,
        ),
      });
    row.append(
      createColorField({
        id: `text-gradient-color-${index}`,
        label: t('gradient.stop', { n: String(index + 1) }),
        value: stop.color,
        compact: true,
        ...(deps.documentColors ? { documentColors: deps.documentColors } : {}),
        onCommit: (color) => change({ color }),
      }),
      createNumberField({
        id: `text-gradient-offset-${index}`,
        label: t('gradient.position'),
        value: Math.round(stop.offset * 100),
        unit: '%',
        min: 0,
        max: 100,
        decimals: 0,
        compact: true,
        onCommit: (value) => change({ offset: value / 100 }),
      }),
    );
    if (gradient.stops.length > 2) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ghost sm';
      remove.dataset.action = 'text-gradient-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', t('gradient.remove'));
      remove.title = t('gradient.remove');
      remove.onclick = () =>
        commit({
          ...gradient,
          stops: gradient.stops.filter((_, at) => at !== index),
        });
      row.append(remove);
    }
    stops.append(row);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'secondary sm';
  add.id = 'text-gradient-add';
  add.textContent = t('gradient.add');
  add.disabled = gradient.stops.length >= TEXT_GRADIENT_MAX_STOPS;
  add.title = add.disabled
    ? t('gradient.maxStops', { n: String(TEXT_GRADIENT_MAX_STOPS) })
    : t('gradient.add');
  add.onclick = () => {
    const last = gradient.stops.at(-1)!;
    const before = gradient.stops.at(-2)!;
    commit({
      ...gradient,
      stops: [
        ...gradient.stops.slice(0, -1),
        { offset: (before.offset + last.offset) / 2, color: last.color },
        last,
      ],
    });
  };
  wrap.append(stops, add);
  if (gradient.type === 'linear')
    wrap.append(
      createNumberField({
        id: 'text-gradient-angle',
        label: t('gradient.angle'),
        value: gradient.angle,
        unit: '°',
        min: 0,
        max: 359,
        decimals: 0,
        slider: true,
        onCommit: (value) => commit({ ...gradient, angle: value }),
      }),
    );
  return wrap;
}
