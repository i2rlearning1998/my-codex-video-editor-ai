// PHASE 0 E3 (TXT-037): dynamic text. A text layer may hold fields written as
// {{field}} or {{field:format}}; they are replaced when drawing (never stored),
// by the one drawing path the preview and the export share. The date and time
// are read when the frame is drawn (an export uses the day it is made).
import type { RenderSource, SceneLayer } from './adapter';

type Composition = RenderSource['composition'];

export const FIELDS = [
  'date',
  'time',
  'scene',
  'scenes',
  'counter',
  'timecode',
] as const;
export type Field = (typeof FIELDS)[number];

export interface FieldContext {
  /** Time in the scene (seconds). */
  readonly time: number;
  /** 1-based number of the scene in the project, and how many there are. */
  readonly sceneNumber: number;
  readonly sceneCount: number;
  /** The wall clock (ms since 1970); the drawing time by default. */
  readonly now?: number;
}

/** What a drawing source tells the fields (the scene and the wall clock). */
export interface DynamicContext {
  readonly sceneNumber: number;
  readonly sceneCount: number;
  /** Composition time at which this scene starts (joined exports). */
  readonly sceneStart?: number;
  readonly now?: number;
}

/** The formats the Text panel offers, per field (the first is the default). */
export const FIELD_FORMATS: Readonly<Record<Field, readonly string[]>> = {
  date: ['D MMM YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'MMMM D'],
  time: ['HH:mm', 'hh:mm A', 'HH:mm:ss'],
  scene: ['0', '00'],
  scenes: ['0', '00'],
  counter: ['0', '00', '000'],
  timecode: ['m:ss', 'mm:ss'],
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const pad = (value: number, size: number) =>
  String(Math.trunc(value)).padStart(size, '0');

function formatDate(format: string, now: Date): string {
  return format.replace(/YYYY|MMMM|MMM|MM|DD|D/g, (token) => {
    switch (token) {
      case 'YYYY':
        return String(now.getFullYear());
      case 'MMMM':
        return MONTHS[now.getMonth()]!;
      case 'MMM':
        return MONTHS[now.getMonth()]!.slice(0, 3);
      case 'MM':
        return pad(now.getMonth() + 1, 2);
      case 'DD':
        return pad(now.getDate(), 2);
      default:
        return String(now.getDate());
    }
  });
}

function formatClock(format: string, now: Date): string {
  const hours12 = now.getHours() % 12 || 12;
  return format.replace(/HH|hh|mm|ss|A/g, (token) => {
    switch (token) {
      case 'HH':
        return pad(now.getHours(), 2);
      case 'hh':
        return pad(hours12, 2);
      case 'mm':
        return pad(now.getMinutes(), 2);
      case 'ss':
        return pad(now.getSeconds(), 2);
      default:
        return now.getHours() < 12 ? 'AM' : 'PM';
    }
  });
}

/** A number written with as many digits as the format has zeros. */
const digits = (value: number, format: string) =>
  pad(value, /^0+$/.test(format) ? format.length : 1);

function resolveField(
  field: Field,
  format: string | undefined,
  context: FieldContext,
): string {
  const now = new Date(context.now ?? Date.now());
  switch (field) {
    case 'date':
      return formatDate(format || FIELD_FORMATS.date[0]!, now);
    case 'time':
      return formatClock(format || FIELD_FORMATS.time[0]!, now);
    case 'scene':
      return digits(context.sceneNumber, format ?? '0');
    case 'scenes':
      return digits(context.sceneCount, format ?? '0');
    case 'counter':
      return digits(Math.floor(Math.max(0, context.time)), format ?? '0');
    case 'timecode': {
      const whole = Math.floor(Math.max(0, context.time));
      const minutes = Math.floor(whole / 60);
      const seconds = pad(whole % 60, 2);
      return format === 'mm:ss'
        ? `${pad(minutes, 2)}:${seconds}`
        : `${minutes}:${seconds}`;
    }
  }
}

const PATTERN = new RegExp(
  `\\{\\{\\s*(${FIELDS.join('|')})(?::([^}]*?))?\\s*\\}\\}`,
  'g',
);

export const hasFields = (text: string) => text.includes('{{');

/** `text` with every known field replaced; unknown braces stay as typed. */
export function resolveFields(text: string, context: FieldContext): string {
  if (!hasFields(text)) return text;
  return text.replace(PATTERN, (_all, field: Field, format?: string) =>
    resolveField(field, format?.trim(), context),
  );
}

/** The token a panel inserts for a field and a format. */
export const fieldToken = (field: Field, format?: string) =>
  format ? `{{${field}:${format}}}` : `{{${field}}}`;

function mapLayers(
  layers: readonly SceneLayer[],
  context: FieldContext,
): { layers: readonly SceneLayer[]; changed: boolean } {
  let changed = false;
  const next = layers.map((layer) => {
    let result: SceneLayer = layer;
    if (layer.type === 'group' && layer.children?.length) {
      const inner = mapLayers(layer.children, context);
      if (inner.changed)
        result = Object.freeze({
          ...(layer as object),
          children: inner.layers,
        }) as unknown as SceneLayer;
    } else if (layer.type === 'text') {
      const text = layer.properties.text;
      if (text?.type === 'string' && hasFields(text.value)) {
        const value = resolveFields(text.value, context);
        if (value !== text.value)
          result = Object.freeze({
            ...(layer as object),
            properties: Object.freeze({
              ...(layer.properties as object),
              text: Object.freeze({ ...(text as object), value }),
            }),
          }) as unknown as SceneLayer;
      }
    }
    changed ||= result !== layer;
    return result;
  });
  return { layers: next, changed };
}

/** The composition as drawn: every text layer's fields resolved. */
export function applyDynamicText<C extends Composition>(
  composition: C,
  context: FieldContext,
): C {
  const mapped = mapLayers(
    composition.layers as unknown as readonly SceneLayer[],
    context,
  );
  return mapped.changed
    ? ({ ...composition, layers: mapped.layers } as C)
    : composition;
}
