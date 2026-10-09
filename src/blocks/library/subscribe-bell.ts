export const source = `({
  id: 'subscribe-bell',
  version: '1.0.0',
  name: 'Follow and chime',
  category: 'Calls to action',
  defaultDuration: 6,
  thumbnailTime: 2,
  params: [
    {
      name: 'label',
      label: 'Button text',
      type: 'text',
      default: 'Follow along',
      maxLength: 28,
    },
    {
      name: 'caption',
      label: 'Caption',
      type: 'text',
      default: 'New ideas every week',
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
      label: 'Button fill',
      type: 'color',
      default: '#223850',
    },
    {
      name: 'ring',
      label: 'Ring speed',
      type: 'number',
      default: 4,
      min: 1,
      max: 8,
      step: 0.1,
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
    ctx.globalAlpha = p;
    ctx.translate(0, 20 * (1 - p));
    ctx.fillStyle = params.plate;
    ctx.fillRect(250, 208, 460, 100);
    ctx.fillStyle = params.accent;
    ctx.fillRect(250, 304, 460 * p, 4);
    ctx.fillStyle = params.ink;
    ctx.font = 'bold 30px Arial';
    ctx.fillText(params.label, 278, 270, 330);
    ctx.save();
    ctx.translate(655, 250);
    ctx.rotate(
      Math.sin(t * params.ring * 6) * 0.16 * Math.exp(-Math.max(0, t - 1)),
    );
    ctx.strokeStyle = params.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-18, 15);
    ctx.quadraticCurveTo(-12, 5, -12, -8);
    ctx.bezierCurveTo(-12, -28, 12, -28, 12, -8);
    ctx.quadraticCurveTo(12, 5, 18, 15);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 22, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.font = '18px Arial';
    ctx.fillText(params.caption, 480, 350, 650);

    ctx.restore();
  },
});`;
