export const source = `({
  id: 'kinetic-quote',
  version: '1.0.0',
  name: 'Measured words',
  category: 'Typography',
  defaultDuration: 6,
  thumbnailTime: 2,
  params: [
    {
      name: 'text',
      label: 'Quote',
      type: 'text',
      default: 'Make room for wonder',
      maxLength: 52,
    },
    {
      name: 'author',
      label: 'Attribution',
      type: 'text',
      default: 'A small reminder',
      maxLength: 42,
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
      name: 'size',
      label: 'Text size',
      type: 'number',
      default: 48,
      min: 24,
      max: 70,
      step: 1,
    },
    {
      name: 'stagger',
      label: 'Letter delay',
      type: 'number',
      default: 0.035,
      min: 0,
      max: 0.12,
      step: 0.005,
    },
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    ctx.fillStyle = params.accent;
    ctx.fillRect(112, 156, 64, 5);
    ctx.font = 'bold ' + params.size + 'px Arial';
    ctx.textAlign = 'center';
    const gap = Math.min(
      params.size * 0.61,
      730 / Math.max(1, params.text.length),
    );
    for (let i = 0; i < params.text.length; i++) {
      const age = t - i * params.stagger;
      const q = helpers.clamp(age / params.seconds);
      const bounce = helpers.spring(Math.max(0, age), 2, 0.72);
      ctx.globalAlpha = q;
      ctx.fillStyle = params.ink;
      ctx.fillText(
        params.text.charAt(i),
        480 + (i - (params.text.length - 1) / 2) * gap,
        270 + 44 * (1 - bounce),
        gap * 1.4,
      );
    }
    ctx.globalAlpha = helpers.clamp((t - params.seconds) / 0.5);
    ctx.fillStyle = params.accent;
    ctx.font = '18px Arial';
    ctx.fillText(params.author, 480, 340, 730);

    ctx.restore();
  },
});`;
