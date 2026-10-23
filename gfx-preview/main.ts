import { getBlock } from '../src/blocks';
(window as any).renderSheet = (
  id: string,
  params: Record<string, any>,
  times: number[],
  w = 360,
  h = 640,
) => {
  const b = getBlock(id)!;
  const out = document.getElementById('out')!;
  out.innerHTML = '';
  out.style.cssText = 'display:flex;flex-wrap:wrap;width:' + w * 6 + 'px';
  for (const t of times) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f1ede4';
    ctx.fillRect(0, 0, w, h);
    const o = new OffscreenCanvas(w, h);
    b.render(o.getContext('2d')!, t, { width: w, height: h }, params as any, 1);
    ctx.drawImage(o, 0, 0);
    ctx.fillStyle = 'red';
    ctx.font = '14px sans-serif';
    ctx.fillText(t + 's', 6, 16);
    out.appendChild(c);
  }
  return 'ok';
};
