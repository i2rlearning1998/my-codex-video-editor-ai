import { defineBlock } from './render';
import { clamp, ease, easingNames, lerp, rngFor, spring } from './helpers';
import type { ParamSpec, Params } from './types';
const num = (
  name: string,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
): ParamSpec => ({
  name,
  label,
  type: 'number',
  min,
  max,
  step,
  default: value,
});
const color = (name: string, label: string, value: string): ParamSpec => ({
  name,
  label,
  type: 'color',
  default: value,
});
const text = (
  name: string,
  label: string,
  value: string,
  maxLength = 100,
): ParamSpec => ({ name, label, type: 'text', default: value, maxLength });
const n = (p: Params, key: string) => p[key] as number;
export const counter = defineBlock(
  {
    id: 'counter',
    version: '1.0.0',
    name: 'Signal counter',
    category: 'Data',
    defaultDuration: 4,
    thumbnailTime: 2.4,
    params: [
      num('from', 'From', -1000000, 1000000, 1, 0),
      num('to', 'To', -1000000, 1000000, 1, 1200),
      num('seconds', 'Count duration', 0.1, 20, 0.1, 3),
      {
        name: 'easing',
        label: 'Easing',
        type: 'select',
        options: easingNames,
        default: 'ease-out',
      },
      text('prefix', 'Prefix', ''),
      text('suffix', 'Suffix', ' projects'),
      color('color', 'Accent', '#64e3c3'),
      { name: 'glow', label: 'Glow', type: 'bool', default: true },
    ],
  },
  (ctx, t, size, p) => {
    const progress = ease(String(p.easing), clamp(t / n(p, 'seconds'))),
      value = Math.round(lerp(n(p, 'from'), n(p, 'to'), progress)),
      w = size.width,
      h = size.height;
    ctx.fillStyle = '#10242ce8';
    ctx.fillRect(w * 0.12, h * 0.21, w * 0.76, h * 0.58);
    ctx.fillStyle = String(p.color);
    ctx.fillRect(w * 0.12, h * 0.21, w * 0.008, h * 0.58);
    ctx.font = `600 ${h * 0.038}px Arial`;
    ctx.fillText('LIVE SIGNAL / TOTAL', w * 0.17, h * 0.33);
    ctx.save();
    ctx.shadowColor = String(p.color);
    ctx.shadowBlur = p.glow ? h * 0.025 : 0;
    ctx.font = `700 ${h * 0.115}px Arial`;
    ctx.fillText(
      String(p.prefix) + value + String(p.suffix),
      w * 0.17,
      h * 0.55,
      w * 0.66,
    );
    ctx.restore();
    ctx.fillStyle = '#29444c';
    ctx.fillRect(w * 0.17, h * 0.67, w * 0.66, h * 0.012);
    ctx.fillStyle = String(p.color);
    ctx.fillRect(w * 0.17, h * 0.67, w * 0.66 * progress, h * 0.012);
  },
);
export const particleBurst = defineBlock(
  {
    id: 'particle-burst',
    version: '1.0.0',
    name: 'Orbital burst',
    category: 'Particles',
    defaultDuration: 4,
    thumbnailTime: 0.8,
    params: [
      num('count', 'Particles', 1, 300, 1, 90),
      num('speed', 'Speed', 0.05, 1, 0.01, 0.32),
      num('gravity', 'Gravity', -0.5, 1, 0.01, 0.16),
      num('life', 'Lifetime', 0.2, 8, 0.1, 3),
      num('radius', 'Particle size', 0.001, 0.03, 0.001, 0.007),
      color('color', 'Colour', '#e5b6ff'),
    ],
  },
  (ctx, t, size, p, seed) => {
    const age = Math.max(0, t),
      life = n(p, 'life'),
      fade = clamp(1 - age / life);
    if (t < 0 || fade === 0) return;
    ctx.save();
    ctx.fillStyle = String(p.color);
    ctx.shadowColor = String(p.color);
    ctx.shadowBlur = size.height * 0.012;
    const scale = Math.min(size.width, size.height);
    for (let i = 0; i < Math.floor(n(p, 'count')); i++) {
      const angle = rngFor(seed, i * 4) * Math.PI * 2,
        speed = (0.35 + rngFor(seed, i * 4 + 1) * 0.65) * n(p, 'speed') * scale,
        x = size.width / 2 + Math.cos(angle) * speed * age,
        y =
          size.height * 0.45 +
          Math.sin(angle) * speed * age +
          0.5 * n(p, 'gravity') * scale * age * age,
        r = n(p, 'radius') * scale * (0.4 + rngFor(seed, i * 4 + 2) * 0.6);
      ctx.globalAlpha = fade * (0.5 + rngFor(seed, i * 4 + 3) * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
);
export const dataPipeline = defineBlock(
  {
    id: 'data-pipeline',
    version: '1.0.0',
    name: 'Data relay',
    category: 'Data',
    defaultDuration: 6,
    thumbnailTime: 2,
    params: [
      num('nodes', 'Nodes', 2, 6, 1, 4),
      num('speed', 'Flow speed', 0.1, 3, 0.1, 1),
      text(
        'labels',
        'Node labels (comma separated)',
        'INGEST,PROCESS,VERIFY,SHIP',
        150,
      ),
      color('color', 'Signal colour', '#82aaff'),
      num('rate', 'Items per second', 1, 1000, 1, 42),
    ],
  },
  (ctx, t, size, p) => {
    const count = Math.floor(n(p, 'nodes')),
      labels = String(p.labels).split(','),
      w = size.width,
      h = size.height,
      y = h * 0.48,
      left = w * 0.13,
      spacing = (w * 0.74) / (count - 1),
      phase = Math.max(0, t) * n(p, 'speed');
    ctx.strokeStyle = '#395274';
    ctx.lineWidth = h * 0.004;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(w - left, y);
    ctx.stroke();
    for (let i = 0; i < count - 1; i++)
      for (let dot = 0; dot < 4; dot++) {
        const progress = (phase * 0.45 + dot / 4) % 1;
        ctx.fillStyle = String(p.color);
        ctx.beginPath();
        ctx.arc(left + spacing * (i + progress), y, h * 0.009, 0, Math.PI * 2);
        ctx.fill();
      }
    for (let i = 0; i < count; i++) {
      const x = left + spacing * i;
      ctx.fillStyle = '#14263a';
      ctx.beginPath();
      ctx.arc(x, y, h * 0.068, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = String(p.color);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = String(p.color);
      ctx.font = `700 ${h * 0.033}px Arial`;
      ctx.fillText(String(i + 1).padStart(2, '0'), x, y + h * 0.012);
      ctx.font = `600 ${h * 0.025}px Arial`;
      ctx.fillText(
        labels[i] ?? 'NODE ' + (i + 1),
        x,
        y + h * 0.12,
        spacing * 0.88,
      );
      ctx.fillStyle = '#e1e8f5';
      ctx.font = `500 ${h * 0.031}px Arial`;
      ctx.fillText(
        String(Math.max(0, Math.floor((t - i * 0.2) * n(p, 'rate')))),
        x,
        y + h * 0.19,
      );
    }
  },
);
export const kineticLetters = defineBlock(
  {
    id: 'kinetic-letters',
    version: '1.0.0',
    name: 'Neon arrival',
    category: 'Typography',
    defaultDuration: 4,
    thumbnailTime: 1.5,
    params: [
      text('text', 'Text', 'MAKE IT MOVE', 40),
      num('stagger', 'Letter stagger', 0, 0.3, 0.01, 0.065),
      num('frequency', 'Spring frequency', 0.5, 6, 0.1, 2.4),
      num('damping', 'Damping', 0.1, 0.95, 0.01, 0.62),
      color('color', 'Colour', '#ffe29a'),
      { name: 'glow', label: 'Glow', type: 'bool', default: true },
    ],
  },
  (ctx, t, size, p) => {
    const letters = Array.from(String(p.text)),
      font = Math.min(
        size.height * 0.15,
        ((size.width * 0.8) / Math.max(1, letters.length)) * 1.4,
      ),
      spacing = Math.min(
        font * 0.72,
        (size.width * 0.85) / Math.max(1, letters.length),
      ),
      left = (size.width - spacing * (letters.length - 1)) / 2;
    ctx.font = `700 ${font}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = String(p.color);
    for (let i = 0; i < letters.length; i++) {
      const age = t - i * n(p, 'stagger'),
        v = spring(age, n(p, 'frequency'), n(p, 'damping'));
      if (age < 0) continue;
      ctx.save();
      ctx.globalAlpha = clamp(age / 0.2);
      ctx.translate(
        left + i * spacing,
        size.height * 0.5 + (1 - v) * size.height * 0.35,
      );
      ctx.rotate((1 - v) * -0.25);
      ctx.shadowColor = String(p.color);
      ctx.shadowBlur = p.glow ? size.height * 0.025 : 0;
      ctx.fillText(letters[i]!, 0, 0);
      ctx.restore();
    }
  },
);
export const blocks = Object.freeze([
  counter,
  particleBurst,
  dataPipeline,
  kineticLetters,
]);
export const getBlock = (id: string) => blocks.find((b) => b.id === id);
