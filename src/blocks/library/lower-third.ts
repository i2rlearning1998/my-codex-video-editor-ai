export const source = `({
  id: 'lower-third',
  version: '1.0.0',
  name: 'Offset lower third',
  category: 'Titles',
  defaultDuration: 6,
  thumbnailTime: 2,
  params: [
    {
      name: 'title',
      label: 'Name',
      type: 'text',
      default: 'Alex Morgan',
      maxLength: 32,
    },
    {
      name: 'subtitle',
      label: 'Role',
      type: 'text',
      default: 'Design researcher',
      maxLength: 44,
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
      name: 'plate',
      label: 'Plate',
      type: 'color',
      default: '#182b40',
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
      name: 'width',
      label: 'Plate width',
      type: 'number',
      default: 540,
      min: 400,
      max: 820,
      step: 1,
    },
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    const p = helpers.ease('ease-out', t / params.seconds);
    ctx.translate(-80 * (1 - p), 0);
    ctx.globalAlpha = p;
    ctx.fillStyle = params.plate;
    ctx.fillRect(64, 372, params.width, 108);
    ctx.fillStyle = params.accent;
    ctx.fillRect(64, 372, 6, 108);
    ctx.fillRect(80, 360, 64 * p, 4);
    ctx.fillStyle = params.ink;
    ctx.font = 'bold 32px Arial';
    ctx.fillText(params.title, 88, 415, params.width - 48);
    ctx.font = '19px Arial';
    ctx.globalAlpha = p * 0.78;
    ctx.fillText(params.subtitle, 88, 452, params.width - 48);

    ctx.restore();
  },
});`;
