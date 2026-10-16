import {
  libraryItemSchema,
  type LibraryElement,
  type Paint,
} from '../library/schema';
import { themeSchema } from '../themes/themes';
import { generatePreset, type KeyframeTrack } from '../creator-pack/preset';
import { easeProgress } from '../core/animation';
import {
  createComposition,
  createLayer,
  number,
  vector2,
  validateProject,
  type Easing,
  type Property,
} from '../core/model';
import { validateSpec } from '../ai-spec';
import { drawComposition, fitViewport } from '../render/canvas';
import type { RenderSource } from '../render/adapter';
import type { RenderRequest, ThumbnailItem } from './types';

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export function placeholder(width = 160, height = 90): Blob {
  const w = Number.isInteger(width) && width > 0 && width <= 2048 ? width : 160;
  const h =
    Number.isInteger(height) && height > 0 && height <= 2048 ? height : 90;
  return new Blob(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 160 90"><rect width="160" height="90" fill="#e5e7eb"/><rect x="57" y="25" width="46" height="40" rx="6" fill="#9ca3af"/><path d="M63 57l12-14 9 9 8-8 6 13z" fill="#e5e7eb"/></svg>`,
    ],
    { type: 'image/svg+xml' },
  );
}
function surface(width: number, height: number) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height),
      context = canvas.getContext('2d');
    if (context)
      return {
        context,
        blob: () => canvas.convertToBlob({ type: 'image/png' }),
        dispose: () => {
          canvas.width = canvas.height = 1;
        },
      };
  }
  if (typeof document === 'undefined') throw Error('Canvas unavailable');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.hidden = true;
  const context = canvas.getContext('2d');
  if (!context) throw Error('Canvas unavailable');
  // Detached hidden canvas: no UI node or layout work.
  return {
    context,
    blob: () =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(Error('Canvas encoding failed')),
          'image/png',
        ),
      ),
    dispose: () => {
      canvas.width = canvas.height = 1;
      canvas.remove();
    },
  };
}
function paint(context: Context, fill: Paint, width: number, height: number) {
  if (typeof fill === 'string') return fill;
  const angle = (fill.angle * Math.PI) / 180;
  const dx = (Math.cos(angle) * width) / 2,
    dy = (Math.sin(angle) * height) / 2;
  const gradient =
    fill.type === 'radial'
      ? context.createRadialGradient(
          width / 2,
          height / 2,
          0,
          width / 2,
          height / 2,
          Math.max(width, height) / 2,
        )
      : context.createLinearGradient(
          width / 2 - dx,
          height / 2 - dy,
          width / 2 + dx,
          height / 2 + dy,
        );
  for (const stop of fill.stops) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}
function element(
  context: Context,
  item: LibraryElement,
  width: number,
  height: number,
) {
  context.save();
  try {
    const w = item.w * width,
      h = item.h * height;
    context.translate(
      (item.x + item.w / 2) * width,
      (item.y + item.h / 2) * height,
    );
    context.rotate(((item.rotation ?? 0) * Math.PI) / 180);
    context.translate(-w / 2, -h / 2);
    context.globalAlpha = item.opacity ?? 1;
    if (item.kind === 'text') {
      context.fillStyle = item.color;
      context.font = `${item.italic ? 'italic ' : ''}${item.weight ?? 400} ${item.size * height}px ${item.font ?? 'Arial'}`;
      context.textAlign =
        item.align === 'justify' ? 'left' : (item.align ?? 'left');
      context.textBaseline = 'top';
      context.fillText(
        item.text.en,
        context.textAlign === 'center'
          ? w / 2
          : context.textAlign === 'right'
            ? w
            : 0,
        0,
        w,
      );
    } else {
      context.fillStyle = paint(context, item.fill, w, h);
      context.beginPath();
      if (item.shape === 'ellipse')
        context.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else if (item.shape === 'polygon' && item.polygons) {
        for (const polygon of item.polygons)
          for (const ring of polygon) {
            ring.forEach(([x, y], i) => {
              if (i === 0) context.moveTo((x * w) / 100, (y * h) / 100);
              else context.lineTo((x * w) / 100, (y * h) / 100);
            });
            context.closePath();
          }
      } else context.roundRect(0, 0, w, h, (item.radius ?? 0) * Math.min(w, h));
      context.fill('evenodd');
    }
  } finally {
    context.restore();
  }
}
async function image(
  context: Context,
  blob: Blob,
  width: number,
  height: number,
  signal: AbortSignal,
) {
  if (signal.aborted) throw Error('Cancelled');
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      if (signal.aborted) throw Error('Cancelled');
      contain(context, bitmap, bitmap.width, bitmap.height, width, height);
    } finally {
      bitmap.close();
    }
    return;
  }
  if (typeof document === 'undefined') throw Error('Image decoder unavailable');
  const node = document.createElement('img'),
    url = URL.createObjectURL(blob);
  try {
    const ready = event(node, 'load', signal);
    node.src = url;
    await ready;
    contain(
      context,
      node,
      node.naturalWidth,
      node.naturalHeight,
      width,
      height,
    );
  } finally {
    node.src = '';
    URL.revokeObjectURL(url);
  }
}
function contain(
  context: Context,
  source: CanvasImageSource,
  w: number,
  h: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / w, height / h);
  if (!Number.isFinite(scale)) throw Error('Invalid frame');
  context.drawImage(
    source,
    (width - w * scale) / 2,
    (height - h * scale) / 2,
    w * scale,
    h * scale,
  );
}
function event(
  target: EventTarget,
  name: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(name, ready);
      target.removeEventListener('error', failed);
      signal.removeEventListener('abort', failed);
    };
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(Error('Media unavailable or cancelled'));
    };
    target.addEventListener(name, ready, { once: true });
    target.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', failed, { once: true });
    if (signal.aborted) failed();
  });
}
async function video(context: Context, blob: Blob, request: RenderRequest) {
  if (typeof document === 'undefined') throw Error('Video decoder unavailable');
  const node = document.createElement('video'),
    url = URL.createObjectURL(blob);
  node.muted = true;
  node.preload = 'auto';
  node.playsInline = true;
  try {
    const loaded = event(node, 'loadeddata', request.signal);
    node.src = url;
    await loaded;
    const time = Number.isFinite(node.duration)
      ? Math.min(
          Math.max(0, node.duration - 0.01),
          request.progress * node.duration,
        )
      : 0;
    if (Math.abs(node.currentTime - time) > 0.001) {
      const sought = event(node, 'seeked', request.signal);
      node.currentTime = time;
      await sought;
    }
    contain(
      context,
      node,
      node.videoWidth,
      node.videoHeight,
      request.width,
      request.height,
    );
  } finally {
    node.pause();
    node.removeAttribute('src');
    node.load();
    URL.revokeObjectURL(url);
  }
}
function at(track: KeyframeTrack, t: number): number {
  const keys = track.keys;
  const end = keys.findIndex((key) => key.t > t);
  if (end === 0) return keys[0]!.v;
  if (end < 0) return keys[keys.length - 1]!.v;
  const a = keys[end - 1]!,
    b = keys[end]!;
  return (
    a.v + (b.v - a.v) * easeProgress(a.ease as Easing, (t - a.t) / (b.t - a.t))
  );
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
function resolvedNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw Error('Unresolved numeric field');
  return value;
}
function resolvedText(value: unknown): string {
  if (typeof value !== 'string') throw Error('Unresolved text field');
  return value;
}
function compositionSource(data: unknown): RenderSource {
  const payload = record(data);
  if (payload.project) {
    const project = validateProject(payload.project),
      composition = project.compositions[0]!;
    return {
      composition: composition as unknown as RenderSource['composition'],
      assets: project.assets as unknown as RenderSource['assets'],
      background: composition.backgroundColor,
      currentTime: 0,
      animate: true,
    };
  }
  const result = validateSpec(payload.spec);
  if (!result.ok) throw Error('Invalid composition');
  const spec = result.spec,
    scene = spec.scenes[0]!;
  const composition = createComposition({
    width: spec.canvas.width,
    height: spec.canvas.height,
    fps: spec.canvas.fps,
    duration: scene.duration,
    backgroundColor: resolvedText(scene.background),
  });
  const stringProperty = (
    value: string,
    type: 'color' | 'string' = 'string',
  ): Property => ({
    type,
    value,
    animated: false,
    keyframes: [],
    constraints: [],
  });
  for (const item of scene.items) {
    if (item.kind !== 'shape' && item.kind !== 'text') {
      // Resolve assets/code through frameAt; never pretend a partial scene is its poster.
      if (item.kind !== 'audio-slot')
        throw Error('Composition needs a frame provider');
      continue;
    }
    if (item.fx.length || scene.cameraMoves.length)
      throw Error('Composition needs a frame provider');
    const layer = createLayer(item.id, item.kind, item.name, item.duration);
    layer.startTime = item.start;
    layer.transform = {
      position: vector2(
        resolvedNumber(item.transform.x),
        resolvedNumber(item.transform.y),
      ),
      scale: vector2(
        resolvedNumber(item.transform.scale),
        resolvedNumber(item.transform.scale),
      ),
      rotation: number(resolvedNumber(item.transform.rotation)),
      opacity: number(resolvedNumber(item.transform.opacity)),
    };
    layer.properties = {
      width: number(resolvedNumber(item.width)),
      height: number(resolvedNumber(item.height)),
      fill: stringProperty(resolvedText(item.fill), 'color'),
    };
    if (item.kind === 'text')
      Object.assign(layer.properties, {
        text: stringProperty(resolvedText(item.text)),
        fontFamily: stringProperty(item.fontFamily),
        fontSize: number(resolvedNumber(item.fontSize)),
      });
    else layer.properties.shape = stringProperty(item.shape);
    composition.layers.push(layer);
  }
  return {
    composition: composition as unknown as RenderSource['composition'],
    assets: [],
    background: resolvedText(scene.background),
    currentTime: 0,
    animate: true,
  };
}
export async function renderThumbnail(
  item: ThumbnailItem,
  request: RenderRequest,
): Promise<Blob> {
  const { width, height, signal, progress } = request;
  const canvas = surface(width, height),
    context = canvas.context;
  try {
    if (signal.aborted) throw Error('Cancelled');
    context.clearRect(0, 0, width, height);
    const frames = item.bakedFrames;
    const supplied = item.frameAt
      ? await item.frameAt(progress, { width, height }, signal)
      : frames?.length
        ? frames[
            Math.min(frames.length - 1, Math.floor(progress * frames.length))
          ]
        : item.poster;
    if (supplied) await image(context, supplied, width, height, signal);
    else if (['shape', 'background', 'text', 'template'].includes(item.type)) {
      const input = record(item);
      const parsed = libraryItemSchema.parse({
        id: item.id,
        type: item.type,
        data: item.data,
        name: input.name ?? { en: 'Preview', hi: 'पूर्वावलोकन' },
        tags: input.tags ?? [],
        ...(input.section ? { section: input.section } : {}),
      });
      if (parsed.type === 'shape') {
        const ratio = parsed.data.width / parsed.data.height,
          w = Math.min(0.8, ((0.8 * height) / width) * ratio),
          h = (w * width) / ratio / height;
        element(
          context,
          {
            kind: 'shape',
            shape: 'polygon',
            polygons: parsed.data.polygons,
            fill: parsed.data.fill,
            x: (1 - w) / 2,
            y: (1 - h) / 2,
            w,
            h,
          },
          width,
          height,
        );
      } else if (parsed.type !== 'transition') {
        if (parsed.type === 'template') {
          context.fillStyle = parsed.data.background;
          context.fillRect(0, 0, width, height);
        }
        for (const entry of parsed.data.elements)
          element(context, entry, width, height);
      }
    } else if (item.type === 'theme') {
      const theme = themeSchema.parse({
        ...record(item.data),
        id: item.id,
        name: 'Preview',
      });
      context.fillStyle = theme.palette.background;
      context.fillRect(0, 0, width, height);
      context.fillStyle = theme.palette.text;
      context.font = `600 ${height * 0.45}px ${theme.fonts.heading}`;
      context.textBaseline = 'middle';
      context.textAlign = 'center';
      context.fillText('Aa', width / 2, height * 0.38, width * 0.9);
      [
        theme.palette.primary,
        theme.palette.accent,
        theme.palette.text,
        theme.palette.extra ?? theme.palette.primary,
      ].forEach((color, i) => {
        context.fillStyle = color;
        context.fillRect(
          width * (0.1 + i * 0.2),
          height * 0.72,
          width * 0.18,
          height * 0.15,
        );
      });
    } else if (item.type === 'preset') {
      const tracks = generatePreset(
        item.data,
        {},
        { W: width, H: height, w: width * 0.3, h: height * 0.35 },
      );
      const duration = Math.max(
        ...tracks.flatMap((track) => track.keys.map((key) => key.t)),
        1,
      );
      const values = Object.fromEntries(
        tracks.map((track) => [track.property, at(track, progress * duration)]),
      );
      const known = new Set([
        'x',
        'y',
        'position.x',
        'position.y',
        'transform.position.x',
        'transform.position.y',
        'scale',
        'scaleX',
        'scaleY',
        'transform.scale.x',
        'transform.scale.y',
        'rotation',
        'transform.rotation',
        'opacity',
        'transform.opacity',
      ]);
      if (tracks.some((track) => !known.has(track.property)))
        throw Error('Unsupported preview track');
      context.translate(
        values.x ??
          values['position.x'] ??
          values['transform.position.x'] ??
          width / 2,
        values.y ??
          values['position.y'] ??
          values['transform.position.y'] ??
          height / 2,
      );
      context.rotate(
        ((values.rotation ?? values['transform.rotation'] ?? 0) * Math.PI) /
          180,
      );
      context.scale(
        values.scaleX ?? values['transform.scale.x'] ?? values.scale ?? 1,
        values.scaleY ?? values['transform.scale.y'] ?? values.scale ?? 1,
      );
      context.globalAlpha = Math.max(
        0,
        Math.min(1, values.opacity ?? values['transform.opacity'] ?? 1),
      );
      context.fillStyle = '#6366f1';
      context.beginPath();
      context.roundRect(
        -width * 0.15,
        -height * 0.175,
        width * 0.3,
        height * 0.35,
        Math.min(width, height) * 0.06,
      );
      context.fill();
    } else if (item.type === 'composition') {
      const source = compositionSource(item.data);
      drawComposition(
        context,
        source,
        fitViewport(width, height, source.composition, 1, {
          padding: 0,
          upscale: true,
        }),
        null,
        { overlays: false },
      );
    } else if (item.type === 'image' && item.blob)
      await image(context, item.blob, width, height, signal);
    else if (item.type === 'video' && item.blob)
      await video(context, item.blob, request);
    else if (item.type === 'audio') {
      context.fillStyle = '#e5e7eb';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = '#64748b';
      context.lineWidth = Math.max(1, width / 80);
      const peaks = record(item.data).peaks;
      if (
        Array.isArray(peaks) &&
        peaks.length &&
        peaks.every((p) => typeof p === 'number' && Number.isFinite(p))
      ) {
        const samples = peaks.slice(0, 256) as number[];
        samples.forEach((v, i) => {
          const x = width * (0.1 + (0.8 * i) / samples.length),
            h = Math.max(1, Math.min(1, Math.abs(v)) * height * 0.7);
          context.beginPath();
          context.moveTo(x, (height - h) / 2);
          context.lineTo(x, (height + h) / 2);
          context.stroke();
        });
      } else {
        context.font = `${height * 0.55}px sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#64748b';
        context.fillText('♫', width / 2, height / 2);
      }
    } else throw Error('A baked poster or live frame is required');
    if (signal.aborted) throw Error('Cancelled');
    return await canvas.blob();
  } finally {
    canvas.dispose();
  }
}
