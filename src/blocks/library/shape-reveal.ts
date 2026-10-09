export const source = `({
  id: 'shape-reveal',
  version: '1.0.0',
  name: 'Folded compass mark',
  category: 'Shapes',
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
      default: '#a6a1ff',
    },
    {
      name: 'size',
      label: 'Mark size',
      type: 'number',
      default: 130,
      min: 50,
      max: 190,
      step: 1,
    },
    {
      name: 'turn',
      label: 'Turn degrees',
      type: 'number',
      default: 90,
      min: -180,
      max: 180,
      step: 1,
    },
    {
      name: 'gap',
      label: 'Centre gap',
      type: 'number',
      default: 12,
      min: 2,
      max: 35,
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
    {
      name: 'stroke',
      label: 'Outline width',
      type: 'number',
      default: 2,
      min: 1,
      max: 8,
      step: 1,
    },
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    const p = helpers.ease('ease-out', t / params.seconds);
    ctx.translate(480, 270);
    ctx.rotate((params.turn * (1 - p) * Math.PI) / 180);
    ctx.globalAlpha = p;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.translate(0, (1 - p) * 45);
      ctx.fillStyle = i % 2 === 0 ? params.accent : params.second;
      ctx.beginPath();
      ctx.moveTo(params.gap, -params.gap);
      ctx.lineTo(params.size, -params.size * 0.35);
      ctx.lineTo(params.size * 0.45, -params.size);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = params.second;
    ctx.lineWidth = params.stroke;
    ctx.beginPath();
    ctx.arc(0, 0, params.gap * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  },
});`;
