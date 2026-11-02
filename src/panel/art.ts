// P2-R2 (P2B-29, P2B-30): card art made from the config, no image files: a
// Style's own `cardArt` URL when the owner set one, else an SVG drawn from
// its id (the same picture every time) in the brand's aurora colours.
import type { PlatformConfig, Style } from '../platform-config';
import { h } from './dom';

const NS = 'http://www.w3.org/2000/svg';
function seeded(id: string) {
  let x = 2166136261;
  for (let i = 0; i < id.length; i++)
    x = Math.imul(x ^ id.charCodeAt(i), 16777619);
  return () => {
    x = Math.imul(x ^ (x >>> 15), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    return ((x ^= x >>> 16) >>> 0) / 4294967296;
  };
}
const hex = (v: string | undefined, d: string) =>
  v && /^#[0-9a-f]{6}$/i.test(v) ? v : d;

/** An SVG picture for anything with an id (styles, scenes, steps). */
export function artSvg(
  id: string,
  c: PlatformConfig,
  label = '',
  w = 320,
  hgt = 180,
): SVGSVGElement {
  const rnd = seeded(id);
  const a = hex(c.brand.colors.accent, '#7c5cff');
  const b = hex(c.brand.colors.accent2, '#22d3ee');
  const g = hex(c.brand.colors.gold, '#ffc247');
  const bg = hex(c.brand.colors.bg, '#07070d');
  const gid = `g-${id.replace(/[^a-z0-9-]/gi, '')}-${Math.floor(rnd() * 1e6)}`;
  const shapes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x = Math.round(rnd() * w);
    const y = Math.round(rnd() * hgt);
    const r = Math.round(18 + rnd() * 60);
    const fill = i % 3 === 0 ? `url(#${gid})` : i % 3 === 1 ? b : g;
    shapes.push(
      rnd() > 0.5
        ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${(0.35 + rnd() * 0.5).toFixed(2)}"/>`
        : `<rect x="${x - r}" y="${y - r / 2}" width="${r * 2}" height="${r}" rx="${Math.round(r / 3)}" fill="${fill}" opacity="${(0.3 + rnd() * 0.5).toFixed(2)}" transform="rotate(${Math.round(rnd() * 40 - 20)} ${x} ${y})"/>`,
    );
  }
  const arc = `<path d="M ${w * 0.1} ${hgt * 0.85} Q ${w * 0.5} ${hgt * (0.1 + rnd() * 0.3)} ${w * 0.9} ${hgt * 0.8}" stroke="${g}" stroke-width="3" fill="none" stroke-dasharray="6 6"/>`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('class', 'art');
  svg.setAttribute('aria-hidden', 'true');
  // Built from numbers and validated colours only (no outside text).
  svg.innerHTML = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${hgt}" fill="${bg}"/>${shapes.join('')}${arc}`;
  if (label) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', '16');
    t.setAttribute('y', String(hgt - 16));
    t.setAttribute('fill', hex(c.brand.colors.text, '#ecebf5'));
    t.setAttribute('font-size', '18');
    t.setAttribute('font-weight', '700');
    t.textContent = label;
    svg.append(t);
  }
  return svg;
}

export function styleArt(s: Style, c: PlatformConfig): HTMLElement {
  if (s.cardArt && /^(https:\/\/|\/)/.test(s.cardArt))
    return h('img', { class: 'art', src: s.cardArt, alt: '' });
  const box = h('div', { class: 'art-box' });
  box.append(artSvg(s.id, c));
  return box;
}

/**
 * P2-R3: a film poster drawn from an id and the brand colours: a sky, a glowing
 * sun or moon, layered hills or waves, a few stars. The same picture every
 * time for the same id. (A Style's own `cardArt` always wins over this.)
 */
export function posterSvg(
  id: string,
  c: PlatformConfig,
  w = 240,
  hgt = 360,
): SVGSVGElement {
  const rnd = seeded(`poster-${id}`);
  const a = hex(c.brand.colors.accent, '#7c5cff');
  const b = hex(c.brand.colors.accent2, '#22d3ee');
  const g = hex(c.brand.colors.gold, '#ffc247');
  const bg = hex(c.brand.colors.bg, '#07070d');
  const pick = [a, b, g, '#ff4fa3'];
  const top = pick[Math.floor(rnd() * 3)]!;
  const horizon = pick[Math.floor(rnd() * pick.length)]!;
  const uid = `p-${id.replace(/[^a-z0-9-]/gi, '')}-${Math.floor(rnd() * 1e6)}`;
  const sunX = Math.round(w * (0.25 + rnd() * 0.5));
  const sunY = Math.round(hgt * (0.2 + rnd() * 0.22));
  const sunR = Math.round(w * (0.1 + rnd() * 0.08));
  const stars: string[] = [];
  for (let i = 0; i < 22; i++)
    stars.push(
      `<circle cx="${Math.round(rnd() * w)}" cy="${Math.round(rnd() * hgt * 0.55)}" r="${(0.5 + rnd() * 1.1).toFixed(1)}" fill="#fff" opacity="${(0.25 + rnd() * 0.6).toFixed(2)}"/>`,
    );
  const ridge = (base: number, amp: number, fill: string, op: number) => {
    let d = `M0 ${hgt} L0 ${base}`;
    const steps = 6 + Math.floor(rnd() * 3);
    for (let i = 1; i <= steps; i++)
      d += ` L${Math.round((w / steps) * i)} ${Math.round(base - rnd() * amp)}`;
    return `<path d="${d} L${w} ${hgt} Z" fill="${fill}" opacity="${op}"/>`;
  };
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('class', 'art');
  svg.setAttribute('aria-hidden', 'true');
  // Numbers and validated colours only (no outside text).
  svg.innerHTML =
    `<defs><linearGradient id="${uid}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset=".45" stop-color="${top}" stop-opacity=".75"/><stop offset="1" stop-color="${horizon}"/></linearGradient>` +
    `<radialGradient id="${uid}o"><stop offset="0" stop-color="#fff6e0"/><stop offset=".5" stop-color="${g}" stop-opacity=".7"/><stop offset="1" stop-color="${g}" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${w}" height="${hgt}" fill="url(#${uid}s)"/>${stars.join('')}` +
    `<circle cx="${sunX}" cy="${sunY}" r="${sunR * 3}" fill="url(#${uid}o)" opacity=".55"/>` +
    `<circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="#fff6e0"/>` +
    ridge(Math.round(hgt * 0.66), hgt * 0.16, '#0a0716', 0.55) +
    ridge(Math.round(hgt * 0.76), hgt * 0.12, bg, 0.8) +
    ridge(Math.round(hgt * 0.88), hgt * 0.08, bg, 1);
  return svg;
}

/** P2-R3: a tall film-poster picture for a Style (2:3). */
export function posterArt(s: Style, c: PlatformConfig): HTMLElement {
  if (s.cardArt && /^(https:\/\/|\/)/.test(s.cardArt))
    return h('img', { class: 'art poster-art', src: s.cardArt, alt: '' });
  const box = h('div', { class: 'art-box poster-art' });
  box.append(posterSvg(s.id, c));
  return box;
}

/** P2B-32: a small waveform for a voice option (drawn from its name). */
export function waveSvg(id: string, w = 96, hgt = 24): SVGSVGElement {
  const rnd = seeded(id);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('class', 'wave');
  svg.setAttribute('aria-hidden', 'true');
  const bars: string[] = [];
  for (let x = 2; x < w; x += 4) {
    const v = Math.max(2, Math.round((0.2 + 0.8 * rnd()) * (hgt - 4)));
    bars.push(
      `<rect x="${x}" y="${(hgt - v) / 2}" width="2" height="${v}" rx="1"/>`,
    );
  }
  svg.innerHTML = bars.join('');
  return svg;
}
