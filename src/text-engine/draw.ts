import { layoutStructured, type TextEngineOptions } from './layout';
import {
  measureWithContext,
  textFont,
  type TextStyle,
} from '../render/text-style';
export function drawStructuredText(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  width: number,
  size: number,
  fill: string,
  style: TextStyle,
  options: TextEngineOptions,
) {
  const cells = layoutStructured(
    text,
    width,
    size * style.lineHeight,
    options,
    (s, bold) =>
      measureWithContext(
        context,
        s,
        size,
        bold ? { ...style, weight: 700 } : style,
      ),
  );
  context.save();
  try {
    context.textBaseline = 'top';
    for (const cell of cells) {
      const padding = options.table?.padding ?? (options.table ? 8 : 0);
      const cellStyle = cell.style?.bold ? { ...style, weight: 700 } : style;
      context.font = textFont(cellStyle, size);
      context.direction = cell.direction;
      if (cell.style?.background) {
        context.fillStyle = cell.style.background;
        context.fillRect(cell.x, cell.y, cell.width, cell.height);
      }
      if (options.table) {
        context.strokeStyle = options.table.border ?? '#808080';
        context.lineWidth = options.table.borderWidth ?? 1;
        if (context.lineWidth > 0)
          context.strokeRect(cell.x, cell.y, cell.width, cell.height);
      }
      context.fillStyle = cell.style?.color ?? fill;
      const align =
        cell.style?.align ??
        (style.align === 'center'
          ? 'center'
          : style.align === 'right'
            ? 'end'
            : 'start');
      const right =
        align === 'start'
          ? cell.direction === 'rtl'
          : align === 'end'
            ? cell.direction !== 'rtl'
            : false;
      context.textAlign =
        align === 'center' ? 'center' : right ? 'right' : 'left';
      const x =
        align === 'center'
          ? cell.x + cell.width / 2
          : right
            ? cell.x + cell.width - padding
            : cell.x + padding;
      cell.lines.forEach((line, i) =>
        context.fillText(
          line,
          x,
          cell.y + padding + i * size * style.lineHeight,
        ),
      );
      if (cell.marker) {
        context.textAlign = cell.direction === 'rtl' ? 'left' : 'right';
        context.fillText(
          cell.marker,
          cell.direction === 'rtl' ? cell.x + cell.width + 6 : cell.x - 6,
          cell.y,
        );
      }
    }
  } finally {
    context.restore();
  }
  return cells;
}
