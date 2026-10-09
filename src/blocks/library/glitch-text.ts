export const source = `({
  id: 'glitch-text',
  version: '1.0.0',
  name: 'Signal offset title',
  category: 'Typography',
  defaultDuration: 6,
  thumbnailTime: 2,
  params: [
    {
      name: 'text',
      label: 'Text',
      type: 'text',
      default: 'NEW FREQUENCY',
      maxLength: 40,
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
      name: 'echo',
      label: 'Echo color',
      type: 'color',
      default: '#ee7fa5',
    },
    {
      name: 'amount',
      label: 'Offset pixels',
      type: 'number',
      default: 12,
      min: 0,
      max: 35,
      step: 1,
    },
    {
      name: 'speed',
      label: 'Changes per second',
      type: 'number',
      default: 8,
      min: 1,
      max: 20,
      step: 1,
    },
    {
      name: 'size',
      label: 'Text size',
      type: 'number',
      default: 60,
      min: 24,
      max: 88,
      step: 1,
    },
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    const tick = Math.floor(Math.max(0, t) * params.speed);
    const offset = (helpers.rngFor(seed, tick) - 0.5) * params.amount;
    ctx.font = 'bold ' + params.size + 'px Arial';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = params.accent;
    ctx.fillText(params.text, 480 + offset, 278 - 3, 800);
    ctx.fillStyle = params.echo;
    ctx.fillText(params.text, 480 - offset, 278 + 3, 800);
    ctx.globalAlpha = 1;
    ctx.fillStyle = params.ink;
    ctx.fillText(params.text, 480, 278, 800);
    for (let i = 0; i < 5; i++) {
      const r = helpers.rngFor(seed, tick * 9 + i + 17);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = params.accent;
      ctx.fillRect(110 + r * 640, 200 + i * 24, params.amount * (0.5 + r), 2);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  },
});`;
