export const source = `({
  id: 'progress-ring',
  version: '1.0.0',
  name: 'Open orbit progress',
  category: 'Data',
  defaultDuration: 6,
  thumbnailTime: 2,
  params: [
    {
      name: 'value',
      label: 'Percent',
      type: 'number',
      default: 76,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      name: 'label',
      label: 'Label',
      type: 'text',
      default: 'COMPLETE',
      maxLength: 28,
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
      name: 'radius',
      label: 'Radius',
      type: 'number',
      default: 130,
      min: 70,
      max: 185,
      step: 1,
    },
    {
      name: 'thickness',
      label: 'Stroke width',
      type: 'number',
      default: 18,
      min: 3,
      max: 40,
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
    const value = params.value * p;
    ctx.lineWidth = params.thickness;
    ctx.lineCap = 'round';
    ctx.strokeStyle = params.ink;
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    ctx.arc(480, 260, params.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (value > 0) {
      ctx.strokeStyle = params.accent;
      ctx.beginPath();
      ctx.arc(
        480,
        260,
        params.radius,
        -Math.PI / 2,
        -Math.PI / 2 + (Math.PI * 2 * value) / 100,
      );
      ctx.stroke();
    }
    ctx.fillStyle = params.ink;
    ctx.textAlign = 'center';
    ctx.font = 'bold 58px Arial';
    ctx.fillText(String(Math.round(value)) + '%', 480, 270);
    ctx.font = '16px Arial';
    ctx.fillText(params.label, 480, 307, params.radius * 1.5);

    ctx.restore();
  },
});`;
