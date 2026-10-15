// A Tier C free-code animation: stateful (each frame moves on from the last).
export default {
  meta: {
    id: 'orbit',
    name: 'Orbit',
    version: '1.0.0',
    category: 'Motion',
    duration: 2,
    seekable: false,
    keepFrame: false,
    thumbnailTime: 1,
    libs: [],
    params: [
      { name: 'color', label: 'Colour', type: 'color', default: '#22cc88' },
      { name: 'count', label: 'Dots', type: 'number', min: 1, max: 40, step: 1, default: 8 },
    ],
  },
  init({ ctx, params, size }) {
    this.ctx = ctx;
    this.params = params;
    this.size = size;
    this.angle = 0;
  },
  renderFrame({ dt }) {
    const { ctx, params, size } = this;
    this.angle += dt * Math.PI;
    ctx.fillStyle = params.color;
    for (let i = 0; i < params.count; i++) {
      const a = this.angle + (i / params.count) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(
        size.width / 2 + Math.cos(a) * size.height * 0.3,
        size.height / 2 + Math.sin(a) * size.height * 0.3,
        size.height * 0.04,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  },
};
