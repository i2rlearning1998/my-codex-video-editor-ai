export const source = `({
  id: 'countdown',
  version: '1.0.0',
  name: 'Quiet countdown',
  category: 'Time',
  defaultDuration: 8,
  thumbnailTime: 2,
  params: [
    {
      name: 'seconds',
      label: 'Countdown seconds',
      type: 'number',
      default: 5,
      min: 1,
      max: 30,
      step: 1,
    },
    {
      name: 'finish',
      label: 'Finish word',
      type: 'text',
      default: 'GO',
      maxLength: 16,
    },
    {
      name: 'label',
      label: 'Label',
      type: 'text',
      default: 'STARTING IN',
      maxLength: 28,
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
      name: 'radius',
      label: 'Radius',
      type: 'number',
      default: 145,
      min: 80,
      max: 190,
      step: 1,
    },
    {
      name: 'thickness',
      label: 'Stroke width',
      type: 'number',
      default: 6,
      min: 1,
      max: 20,
      step: 1,
    },
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    const elapsed = helpers.clamp(t, 0, params.seconds);
    const left = Math.max(0, Math.ceil(params.seconds - elapsed));
    ctx.strokeStyle = params.accent;
    ctx.lineWidth = params.thickness;
    ctx.beginPath();
    ctx.arc(
      480,
      275,
      params.radius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * (1 - elapsed / params.seconds),
    );
    ctx.stroke();
    ctx.fillStyle = params.ink;
    ctx.textAlign = 'center';
    ctx.font = '16px Arial';
    ctx.fillText(params.label, 480, 220, 250);
    ctx.font = 'bold 86px Arial';
    ctx.fillText(left > 0 ? String(left) : params.finish, 480, 321, 280);
    ctx.fillStyle = params.accent;
    ctx.beginPath();
    ctx.arc(480, 275 - params.radius, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  },
});`;
