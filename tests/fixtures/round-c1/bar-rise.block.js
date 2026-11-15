({
  id: 'bar-rise',
  version: '1.0.0',
  name: 'Rising bars',
  category: 'Data',
  defaultDuration: 4,
  thumbnailTime: 2,
  params: [
    { name: 'color', label: 'Bar colour', type: 'color', default: '#ffb703' },
    { name: 'bars', label: 'Bars', type: 'number', min: 2, max: 12, step: 1, default: 5 },
    { name: 'speed', label: 'Speed', type: 'number', min: 0.2, max: 4, step: 0.1, default: 1 },
  ],
  render(ctx, t, size, params, seed) {
    const n = Math.round(params.bars);
    const w = size.width * 0.6 / n;
    ctx.fillStyle = params.color;
    for (let i = 0; i < n; i++) {
      const grow = Math.min(1, Math.max(0, t * params.speed - i * 0.15));
      const h = size.height * 0.5 * grow * (0.4 + 0.6 * ((i + 1) / n));
      ctx.fillRect(size.width * 0.2 + i * w + w * 0.1, size.height * 0.8 - h, w * 0.8, h);
    }
  },
})
