// P2-R3: a picture of each scene while the video builds. It takes the plan's
// real layers and runs them through the same layout the editor uses
// (`layoutLayer`: where each title, text, shape and picture goes, in the
// plan's colours and size), then draws the boxes on a canvas. It is a layout
// preview: pictures show as labelled frames, animations are not played, and
// fonts are the panel's. The editor draws the final frame. Loaded only when
// a build starts.
import { layoutLayer, type Emitted } from '../video-plan/layout';
import type { VideoPlan } from '../video-plan';
import type { Asset } from '../core';

const SIZES = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
} as const;

export interface SceneArt {
  readonly w: number;
  readonly h: number;
  readonly bg: string;
  readonly accent: string;
  readonly items: readonly Emitted[];
}

const num = (v: unknown, d = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : d;

/** The scene's layout, ready to draw (never throws; a bad layer is skipped). */
export function sceneArt(plan: VideoPlan, index: number): SceneArt {
  const [w, h] = SIZES[plan.meta.aspect];
  const palette = {
    background: plan.feel?.palette?.background ?? '#101219',
    text: plan.feel?.palette?.text ?? '#ffffff',
    accent: plan.feel?.palette?.accent ?? '#7c5cff',
  };
  const scene = plan.scenes[index];
  const items: Emitted[] = [];
  const dur = Math.max(1, scene?.durationHint ?? 5);
  const env = {
    width: w,
    height: h,
    palette,
    // Every picture is shown as a frame, so say one exists.
    assetOf: () => ({ type: 'image' }) as unknown as Asset,
    slotFor: (_a: Asset, hint: string) => hint,
  };
  for (const layer of [...(scene?.layers ?? []), ...plan.overlays]) {
    try {
      items.push(
        ...layoutLayer(
          layer,
          `${scene?.id ?? index}-${layer.id}`,
          `p${index}${layer.id.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 30),
          {
            start: Math.min(layer.start ?? 0, Math.max(0, dur - 0.2)),
            duration: Math.max(0.2, layer.duration ?? dur),
          },
          env,
        ),
      );
    } catch {
      /* a layer the preview cannot place is simply not drawn */
    }
  }
  // Backgrounds first, then pictures, then text and shapes on top.
  const rank = (e: Emitted) =>
    e.role === 'kit' ? 0 : e.role === 'media' ? 1 : 2;
  items.sort((a, b) => rank(a) - rank(b));
  return {
    w,
    h,
    bg: scene?.background ?? palette.background,
    accent: palette.accent,
    items,
  };
}

/** How many canvas pixels tall a frame of this scene is for a given width. */
export const frameHeight = (art: SceneArt, width: number) =>
  Math.round((width * art.h) / art.w);

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines.slice(0, 8);
}

/**
 * Draws the scene. `p` is how much is built (0 to 1): items appear one after
 * another, each rising a little as it fades in.
 */
export function paintScene(
  canvas: HTMLCanvasElement,
  art: SceneArt,
  p: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const k = canvas.width / art.w;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = art.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const n = art.items.length;
  art.items.forEach((e, i) => {
    const a = Math.max(0, Math.min(1, p * (n + 1) - i));
    if (a <= 0) return;
    const it = e.item;
    const tr = (it.transform ?? {}) as Record<string, unknown>;
    const x = num(tr.x) * k;
    const y = num(tr.y) * k + (1 - a) * 28 * k;
    const w = num(it.width) * k;
    const h = num(it.height) * k;
    ctx.save();
    ctx.globalAlpha = a * Math.max(0, Math.min(1, num(tr.opacity, 1)));
    const rot = num(tr.rotation);
    if (rot) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    if (it.kind === 'shape') {
      ctx.fillStyle = typeof it.fill === 'string' ? it.fill : '#ffffff';
      const r = Math.min(num(it.cornerRadius) * k, Math.min(w, h) / 2);
      ctx.beginPath();
      if (it.shape === 'ellipse')
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    } else if (it.kind === 'text' && typeof it.text === 'string') {
      const size = Math.max(4, num(it.fontSize, 40) * k);
      ctx.fillStyle = typeof it.fill === 'string' ? it.fill : '#ffffff';
      ctx.font = `${num(it.fontWeight, 600)} ${size}px "Plus Jakarta Sans","Noto Sans Devanagari",system-ui,sans-serif`;
      ctx.textBaseline = 'top';
      const align =
        it.align === 'center' || it.align === 'right' ? it.align : 'left';
      ctx.textAlign = align;
      const ax = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
      wrap(ctx, it.text, Math.max(8, w)).forEach((line, li) =>
        ctx.fillText(line, ax, y + li * size * 1.25),
      );
    } else if (it.kind === 'media-slot') {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, `${art.accent}55`);
      g.addColorStop(1, '#ffffff14');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 14 * k);
      ctx.fill();
      ctx.strokeStyle = '#ffffff40';
      ctx.lineWidth = Math.max(1, 2 * k);
      ctx.stroke();
      ctx.fillStyle = '#ffffffcc';
      ctx.font = `600 ${Math.max(7, 34 * k)}px system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        String(it.name ?? '').slice(0, 30),
        x + w / 2,
        y + h / 2,
        w * 0.9,
      );
    } else {
      // Code graphics and anything else: a dark box.
      ctx.fillStyle = '#00000066';
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(2, w), Math.max(2, h), 12 * k);
      ctx.fill();
    }
    ctx.restore();
  });
}
