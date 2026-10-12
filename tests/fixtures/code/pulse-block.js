({
  id: 'pulse',
  version: '1.0.0',
  name: 'Pulse',
  category: 'Shapes',
  defaultDuration: 2,
  thumbnailTime: 1,
  params: [
    { name: 'color', label: 'Colour', type: 'color', default: '#ff3366' },
    { name: 'radius', label: 'Radius', type: 'number', min: 10, max: 400, step: 1, default: 120 },
  ],
  render(ctx, t, size, params, seed) {
    const r = params.radius * (0.5 + t / 4);
    ctx.fillStyle = params.color;
    ctx.beginPath();
    ctx.arc(size.width / 2, size.height / 2, r * size.width / 1280, 0, Math.PI * 2);
    ctx.fill();
  },
})
