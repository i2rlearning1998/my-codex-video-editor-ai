// ROUND-C1 F2 (C1.5.2, C1.6.2): small PNG frames of a project, drawn off
// screen through the editor's own render path (deriveRenderItems and
// drawComposition, the same code the stage and the export use). Code layers
// (new graphics) are rendered by their own sandboxed session at the frame
// asked for; every new graphic is also looked at alone: a frame with no
// ink is "blank", ink cut off along the canvas edge is "outside", and a
// session that throws or runs past its time budget is an "error". Loaded
// lazily: only the AI planner and the renderFrames tool use it.
import { compositionAt, type Project } from '../core';
import type {
  FrameProvider,
  MediaFrameRequest,
  RenderSource,
} from '../render/adapter';
import { drawComposition, fitViewport } from '../render/canvas';
import { bakeSpecOf } from '../code-layer/frames';
import {
  codeFps,
  codeMeta,
  frameCount,
  type CodeData,
} from '../code-layer/meta';
import { openCodeSession } from '../code-layer/runtime';
import type {
  FreeCodeOpenOptions,
  FreeCodeSession,
} from '../code-layer/runtime-types';

export interface GraphicLook {
  readonly layerId: string;
  /** The plan's def id when the layer came from `defs.blocks`. */
  readonly graphic: string;
  readonly blank: boolean;
  readonly outside: boolean;
  readonly error?: string | undefined;
}
export interface RenderedFrame {
  readonly compositionId: string;
  readonly time: number;
  readonly png: Uint8Array;
  /** The whole frame is one colour. */
  readonly blank: boolean;
  /** A new graphic on it draws past the canvas edge. */
  readonly outside: boolean;
  readonly graphics: readonly GraphicLook[];
}
export type Opener = (
  tier: 'B' | 'C',
  source: string,
  opts: FreeCodeOpenOptions,
) => Promise<FreeCodeSession>;
export interface RenderFramesOptions {
  /** Longest side of each PNG in pixels (default 256). */
  readonly size?: number;
  /** Only this scene (default: every scene). */
  readonly compositionId?: string;
  readonly signal?: AbortSignal | undefined;
  /** Per code frame (default 8 s; the sandbox has its own watchdog too). */
  readonly frameTimeoutMs?: number;
  /** Test seam: opens a code session (default the real runtime). */
  readonly open?: Opener;
}

const abortError = () =>
  new DOMException('The check was cancelled.', 'AbortError');
const within = <T>(work: Promise<T>, ms: number, signal?: AbortSignal) =>
  new Promise<T>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `it did not finish a frame in ${Math.round(ms / 1000)} s (it may loop forever)`,
          ),
        ),
      ms,
    );
    const stop = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', stop, { once: true });
    work.then(
      (v) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
        reject(e as Error);
      },
    );
  });

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
function canvasOf(width: number, height: number) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(width, height);
    return { canvas: c, context: c.getContext('2d')! as Canvas2D };
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return { canvas: c, context: c.getContext('2d')! as Canvas2D };
}
async function pngOf(canvas: OffscreenCanvas | HTMLCanvasElement) {
  const blob =
    canvas instanceof HTMLCanvasElement
      ? await new Promise<Blob>((ok, no) =>
          canvas.toBlob(
            (b) => (b ? ok(b) : no(new Error('no PNG'))),
            'image/png',
          ),
        )
      : await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Looks at pixels: one colour (blank), and ink touching the edges. */
export function lookAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { blank: boolean; ink: number; edge: number; covered: number } {
  let min = [255, 255, 255, 255],
    max = [0, 0, 0, 0],
    ink = 0;
  const inked = (i: number) => data[i + 3]! > 24;
  for (let i = 0; i < data.length; i += 4) {
    for (let k = 0; k < 4; k++) {
      const v = data[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
    if (inked(i)) ink++;
  }
  const spread = Math.max(...max.map((v, k) => v - min[k]!));
  // The share of each edge's pixels that hold ink; the largest edge counts.
  const edgeShare = (pixels: number[]) =>
    pixels.filter((p) => inked(p * 4)).length / Math.max(1, pixels.length);
  const row = (y: number) =>
    Array.from({ length: width }, (_, x) => y * width + x);
  const col = (x: number) =>
    Array.from({ length: height }, (_, y) => y * width + x);
  const edge = Math.max(
    edgeShare(row(0)),
    edgeShare(row(height - 1)),
    edgeShare(col(0)),
    edgeShare(col(width - 1)),
  );
  return {
    blank: ink === 0 || spread <= 2,
    ink,
    edge,
    covered: ink / Math.max(1, width * height),
  };
}
/**
 * A graphic alone on a transparent canvas: blank when it has no ink (or one
 * flat colour); outside when ink is cut along an edge (over a fifth of it)
 * while the graphic does not fill the canvas (a full-canvas background is
 * meant to reach the edges).
 */
export function judgeGraphic(look: ReturnType<typeof lookAt>) {
  return {
    blank: look.blank,
    outside: !look.blank && look.edge > 0.2 && look.covered < 0.9,
  };
}

/** Code layers of a scene by layer id (children included). */
function codeLayers(
  layers: readonly unknown[],
  out = new Map<string, { code: CodeData; graphic: string }>(),
) {
  for (const layer of layers as readonly {
    id: string;
    code?: CodeData;
    children: readonly unknown[];
  }[]) {
    if (layer.code)
      out.set(layer.id, {
        code: layer.code,
        graphic:
          (layer.code.templateId ?? '').replace(/^plan-graphics-/, '') ||
          layer.id,
      });
    codeLayers(layer.children ?? [], out);
  }
  return out;
}

/** Renders small PNG frames of a project at the given times. */
export async function renderFrames(
  project: Project,
  times: readonly number[],
  o: RenderFramesOptions = {},
): Promise<RenderedFrame[]> {
  const size = o.size ?? 256;
  const open: Opener =
    o.open ?? ((tier, source, opts) => openCodeSession(tier, source, opts));
  const sessions = new Map<
    string,
    { session?: FreeCodeSession; error?: string; next: number }
  >();
  const out: RenderedFrame[] = [];
  try {
    for (const scene of project.compositions) {
      if (o.compositionId && scene.id !== o.compositionId) continue;
      const codes = codeLayers(scene.layers as never);
      const scale = size / Math.max(scene.width, scene.height);
      const width = Math.max(2, Math.round(scene.width * scale));
      const height = Math.max(2, Math.round(scene.height * scale));
      for (const time of times) {
        if (o.signal?.aborted) throw abortError();
        const at = Math.min(time, Math.max(0, scene.duration - 1e-3));
        const composition = compositionAt(
          scene as never,
          at,
        ) as unknown as RenderSource['composition'];
        const viewport = fitViewport(width, height, composition, 1, {
          padding: 0,
        });
        // Pass 1: which code frames this moment asks for.
        const asked: MediaFrameRequest[] = [];
        const recorder: FrameProvider = {
          frame: (request) => {
            if (request.kind === 'code' && request.code) asked.push(request);
            return null;
          },
        };
        const scratch = canvasOf(width, height);
        const base: Omit<RenderSource, 'frames'> = {
          composition,
          assets: project.assets as unknown as RenderSource['assets'],
          background: scene.backgroundColor,
          currentTime: at,
          playing: false,
          animate: true,
        };
        drawComposition(
          scratch.context as never,
          { ...base, frames: recorder },
          viewport,
          null,
          {
            overlays: false,
          },
        );
        // Each code layer renders its frame in its own session (sized to
        // the PNG), and is looked at alone.
        const images = new Map<string, ImageBitmap>();
        const graphics: GraphicLook[] = [];
        for (const request of asked) {
          const entry = codes.get(request.key);
          if (!entry || !request.code) continue;
          const fps = codeFps(entry.code, scene.fps);
          const spec = bakeSpecOf(
            entry.code,
            {
              ...request.code,
              fps,
              frames: frameCount(codeMeta(entry.code).duration, fps),
            },
            'full',
          );
          let held = sessions.get(request.key);
          if (!held) {
            held = { next: 0 };
            sessions.set(request.key, held);
            try {
              held.session = await within(
                open(spec.tier, spec.source, { ...spec, width, height }),
                o.frameTimeoutMs ?? 8000,
                o.signal,
              );
            } catch (e) {
              if ((e as Error).name === 'AbortError') throw e;
              held.error = (e as Error).message;
            }
          }
          if (held.error || !held.session) {
            graphics.push({
              layerId: request.key,
              graphic: entry.graphic,
              blank: false,
              outside: false,
              error: held.error ?? 'it could not start',
            });
            continue;
          }
          try {
            const frame = Math.min(
              request.code.frame,
              Math.max(0, request.code.frames - 1),
            );
            let image: ImageBitmap;
            if (held.session.meta.seekable || frame < held.next) {
              image = await within(
                held.session.renderFrame(frame),
                o.frameTimeoutMs ?? 8000,
                o.signal,
              );
            } else {
              // A stateful animation renders in order up to the frame.
              let last: ImageBitmap | null = null;
              for (let f = held.next; f <= frame; f++) {
                last?.close();
                last = await within(
                  held.session.renderFrame(f),
                  o.frameTimeoutMs ?? 8000,
                  o.signal,
                );
              }
              image = last!;
            }
            held.next = frame + 1;
            images.set(request.key, image);
            const alone = canvasOf(width, height);
            alone.context.drawImage(image, 0, 0, width, height);
            const look = judgeGraphic(
              lookAt(
                alone.context.getImageData(0, 0, width, height).data,
                width,
                height,
              ),
            );
            graphics.push({
              layerId: request.key,
              graphic: entry.graphic,
              ...look,
            });
          } catch (e) {
            if ((e as Error).name === 'AbortError') throw e;
            held.error = (e as Error).message || 'it stopped with an error';
            graphics.push({
              layerId: request.key,
              graphic: entry.graphic,
              blank: false,
              outside: false,
              error: held.error,
            });
          }
        }
        // Pass 2: the frame itself, with the rendered code frames.
        const final = canvasOf(width, height);
        drawComposition(
          final.context as never,
          {
            ...base,
            frames: {
              frame: (request) =>
                request.kind === 'code'
                  ? (images.get(request.key) ?? null)
                  : null,
            },
          },
          viewport,
          null,
          { overlays: false },
        );
        const whole = lookAt(
          final.context.getImageData(0, 0, width, height).data,
          width,
          height,
        );
        out.push({
          compositionId: scene.id,
          time: at,
          png: await pngOf(final.canvas),
          blank: whole.blank,
          outside: graphics.some((g) => g.outside),
          graphics,
        });
        for (const image of images.values()) image.close();
      }
    }
  } finally {
    for (const held of sessions.values()) held.session?.dispose();
  }
  return out;
}

/** The sample moments of a scene: a quarter, the middle and near the end. */
export const sampleTimes = (duration: number) =>
  [0.25, 0.5, 0.9].map((f) => Math.round(duration * f * 100) / 100);

/**
 * The browser's implementation of the shared tools' `renderFrames`
 * (src/tools: the tool context's `renderFrames`), so a tool call made in
 * the editor draws through the same path. Every scene is drawn at each time.
 */
export const browserRenderFrames =
  (signal?: AbortSignal) =>
  async (project: unknown, times: readonly number[], size?: number) =>
    (
      await renderFrames(project as Project, times, {
        ...(size ? { size } : {}),
        signal,
      })
    ).map((f) => ({
      time: f.time,
      png: f.png,
      blank: f.blank,
      outside: f.outside,
    }));
