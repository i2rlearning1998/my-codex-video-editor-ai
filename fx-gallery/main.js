import {
  adjustments,
  effects,
  filters,
  transitions,
  defaults,
  renderThumbnail,
  surface,
  resize,
} from '../src/fx/index.ts';
import { makeSample } from './samples.js';
const $ = (id) => document.getElementById(id),
  all = [...adjustments, ...effects, ...filters, ...transitions];
let src = makeSample('scene'),
  to = makeSample('portrait'),
  params = {},
  playing = false,
  last = 0;
const put = (canvas, s) => {
  canvas.width = s.width;
  canvas.height = s.height;
  canvas
    .getContext('2d')
    .putImageData(
      new ImageData(new Uint8ClampedArray(s.data), s.width, s.height),
      0,
      0,
    );
};
const option = (value, label) => {
  const e = document.createElement('option');
  e.value = value;
  e.textContent = label;
  return e;
};
const chosen = () => all.find((d) => d.id === $('item').value);
function render() {
  try {
    const def = chosen();
    if (!def) return;
    const t = +$('time').value,
      dst = surface(src.width, src.height),
      ctx = {
        time: t * 4,
        duration: 4,
        seed: 42,
        width: src.width,
        height: src.height,
      };
    const start = performance.now();
    if (def.kind === 'transition') def.apply(src, to, dst, t, params, ctx);
    else def.apply(src, dst, params, ctx);
    $('status').textContent =
      `${def.id} · ${(performance.now() - start).toFixed(1)} ms · ${src.width} × ${src.height}`;
    $('clock').textContent =
      def.kind === 'transition'
        ? `${Math.round(t * 100)}%`
        : `${(t * 4).toFixed(2)} s`;
    put($('source'), src);
    put($('result'), dst);
  } catch (e) {
    $('status').textContent = e.message;
  }
}
function select() {
  params = defaults(chosen());
  $('params').replaceChildren();
  for (const p of chosen().params) {
    const label = document.createElement('label');
    label.append(p.label + ' ');
    const input = document.createElement(
      p.type === 'select' ? 'select' : 'input',
    );
    if (p.type === 'select')
      for (const value of p.options) input.append(option(value, value));
    else
      input.type =
        p.type === 'boolean'
          ? 'checkbox'
          : p.type === 'color'
            ? 'color'
            : 'range';
    input.min = p.min;
    input.max = p.max;
    input.step = p.max - p.min > 20 ? '1' : '.01';
    input.value = p.default;
    input.checked = p.default === true;
    const value = document.createElement('output');
    value.textContent = String(p.default);
    input.oninput = () => {
      params[p.name] =
        p.type === 'number'
          ? +input.value
          : p.type === 'boolean'
            ? input.checked
            : input.value;
      value.textContent = String(params[p.name]);
      render();
    };
    label.append(input, value);
    $('params').append(label);
  }
  render();
}
function category() {
  const defs = all.filter((d) => d.category === $('category').value);
  $('item').replaceChildren(...defs.map((d) => option(d.id, d.name)));
  $('grid').replaceChildren();
  for (const def of defs) {
    const button = document.createElement('button'),
      canvas = document.createElement('canvas');
    put(canvas, renderThumbnail(def, src, 160, 90));
    button.append(canvas, def.name);
    button.onclick = () => {
      $('item').value = def.id;
      select();
    };
    $('grid').append(button);
  }
  select();
}
for (const c of new Set(all.map((d) => d.category)))
  $('category').append(option(c, c));
$('category').onchange = category;
$('item').onchange = select;
$('reset').onclick = select;
$('time').oninput = render;
$('sample').onchange = () => {
  src = makeSample($('sample').value);
  to = makeSample($('sample').value === 'scene' ? 'portrait' : 'scene');
  category();
};
$('play').onclick = () => {
  playing = !playing;
  $('play').textContent = playing ? 'Pause' : 'Play';
  last = 0;
  if (playing) requestAnimationFrame(tick);
};
function tick(now) {
  if (!playing) return;
  if (last) $('time').value = (+$('time').value + (now - last) / 4000) % 1;
  last = now;
  render();
  requestAnimationFrame(tick);
}
async function load(file) {
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file);
    const c = document.createElement('canvas'),
      scale = Math.min(1, 960 / bitmap.width, 540 / bitmap.height);
    c.width = Math.max(1, Math.round(bitmap.width * scale));
    c.height = Math.max(1, Math.round(bitmap.height * scale));
    c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
    bitmap.close();
    src = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    to = resize(makeSample('portrait'), src.width, src.height);
    category();
  } catch (e) {
    $('status').textContent = 'Image could not be decoded: ' + e.message;
  }
}
$('file').onchange = () => load($('file').files[0]);
$('drop').ondragover = (e) => e.preventDefault();
$('drop').ondrop = (e) => {
  e.preventDefault();
  load(e.dataTransfer.files[0]);
};
category();
