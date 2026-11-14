// ROUND-C1 C1.6: the layout validator (pure, no DOM). It looks at what the
// builder will place: text inside the safe area (margins from the Platform
// Config), layers inside the canvas, text that fits its box (an offline
// estimate from a small font-metrics table; the browser measures the built
// layers with real text measuring through `measure`), text over text at
// the same time, low contrast of text on its scene colour, and media whose
// shape does not fit a full-screen place. Findings are plain sentences with
// a suggested fix; errors block a build, warnings are shown.
import { place, SIZE } from './layout';
import type { PlanLayer, VideoPlan } from './schema';

export interface LayoutRules {
  readonly safeX: number;
  readonly safeY: number;
  readonly minContrast: number;
}
export const DEFAULT_LAYOUT_RULES: LayoutRules = {
  safeX: 5,
  safeY: 5,
  minContrast: 3,
};
export interface LayoutFinding {
  readonly level: 'error' | 'warning';
  readonly where: string;
  readonly text: string;
  readonly fix: string;
}
const ASPECT = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
} as const;

/** Average advance of one character as a share of the font size, by script. */
export const FONT_METRICS: Readonly<Record<string, number>> = {
  latin: 0.55,
  devanagari: 0.62,
  cjk: 1.0,
  arabic: 0.5,
};
export function charWidth(text: string): number {
  if (/[一-鿿぀-ヿ가-힯]/.test(text)) return FONT_METRICS.cjk!;
  if (/[ऀ-ॿ]/.test(text)) return FONT_METRICS.devanagari!;
  if (/[؀-ۿ]/.test(text)) return FONT_METRICS.arabic!;
  return FONT_METRICS.latin!;
}
/** Measures text (the browser's canvas in the editor; the table offline). */
export type Measure = (
  text: string,
  size: number,
  maxWidth: number,
) => { lines: number; width: number };
export const estimateText: Measure = (text, size, maxWidth) => {
  const per = charWidth(text) * size;
  const words = text.split(/\s+/).filter(Boolean);
  let lines = 1,
    line = 0,
    widest = 0;
  for (const word of words) {
    const w = word.length * per;
    const next = line ? line + per + w : w;
    if (next > maxWidth && line) {
      lines++;
      widest = Math.max(widest, line);
      line = w;
    } else line = next;
    if (w > maxWidth) {
      lines += Math.floor(w / maxWidth);
      line = w % maxWidth;
    }
  }
  return { lines, width: Math.max(widest, line) };
};

const luminance = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [
    number,
    number,
  ];
  return (x + 0.05) / (y + 0.05);
};
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The box a title or text layer will get (the builder's own formula). */
function textBox(
  layer: PlanLayer,
  width: number,
  height: number,
  measure: Measure,
): Box {
  const short = Math.min(width, height);
  const title = layer.kind === 'title';
  const size = Math.round(
    layer.fontSize !== undefined
      ? (layer.fontSize * short) / 1080
      : short *
          (title ? 0.08 : 0.045) *
          (layer.size === 'large' ? 1.3 : layer.size === 'small' ? 0.75 : 1),
  );
  const w =
    layer.width !== undefined
      ? (layer.width / 100) * width
      : width *
        Math.min(
          0.88,
          SIZE[layer.size === 'full' ? 'large' : layer.size] + 0.3,
        );
  const lines = measure(layer.text ?? '', size, w).lines;
  const h = size * 1.25 * lines;
  const spot = place(layer, { width, height } as never, w, h);
  return { x: spot.x, y: spot.y, w, h };
}

/** Checks a validated plan. */
export function checkLayout(
  plan: VideoPlan,
  rules: LayoutRules = DEFAULT_LAYOUT_RULES,
  measure: Measure = estimateText,
): LayoutFinding[] {
  const [width, height] = ASPECT[plan.meta.aspect];
  const sx = (rules.safeX / 100) * width,
    sy = (rules.safeY / 100) * height;
  const out: LayoutFinding[] = [];
  const background = plan.feel?.palette?.background ?? '#101219';
  const textColour = plan.feel?.palette?.text ?? '#ffffff';
  const owners = [
    ...plan.scenes.map((s, i) => ({
      name: `Scene ${i + 1} (${s.id})`,
      layers: s.layers,
      background: s.background ?? background,
    })),
    { name: 'Overlays', layers: plan.overlays, background },
  ];
  for (const owner of owners) {
    const texts: { id: string; box: Box; from: number; to: number }[] = [];
    const behindMedia = owner.layers.some(
      (l) => l.kind === 'media' && l.size === 'full',
    );
    for (const layer of owner.layers) {
      const where = `${owner.name}, layer "${layer.id}"`;
      if (
        layer.at &&
        (layer.at.x < -20 ||
          layer.at.x > 120 ||
          layer.at.y < -20 ||
          layer.at.y > 120) &&
        !layer.move
      )
        out.push({
          level: 'warning',
          where,
          text: `${where} is placed outside the canvas.`,
          fix: 'Move its "at" inside 0 to 100.',
        });
      if (layer.kind === 'title' || layer.kind === 'text') {
        const box = textBox(layer, width, height, measure);
        if (
          box.y + box.h > height ||
          box.y < 0 ||
          box.x < 0 ||
          box.x + box.w > width
        )
          out.push({
            level: 'error',
            where,
            text: `${where}: the text does not fit on the canvas (it needs ${Math.round(box.h)} px of height).`,
            fix: 'Shorten the text, make it smaller or give it a wider box.',
          });
        else if (
          box.x < sx - 1 ||
          box.y < sy - 1 ||
          box.x + box.w > width - sx + 1 ||
          box.y + box.h > height - sy + 1
        )
          out.push({
            level: 'warning',
            where,
            text: `${where}: the text reaches into the ${rules.safeX}% safe margin.`,
            fix: 'Move it inward or make it smaller.',
          });
        const from = layer.start ?? 0;
        texts.push({
          id: layer.id,
          box,
          from,
          to: from + (layer.duration ?? 1e9),
        });
        const colour = layer.color ?? textColour;
        if (
          !behindMedia &&
          !layer.highlight &&
          contrast(colour, owner.background) < rules.minContrast
        )
          out.push({
            level: 'warning',
            where,
            text: `${where}: the text colour is hard to read on the background (contrast ${contrast(colour, owner.background).toFixed(1)}).`,
            fix: 'Use a lighter or darker text colour, or a highlight box.',
          });
      }
      if (
        layer.kind === 'media' &&
        layer.size === 'full' &&
        layer.mediaIntent?.orientation
      ) {
        const canvas =
          width > height ? 'landscape' : width < height ? 'portrait' : 'square';
        if (layer.mediaIntent.orientation !== canvas && layer.fit !== 'fit')
          out.push({
            level: 'warning',
            where,
            text: `${where} asks for ${layer.mediaIntent.orientation} media on a ${canvas} canvas; much of it will be cut off.`,
            fix: `Ask for ${canvas} media, or set "fit": "fit".`,
          });
      }
    }
    // Captions sit in the lower part of the frame: a lower third or bottom
    // text under narration is covered by them.
    const captioned =
      plan.captions?.enabled !== false &&
      owner.name !== 'Overlays' &&
      plan.scenes.some((sc) => sc.narration?.trim());
    if (captioned)
      for (const layer of owner.layers)
        if (
          (layer.kind === 'kit' && /^lower-third/.test(layer.kit ?? '')) ||
          ((layer.kind === 'text' || layer.kind === 'title') &&
            (layer.anchor === 'bottom' || layer.anchor === 'lower-third') &&
            !layer.at)
        )
          out.push({
            level: 'warning',
            where: `${owner.name}, layer "${layer.id}"`,
            text: `${owner.name}, layer "${layer.id}" sits where the captions go.`,
            fix: 'Move it to the top, or give the captions another style.',
          });
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i]!,
          b = texts[j]!;
        if (a.from < b.to && b.from < a.to && overlap(a.box, b.box))
          out.push({
            level: 'warning',
            where: owner.name,
            text: `${owner.name}: texts "${a.id}" and "${b.id}" cover each other.`,
            fix: 'Move one, or show them at different times.',
          });
      }
  }
  return out;
}

/** Checks built text layers with a real measure (the editor's canvas). */
export interface BuiltText {
  readonly where: string;
  readonly text: string;
  readonly size: number;
  readonly box: Box;
}
export function checkBuiltText(
  texts: readonly BuiltText[],
  canvas: { width: number; height: number },
  measure: Measure,
  rules: LayoutRules = DEFAULT_LAYOUT_RULES,
): LayoutFinding[] {
  const out: LayoutFinding[] = [];
  for (const t of texts) {
    const m = measure(t.text, t.size, t.box.w);
    const need = m.lines * t.size * 1.25;
    if (
      need > t.box.h + 1 ||
      t.box.y + need > canvas.height ||
      t.box.x < 0 ||
      t.box.x + t.box.w > canvas.width
    )
      out.push({
        level: 'error',
        where: t.where,
        text: `${t.where}: the text is taller than its box.`,
        fix: 'Shorten it or make it smaller.',
      });
    else if (
      t.box.y < (rules.safeY / 100) * canvas.height - 1 ||
      t.box.y + t.box.h > canvas.height * (1 - rules.safeY / 100) + 1
    )
      out.push({
        level: 'warning',
        where: t.where,
        text: `${t.where} is in the safe margin.`,
        fix: 'Move it inward.',
      });
  }
  return out;
}
