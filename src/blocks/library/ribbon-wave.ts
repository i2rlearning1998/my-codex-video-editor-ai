export const source = `({
  id: 'ribbon-wave',
  version: '1.0.0',
  name: 'Tidal ribbons',
  category: 'Background accents',
  defaultDuration: 6,
  thumbnailTime: 2,
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
      default: '#867bed',
    },
    {
      name: 'amplitude',
      label: 'Wave height',
      type: 'number',
      default: 48,
      min: 5,
      max: 100,
      step: 1,
    },
    {
      name: 'speed',
      label: 'Wave speed',
      type: 'number',
      default: 0.7,
      min: 0.1,
      max: 3,
      step: 0.1,
    },
    {
      name: 'bands',
      label: 'Ribbon count',
      type: 'number',
      default: 5,
      min: 2,
      max: 8,
      step: 1,
    },
    {
      name: 'thickness',
      label: 'Ribbon width',
      type: 'number',
      default: 16,
      min: 3,
      max: 35,
      step: 1,
    },
    {
      name: 'opacity',
      label: 'Opacity',
      type: 'number',
      default: 0.6,
      min: 0.1,
      max: 1,
      step: 0.05,
    },
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    ctx.lineWidth = params.thickness;
    ctx.lineCap = 'round';
    for (let i = 0; i < params.bands; i++) {
      ctx.strokeStyle = i % 2 === 0 ? params.accent : params.second;
      ctx.globalAlpha = params.opacity * (0.5 + i / (params.bands * 2));
      ctx.beginPath();
      for (let j = 0; j <= 80; j++) {
        const x = 60 + j * 10.5;
        const envelope = Math.sin((j / 80) * Math.PI);
        const y =
          180 +
          i * 28 +
          Math.sin((j / 80) * Math.PI * 2 + t * params.speed + i * 0.5) *
            params.amplitude *
            envelope;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.restore();
  },
});`;
