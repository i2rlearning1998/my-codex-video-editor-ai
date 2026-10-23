// FIX4 A10: a real picture of a starter kit item for its card. The item's
// spec (shapes and text, built for a 16:9 frame from the open theme's
// palette) is drawn straight onto a small canvas; nothing is added to the
// project. Pictures are kept per id and palette.
import { kitItems, type SpecItem } from './kit';

const W = 320;
const H = 180;
const cache = new Map<string, string>();

interface Palette {
  readonly background: string;
  readonly text: string;
  readonly accent: string;
}

const num = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** A data URL of the kit item, or null when it cannot be drawn. */
export function kitPreviewUrl(
  id: string,
  palette: Palette,
  sample: string,
): string | null {
  const key = `${id}|${palette.background}|${palette.text}|${palette.accent}|${sample}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const items = kitItems(id, {
    width: 1920,
    height: 1080,
    palette,
    text: sample,
    start: 0,
    duration: 3,
    idPrefix: 'preview',
  });
  if (!items) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#2a2d34';
  ctx.fillRect(0, 0, W, H);
  const scale = W / 1920;
  for (const item of items as SpecItem[]) drawItem(ctx, item, scale);
  try {
    const url = canvas.toDataURL('image/png');
    cache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  item: SpecItem,
  scale: number,
) {
  const transform = (item.transform ?? {}) as Record<string, unknown>;
  const x = num(transform.x) * scale;
  const y = num(transform.y) * scale;
  const width = num(item.width) * scale;
  const height = num(item.height) * scale;
  ctx.save();
  ctx.globalAlpha = num(transform.opacity, 1);
  const fill = typeof item.fill === 'string' ? item.fill : '#ffffff';
  if (item.kind === 'shape') {
    ctx.fillStyle = fill;
    if (item.shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(
        x + width / 2,
        y + height / 2,
        width / 2,
        height / 2,
        0,
        0,
        7,
      );
      ctx.fill();
    } else ctx.fillRect(x, y, width, height);
  } else if (item.kind === 'text' && typeof item.text === 'string') {
    ctx.fillStyle = fill;
    ctx.font = `600 ${Math.max(5, num(item.fontSize, 40) * scale)}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(item.text, x, y, Math.max(1, width));
  }
  ctx.restore();
}
