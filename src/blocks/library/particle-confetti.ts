export const source = `({
  id: 'particle-confetti',
  version: '1.0.0',
  name: 'Paper celebration',
  category: 'Particles',
  defaultDuration: 6,
  thumbnailTime: 1.2,
  params: [
    {
      name: 'accent',
      label: 'Accent',
      type: 'color',
      default: '#61e6bf',
    },
    {
      name: 'second',
      label: 'Second color',
      type: 'color',
      default: '#ffcf83',
    },
    {
      name: 'count',
      label: 'Particle count',
      type: 'number',
      default: 64,
      min: 10,
      max: 140,
      step: 1,
    },
    {
      name: 'speed',
      label: 'Launch speed',
      type: 'number',
      default: 170,
      min: 60,
      max: 240,
      step: 1,
    },
    {
      name: 'gravity',
      label: 'Gravity',
      type: 'number',
      default: 75,
      min: 20,
      max: 150,
      step: 1,
    },
    {
      name: 'life',
      label: 'Lifetime seconds',
      type: 'number',
      default: 5,
      min: 2,
      max: 8,
      step: 0.1,
    },
    {
      name: 'size',
      label: 'Paper size',
      type: 'number',
      default: 9,
      min: 3,
      max: 18,
      step: 1,
    },
    {
      name: 'spread',
      label: 'Horizontal spread',
      type: 'number',
      default: 0.8,
      min: 0.2,
      max: 1.4,
      step: 0.1,
    },
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    const age = helpers.clamp(t, 0, params.life);
    ctx.globalAlpha = helpers.clamp(1 - age / params.life);
    for (let i = 0; i < params.count; i++) {
      const r = helpers.rngFor(seed, i * 4);
      const vx = (r - 0.5) * params.speed * params.spread * 2;
      const vy = -params.speed * (0.4 + helpers.rngFor(seed, i * 4 + 1) * 0.6);
      const x = 480 + vx * age;
      const y = 365 + vy * age + (params.gravity * age * age) / 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(helpers.rngFor(seed, i * 4 + 2) * 6 + age * (r - 0.5) * 8);
      ctx.fillStyle = i % 2 === 0 ? params.accent : params.second;
      ctx.fillRect(
        -params.size / 2,
        -params.size / 4,
        params.size,
        params.size * 0.5 * (0.3 + 0.7 * Math.abs(Math.cos(age * 3 + r * 6))),
      );
      ctx.restore();
    }

    ctx.restore();
  },
});`;
