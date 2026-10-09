export const source = `({
  id: 'typewriter-title',
  version: '1.0.0',
  name: 'Cursor note',
  category: 'Typography',
  defaultDuration: 6,
  thumbnailTime: 2,
  params: [
    {
      name: 'text',
      label: 'Title',
      type: 'text',
      default: 'Something worth saying',
      maxLength: 64,
    },
    {
      name: 'caption',
      label: 'Caption',
      type: 'text',
      default: 'FIELD NOTES / 01',
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
      name: 'rate',
      label: 'Characters per second',
      type: 'number',
      default: 12,
      min: 2,
      max: 40,
      step: 1,
    },
    {
      name: 'size',
      label: 'Text size',
      type: 'number',
      default: 42,
      min: 20,
      max: 64,
      step: 1,
    },
    {
      name: 'blink',
      label: 'Cursor frequency',
      type: 'number',
      default: 2,
      min: 0.5,
      max: 5,
      step: 0.1,
    },
  ],
  render(ctx, t, size, params, seed) {
    ctx.save();
    ctx.scale(size.width / 960, size.height / 540);

    const count = Math.min(
      params.text.length,
      Math.floor(Math.max(0, t) * params.rate),
    );
    let shown = '';
    for (let i = 0; i < count; i++) shown += params.text.charAt(i);
    ctx.fillStyle = params.accent;
    ctx.font = '16px Arial';
    ctx.fillText(params.caption, 100, 184, 760);
    ctx.fillStyle = params.ink;
    ctx.font = 'bold ' + params.size + 'px Arial';
    ctx.fillText(shown, 100, 274, 740);
    const cursorX = 100 + Math.min(740, ctx.measureText(shown).width);
    if (Math.floor(Math.max(0, t) * params.blink * 2) % 2 === 0) {
      ctx.fillStyle = params.accent;
      ctx.fillRect(cursorX + 5, 238, 3, params.size);
    }
    ctx.globalAlpha = 0.3;
    ctx.fillRect(100, 314, 760, 1);

    ctx.restore();
  },
});`;
