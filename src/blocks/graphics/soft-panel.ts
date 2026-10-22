// "Soft panel": a flat colour panel over the top of the frame whose lower edge
// melts away. It is the clean top half the diagram sits on while a picture
// shows underneath (the split layout of explainer videos).
import { defineBlock } from '../render';
import { N, S, col, num } from './ink';

export const softPanel = defineBlock(
  {
    id: 'soft-panel',
    version: '1.0.0',
    name: 'Soft panel',
    category: 'Education',
    defaultDuration: 6,
    fps: 1,
    thumbnailTime: 1,
    params: [
      col('color', 'Colour', '#f1ede4'),
      num('height', 'Solid height % of frame', 0, 100, 0.5, 38),
      num('soft', 'Soft edge % of frame', 0, 60, 0.5, 9),
      num('opacity', 'Opacity', 0, 1, 0.01, 1),
    ],
  },
  (ctx, _t, size, p) => {
    const { width: w, height: h } = size,
      solid = (N(p, 'height') / 100) * h,
      soft = (N(p, 'soft') / 100) * h;
    ctx.globalAlpha = N(p, 'opacity');
    ctx.fillStyle = S(p, 'color');
    ctx.fillRect(0, 0, w, solid);
    if (soft > 0) {
      const g = ctx.createLinearGradient(0, solid, 0, solid + soft),
        c = S(p, 'color');
      g.addColorStop(0, c);
      g.addColorStop(1, c + '00');
      ctx.fillStyle = g;
      ctx.fillRect(0, solid, w, soft);
    }
  },
);
