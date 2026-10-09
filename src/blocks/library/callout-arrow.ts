export const source = `({
  id: 'callout-arrow',
  version: '1.0.0',
  name: 'Bent path callout',
  category: 'Annotations',
  defaultDuration: 6,
  thumbnailTime: 2,
  params: [
    {
      name: 'label',
      label: 'Label',
      type: 'text',
      default: 'Look closer',
      maxLength: 35,
    },
    {
      name: 'ink',
      label: 'Ink',
      type: 'color',
      default: '#f4f3ed',
    },
    {
      name: 'accent',
      label: 'Accent',
      type: 'color',
      default: '#61e6bf',
    },
    {
      name: 'targetX',
      label: 'Target X percent',
      type: 'number',
      default: 72,
      min: 15,
      max: 90,
      step: 1,
    },
    {
      name: 'targetY',
      label: 'Target Y percent',
      type: 'number',
      default: 32,
      min: 12,
      max: 88,
      step: 1,
    },
    {
      name: 'thickness',
      label: 'Stroke width',
      type: 'number',
      default: 4,
      min: 1,
      max: 12,
      step: 1,
    },
    {
      name: 'seconds',
      label: 'Reveal seconds',
      type: 'number',
      default: 1.2,
      min: 0.2,
      max: 5,
      step: 0.1,
    },
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    const p = helpers.ease('ease-out', t / params.seconds);
    const x = params.targetX * 9.6;
    const y = params.targetY * 5.4;
    ctx.globalAlpha = p;
    ctx.fillStyle = params.ink;
    ctx.font = 'bold 28px Arial';
    ctx.fillText(params.label, 115, 400, 330);
    ctx.strokeStyle = params.accent;
    ctx.lineWidth = params.thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(160, 355);
    ctx.lineTo(160, 310);
    ctx.lineTo(x, y);
    ctx.stroke();
    const angle = Math.atan2(y - 310, x - 160);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-19, -10);
    ctx.lineTo(0, 0);
    ctx.lineTo(-19, 10);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 0.2 * p;
    ctx.beginPath();
    ctx.arc(x, y, 22 + 4 * Math.sin(t * 3), 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  },
});`;
