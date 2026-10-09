export const source = `({
  id: 'counter-sparkline',
  version: '1.0.0',
  name: 'Metric with a pulse',
  category: 'Data',
  defaultDuration: 6,
  thumbnailTime: 2,
  params: [
    {
      name: 'from',
      label: 'Start',
      type: 'number',
      default: 0,
      min: -100000,
      max: 100000,
      step: 1,
    },
    {
      name: 'to',
      label: 'Target',
      type: 'number',
      default: 2480,
      min: -100000,
      max: 100000,
      step: 1,
    },
    {
      name: 'label',
      label: 'Metric',
      type: 'text',
      default: 'WEEKLY READERS',
      maxLength: 35,
    },
    {
      name: 'suffix',
      label: 'Suffix',
      type: 'text',
      default: '',
      maxLength: 10,
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
      name: 'volatility',
      label: 'Sparkline variation',
      type: 'number',
      default: 24,
      min: 0,
      max: 60,
      step: 1,
    },
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    const p = helpers.ease('ease-out', t / params.seconds);
    ctx.fillStyle = params.ink;
    ctx.textAlign = 'center';
    ctx.font = '16px Arial';
    ctx.fillText(params.label, 480, 166, 700);
    ctx.font = 'bold 72px Arial';
    ctx.fillText(
      String(Math.round(helpers.lerp(params.from, params.to, p))) +
        params.suffix,
      480,
      263,
      700,
    );
    ctx.strokeStyle = params.accent;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const x = 180 + i * 18.75;
      const y =
        376 - i * 1.8 + (helpers.rngFor(seed, i) - 0.5) * params.volatility;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      if (i / 32 >= p) break;
    }
    ctx.stroke();
    ctx.fillStyle = params.accent;
    ctx.font = '14px Arial';
    ctx.fillText('ILLUSTRATIVE TREND', 480, 427);

    ctx.restore();
  },
});`;
