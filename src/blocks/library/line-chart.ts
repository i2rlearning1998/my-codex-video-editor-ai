export const source = `({
  id: 'line-chart',
  version: '1.0.0',
  name: 'Trace of progress',
  category: 'Data',
  defaultDuration: 6,
  thumbnailTime: 2,
  params: [
    {
      name: 'title',
      label: 'Heading',
      type: 'text',
      default: 'A steady climb',
      maxLength: 40,
    },
    {
      name: 'start',
      label: 'Start value',
      type: 'number',
      default: 20,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      name: 'middle',
      label: 'Middle value',
      type: 'number',
      default: 65,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      name: 'end',
      label: 'End value',
      type: 'number',
      default: 85,
      min: 0,
      max: 100,
      step: 1,
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
      name: 'seconds',
      label: 'Reveal seconds',
      type: 'number',
      default: 1.2,
      min: 0.2,
      max: 5,
      step: 0.1,
    },
    {
      name: 'thickness',
      label: 'Line width',
      type: 'number',
      default: 5,
      min: 1,
      max: 12,
      step: 1,
    },
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    const p = helpers.ease('ease-in-out', t / params.seconds);
    ctx.fillStyle = params.ink;
    ctx.font = 'bold 28px Arial';
    ctx.fillText(params.title, 130, 105, 700);
    ctx.strokeStyle = params.ink;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(150, 145);
    ctx.lineTo(150, 405);
    ctx.lineTo(820, 405);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = params.accent;
    ctx.lineWidth = params.thickness;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(150, 405 - params.start * 2.5);
    for (let i = 1; i <= 80; i++) {
      const f = Math.min(p, i / 80);
      const v =
        f < 0.5
          ? helpers.lerp(params.start, params.middle, f * 2)
          : helpers.lerp(params.middle, params.end, (f - 0.5) * 2);
      ctx.lineTo(150 + 670 * f, 405 - v * 2.5);
      if (i / 80 >= p) break;
    }
    ctx.stroke();
    const last =
      p < 0.5
        ? helpers.lerp(params.start, params.middle, p * 2)
        : helpers.lerp(params.middle, params.end, (p - 0.5) * 2);
    ctx.fillStyle = params.accent;
    ctx.beginPath();
    ctx.arc(150 + 670 * p, 405 - last * 2.5, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = params.ink;
    ctx.font = '18px Arial';
    ctx.fillText('0', 118, 410);
    ctx.fillText('100', 108, 159);

    ctx.restore();
  },
});`;
