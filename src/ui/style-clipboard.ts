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
import { buildTransformCommands } from './transform-commands';

export interface CopiedStyle {
  readonly opacity: number;
  readonly color?: string;
  readonly fontSize?: number;
  readonly strokeWidth?: number;
}
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
  });
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
  ]);
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
