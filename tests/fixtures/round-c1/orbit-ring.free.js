// A Tier C graphic for the Round C1 tests: dots orbiting a ring.
export default {
  meta: {
    id: 'orbit-ring',
    name: 'Orbit ring',
    version: '1.0.0',
    category: 'Motion',
    duration: 4,
    seekable: true,
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
  },
  renderFrame({ t }) {
    const { ctx, params, size } = this;
    ctx.fillStyle = params.color;
    for (let i = 0; i < params.count; i++) {
      const a = t * Math.PI + (i / params.count) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(size.width / 2 + Math.cos(a) * size.height * 0.3, size.height / 2 + Math.sin(a) * size.height * 0.3, size.height * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
