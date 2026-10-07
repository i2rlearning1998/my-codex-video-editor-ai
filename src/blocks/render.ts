import type {
  BlockInfo,
  BlockModule,
  DrawContext,
  Size,
  Params,
} from './types';
import { validateInfo, validateParams } from './params';
export function validateFrame(t: number, size: Size, seed: number): void {
  if (
    !Number.isFinite(t) ||
    Math.abs(t) > 86400 ||
    !Number.isSafeInteger(seed) ||
    ![size.width, size.height].every(
      (n) => Number.isInteger(n) && n > 0 && n <= 4096,
    ) ||
    size.width * size.height > 8388608
  )
    throw new RangeError('Invalid time, seed or frame size');
}
/** Owns a transparent full-canvas frame; caller uses a dedicated scratch canvas. */
export function frame(ctx: DrawContext, size: Size, draw: () => void): void {
  ctx.save();
  try {
    ctx.resetTransform();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowColor = '#00000000';
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.setLineDash([]);
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.beginPath();
    ctx.rect(0, 0, size.width, size.height);
    ctx.clip();
    draw();
  } finally {
    ctx.restore();
    ctx.beginPath();
  }
}
export function defineBlock(
  info: BlockInfo,
  draw: BlockModule['render'],
): BlockModule {
  validateInfo(info);
  return Object.freeze({
    ...info,
    render(ctx: DrawContext, t: number, size: Size, raw: Params, seed: number) {
      validateFrame(t, size, seed);
      const params = validateParams(info.params, raw);
      frame(ctx, size, () =>
        draw(ctx, t, Object.freeze({ ...size }), params, seed),
      );
    },
  });
}
