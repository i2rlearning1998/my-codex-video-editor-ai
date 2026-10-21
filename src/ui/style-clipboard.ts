// CV-039 Copy style / Paste style: an in-app, transient style clipboard (no
// history, not saved), applied as one "Paste style" transaction.
import { type Command, type EditorEngine, type TransformValues } from '../core';
import { locateLayer, type RenderSource } from '../render/adapter';
import { drawingOf } from '../render/drawing';
import {
  brushSizeCommands,
  colorCommand,
  fontSizeCommand,
  toolbarKind,
} from './context-toolbar';
import { selectionRoots } from './editing';
import type { EditorSession } from './session';
import { textPropertyCommand } from './text-box-commands';
import { buildTransformCommands } from './transform-commands';

export interface CopiedStyle {
  readonly opacity: number;
  readonly color?: string;
  readonly fontSize?: number;
  readonly strokeWidth?: number;
  /** FINAL3 (Canva format painter): a text's whole formatting. */
  readonly text?: Readonly<Record<string, string | number | boolean>>;
}
/** The text formatting the format painter carries from text to text. */
const TEXT_FORMAT_KEYS = [
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'fontSource',
  'textDecoration',
  'textCase',
  'textAlign',
  'textAnchor',
  'lineHeight',
  'letterSpacing',
  'paragraphSpacing',
  'fontKerning',
  'fontLigatures',
  'textEffect',
  'textCurve',
  'textGradient',
  'listStyle',
] as const;
/** Kept off the target when the copied text has none. */
const TEXT_FORMAT_CLEAR: Partial<Record<string, string | number>> = {
  textEffect: '',
  textGradient: '',
  textCurve: 0,
};
let copied: CopiedStyle | null = null;

export const hasStyle = () => copied !== null;
export const copiedStyle = () => copied;
export function clearStyle(): void {
  copied = null;
}
export const canCopyStyle = (session: EditorSession) =>
  session.selectedIds.length === 1 && session.selectedId !== null;

/** Opacity always; color, text size and brush size where the layer has them. */
export function styleOf(source: RenderSource, id: string): CopiedStyle | null {
  const layer = locateLayer(source.composition.layers, id)?.layer;
  if (!layer) return null;
  const kind = toolbarKind(layer);
  const drawing = drawingOf(layer);
  const color =
    kind === 'drawing'
      ? layer.properties.stroke
      : kind === 'text' || kind === 'shape'
        ? layer.properties.fill
        : undefined;
  const fontSize = layer.properties.fontSize;
  return Object.freeze({
    opacity: layer.transform.opacity.value,
    ...(color?.type === 'color' ? { color: color.value.slice(0, 7) } : {}),
    ...(kind === 'text' && fontSize?.type === 'number'
      ? { fontSize: fontSize.value }
      : {}),
    ...(drawing && drawing !== 'invalid' ? { strokeWidth: drawing.width } : {}),
    ...(layer.type === 'text' ? { text: textFormatOf(layer) } : {}),
  });
}

function textFormatOf(layer: {
  properties: Readonly<Record<string, { type: string; value: unknown }>>;
}) {
  const format: Record<string, string | number | boolean> = {};
  for (const key of TEXT_FORMAT_KEYS) {
    const property = layer.properties[key];
    if (
      property &&
      (typeof property.value === 'string' ||
        typeof property.value === 'number' ||
        typeof property.value === 'boolean')
    )
      format[key] = property.value;
  }
  return Object.freeze(format);
}

export function copyStyle(session: EditorSession): void {
  if (!canCopyStyle(session)) return;
  copied = styleOf(session.source, session.selectedId!);
}

export function pasteStyleCommands(
  source: RenderSource,
  ids: readonly string[],
  style: CopiedStyle,
): Command[] {
  const compositionId = source.composition.id;
  const time = source.currentTime;
  return selectionRoots(source, ids).flatMap((layer) => [
    ...buildTransformCommands(
      compositionId,
      layer,
      {
        ...(layer.transform as TransformValues),
        opacity: { value: style.opacity },
      },
      undefined,
      time,
    ),
    ...(style.color
      ? [colorCommand(compositionId, layer, style.color, time)]
      : []
    ).filter((command): command is Command => !!command),
    ...(style.fontSize !== undefined
      ? [fontSizeCommand(compositionId, layer, style.fontSize, time)]
      : []
    ).filter((command): command is Command => !!command),
    ...(style.strokeWidth !== undefined
      ? brushSizeCommands(compositionId, layer, style.strokeWidth)
      : []),
    ...(style.text && layer.type === 'text'
      ? pasteTextFormat(compositionId, layer, style.text)
      : []),
  ]);
}

function pasteTextFormat(
  compositionId: string,
  layer: Parameters<typeof textPropertyCommand>[1],
  format: Readonly<Record<string, string | number | boolean>>,
): Command[] {
  const commands: Command[] = [];
  for (const key of TEXT_FORMAT_KEYS) {
    const value =
      format[key] ??
      (layer.properties[key] ? TEXT_FORMAT_CLEAR[key] : undefined);
    if (value === undefined) continue;
    try {
      const command = textPropertyCommand(compositionId, layer, key, value);
      if (command) commands.push(command);
    } catch {
      // A property of another type on the target is left as it is.
    }
  }
  return commands;
}

export function pasteStyle(engine: EditorEngine, session: EditorSession): void {
  if (!copied || !session.selectedIds.length) return;
  const commands = pasteStyleCommands(
    session.source,
    session.selectedIds,
    copied,
  );
  if (commands.length) engine.commands.transaction('Paste style', commands);
}
