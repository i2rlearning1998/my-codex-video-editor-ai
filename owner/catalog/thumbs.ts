// Phase 1 library (P1-04, P1-23): a small SVG thumbnail and a tiny blur
// placeholder for every vector item, drawn from its own data, and a
// waveform for sounds. The editor still draws its live previews with its
// own renderer; these pictures are what a card shows before that, and what
// the owner's manager shows.
import type { LibraryItem, Paint } from '../../src/library/schema';

const esc = (text: string) =>
  text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const firstColor = (paint: Paint): string =>
  typeof paint === 'string' ? paint : (paint.stops[0]?.color ?? '#888888');
const lastColor = (paint: Paint): string =>
  typeof paint === 'string' ? paint : (paint.stops.at(-1)?.color ?? '#888888');

/** A two-colour gradient, about 200 bytes as a data URL. */
export function blurFor(from: string, to = from): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><defs><linearGradient id="g"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="16" height="9" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const polygonPath = (
  rings: number[][][],
  sx: number,
  sy: number,
  ox: number,
  oy: number,
) =>
  rings
    .map(
      (ring) =>
        `M${ring.map(([x, y]) => `${(ox + x! * sx).toFixed(1)} ${(oy + y! * sy).toFixed(1)}`).join('L')}Z`,
    )
    .join('');

function paintDef(paint: Paint, id: string): [string, string] {
  if (typeof paint === 'string') return ['', paint];
  const stops = paint.stops
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`)
    .join('');
  const def =
    paint.type === 'radial'
      ? `<radialGradient id="${id}">${stops}</radialGradient>`
      : `<linearGradient id="${id}" gradientTransform="rotate(${paint.angle} .5 .5)">${stops}</linearGradient>`;
  return [def, `url(#${id})`];
}

/** An SVG thumbnail of a library item (16:9, 160 × 90). */
export function thumbnailSvg(item: LibraryItem): string {
  const W = 160;
  const H = 90;
  const defs: string[] = [];
  const body: string[] = [];
  let n = 0;
  const fillOf = (paint: Paint) => {
    const [def, fill] = paintDef(paint, `p${n++}`);
    if (def) defs.push(def);
    return fill;
  };
  const elements = (
    list: readonly {
      kind: string;
      x: number;
      y: number;
      w: number;
      h: number;
      [key: string]: unknown;
    }[],
  ) => {
    for (const el of list) {
      const x = el.x * W;
      const y = el.y * H;
      const w = el.w * W;
      const h = el.h * H;
      if (el.kind === 'text') {
        const text = (el.text as { en: string }).en;
        const size = Math.max(4, (el.size as number) * H);
        body.push(
          `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + size / 3).toFixed(1)}" font-size="${size.toFixed(1)}" font-family="sans-serif" text-anchor="middle" fill="${el.color as string}">${esc(text.slice(0, 40))}</text>`,
        );
      } else if (el.shape === 'ellipse') {
        body.push(
          `<ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${(h / 2).toFixed(1)}" fill="${fillOf(el.fill as Paint)}"/>`,
        );
      } else if (el.shape === 'polygon' && el.polygons) {
        const d = (el.polygons as number[][][][])
          .map((rings) => polygonPath(rings, w / 100, h / 100, x, y))
          .join('');
        body.push(
          `<path d="${d}" fill="${fillOf(el.fill as Paint)}" fill-rule="evenodd"/>`,
        );
      } else {
        const r = ((el.radius as number | undefined) ?? 0) * Math.min(w, h);
        body.push(
          `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${r.toFixed(1)}" fill="${fillOf(el.fill as Paint)}"/>`,
        );
      }
    }
  };
  let background = '#f4f5f8';
  switch (item.type) {
    case 'shape': {
      const side = 70;
      const d = item.data.polygons
        .map((rings) =>
          polygonPath(
            rings,
            side / 100,
            side / 100,
            (W - side) / 2,
            (H - side) / 2,
          ),
        )
        .join('');
      body.push(
        `<path d="${d}" fill="${fillOf(item.data.fill)}" fill-rule="evenodd"/>`,
      );
      break;
    }
    case 'background':
      elements(item.data.elements);
      break;
    case 'text':
      elements(item.data.elements);
      break;
    case 'template':
      background = item.data.background;
      elements(item.data.elements);
      break;
    case 'transition':
      body.push(
        `<rect width="${W / 2}" height="${H}" fill="${item.data.from}"/><rect x="${W / 2}" width="${W / 2}" height="${H}" fill="${item.data.to}"/>`,
      );
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs.join('')}</defs><rect width="${W}" height="${H}" fill="${background}"/>${body.join('')}</svg>`;
}

/** The placeholder colours of a library item. */
export function blurOfItem(item: LibraryItem): string {
  switch (item.type) {
    case 'shape':
      return blurFor(firstColor(item.data.fill), lastColor(item.data.fill));
    case 'background': {
      const fill = item.data.elements[0]!.fill;
      return blurFor(firstColor(fill), lastColor(fill));
    }
    case 'text':
      return blurFor('#f4f5f8', item.data.elements[0]!.color);
    case 'template':
      return blurFor(item.data.background);
    case 'transition':
      return blurFor(item.data.from, item.data.to);
  }
}

/** A palette strip for a theme (Creator Pack `theme` kind). */
export function paletteSvg(colors: readonly string[], label: string): string {
  const w = 160 / colors.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="160" height="90">${colors
    .map(
      (c, i) =>
        `<rect x="${(i * w).toFixed(1)}" width="${(w + 0.5).toFixed(1)}" height="70" fill="${c}"/>`,
    )
    .join(
      '',
    )}<rect y="70" width="160" height="20" fill="#ffffff"/><text x="80" y="84" font-size="11" font-family="sans-serif" text-anchor="middle" fill="#1f2433">${esc(label.slice(0, 30))}</text></svg>`;
}

/** A waveform from mono samples in -1..1 (peaks in 80 columns). */
export function waveformSvg(samples: Float32Array): string {
  const columns = 80;
  const per = Math.max(1, Math.floor(samples.length / columns));
  const bars: string[] = [];
  for (let c = 0; c < columns; c++) {
    let peak = 0;
    for (let i = c * per; i < Math.min(samples.length, (c + 1) * per); i++)
      peak = Math.max(peak, Math.abs(samples[i]!));
    const h = Math.max(1, peak * 80);
    bars.push(
      `<rect x="${c * 2}" y="${(45 - h / 2).toFixed(1)}" width="1.2" height="${h.toFixed(1)}"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="160" height="90"><rect width="160" height="90" fill="#1d2030"/><g fill="#a591ff">${bars.join('')}</g></svg>`;
}
