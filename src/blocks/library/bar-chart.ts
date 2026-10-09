export const source = `({
  id: 'bar-chart',
  version: '1.0.0',
  name: 'Three-way comparison',
  category: 'Data',
  defaultDuration: 6,
  thumbnailTime: 2,
  params: [
    {
      name: 'title',
      label: 'Heading',
      type: 'text',
      default: 'Quarterly progress',
      maxLength: 40,
    },
    {
      name: 'first',
      label: 'A value',
      type: 'number',
      default: 42,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      name: 'second',
      label: 'B value',
      type: 'number',
      default: 68,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      name: 'third',
      label: 'C value',
      type: 'number',
      default: 91,
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
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    const p = helpers.ease('ease-out', t / params.seconds);
    ctx.fillStyle = params.ink;
    ctx.font = 'bold 28px Arial';
    ctx.fillText(params.title, 130, 115, 700);
    ctx.globalAlpha = 0.3;
    ctx.fillRect(150, 400, 660, 2);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const value =
        i === 0 ? params.first : i === 1 ? params.second : params.third;
      const h = value * 2.2 * p;
      const x = 190 + i * 225;
      ctx.fillStyle = params.accent;
      ctx.globalAlpha = 0.6 + i * 0.2;
      ctx.fillRect(x, 400 - h, 110, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = params.ink;
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(value * p)), x + 55, 384 - h);
      ctx.font = '18px Arial';
      ctx.fillText(i === 0 ? 'A' : i === 1 ? 'B' : 'C', x + 55, 433);
    }

    ctx.restore();
  },
});`;
