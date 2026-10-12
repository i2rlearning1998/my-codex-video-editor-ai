// A Tier C test animation that takes about 40 ms per frame (to watch and
// cancel a bake). Seekable: any frame is a pure function of t.
export default {
  meta: {
    id: 'slow-bar',
    name: 'Slow bar',
    version: '1.0.0',
    category: 'Test',
    duration: 3,
    seekable: true,
    keepFrame: false,
    thumbnailTime: 1.5,
    libs: [],
    params: [{ name: 'color', label: 'Colour', type: 'color', default: '#3366ff' }],
  },
  init({ ctx, params, size }) {
    this.ctx = ctx;
    this.params = params;
    this.size = size;
  },
  renderFrame({ t }) {
    const until = performance.now() + 40;
    while (performance.now() < until) {
      // Busy: a heavy frame.
    }
    const { ctx, params, size } = this;
    ctx.fillStyle = params.color;
    ctx.fillRect(0, size.height * 0.4, (size.width * t) / 3, size.height * 0.2);
  },
};
