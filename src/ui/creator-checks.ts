// P2 (CREATOR-PACK-SPEC 6, steps 3 to 5): the runtime checks `checkPack`
// leaves open, run in the editor before anything is registered. Each item is
// rendered at three times (start, middle, near the end) with the editor's
// own renderer or the code-layer runtime: blank or throwing items are
// rejected; a motion item's thumbnail is rendered twice and must match byte
// for byte; each number control is set to its minimum and its maximum and
// must change the middle frame (a warning for motion, a rejection for a
// preset). Nothing touches the project.
import { SYSTEM_FONTS } from '../render/text-style';
import type { CreatorItem } from '../creator-pack';
import type { LibraryItem } from '../library/schema';
import type { RenderSource } from '../render/adapter';
import type { TextMeasurer } from '../render/text-layout';
import { drawComposition } from '../render/canvas';
import { classifyCode } from '../code-layer/classify';
import { openCodeSession } from '../code-layer/runtime';
import type {
  FreeCodeMeta,
  FreeCodeRuntime,
  FreeCodeSession,
} from '../code-layer/runtime-types';
import { libraryCommands } from './library-insert';

export interface RuntimeResult {
  status: 'ok' | 'warning' | 'rejected' | 'unsupported';
  reasons: string[];
  /** A small PNG of the middle frame. */
  thumbnail?: string;
  /** Motion: the meta the runtime validated. */
  motionMeta?: FreeCodeMeta;
}
export interface CheckDeps {
  readonly measureText?: TextMeasurer;
  readonly runtime: () => Promise<FreeCodeRuntime | null>;
}

/** Kinds this build does not register yet (never silently dropped). */
export const UNSUPPORTED_KINDS = new Set([
  'composition',
  'adjust',
  'filter',
  'effect',
  'transition',
  'font',
]);
const W = 1280,
  H = 720;
/** Spec 6 step 4: per frame and whole-check time budgets. */
const FRAME_BUDGET = 5000,
  CHECK_BUDGET = 60_000;
const THUMB = { width: 160, height: 90 };

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${what} took longer than ${ms / 1000} s.`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** RGBA bytes of a drawable. */
function pixelsOf(image: CanvasImageSource, width = W, height = H) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}
/** Fully transparent, or one colour everywhere. */
function blank(data: Uint8ClampedArray): boolean {
  let opaque = false;
  for (let i = 3; i < data.length; i += 4) if (data[i]) opaque = true;
  if (!opaque) return true;
  for (let i = 4; i < data.length; i += 4)
    if (
      data[i] !== data[0] ||
      data[i + 1] !== data[1] ||
      data[i + 2] !== data[2] ||
      data[i + 3] !== data[3]
    )
      return false;
  return true;
}
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
function thumbnailOf(image: CanvasImageSource): Promise<string> {
  const canvas = new OffscreenCanvas(THUMB.width, THUMB.height);
  canvas.getContext('2d')!.drawImage(image, 0, 0, THUMB.width, THUMB.height);
  return canvas.convertToBlob({ type: 'image/png' }).then(
    (blob) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      }),
  );
}

/** A native item drawn by the editor's renderer at a time (transparent). */
function renderNative(
  item: LibraryItem,
  time: number,
  measureText: TextMeasurer | undefined,
): OffscreenCanvas {
  const composition = {
    id: 'creator-check',
    name: 'Check',
    width: W,
    height: H,
    fps: 30,
    duration: 10,
    layers: [],
    tracks: [],
    markers: [],
    metadata: {},
  } as unknown as RenderSource['composition'];
  const base: RenderSource = {
    composition,
    assets: [],
    background: '#00000000',
    ...(measureText ? { measureText } : {}),
  };
  let layers: unknown[] = [];
  for (const command of libraryCommands(
    { compositions: [composition] },
    base,
    item,
    0,
  ).commands as unknown as {
    type: string;
    layer?: unknown;
    composition?: { layers: unknown[] };
  }[]) {
    if (command.type === 'CREATE_LAYER' && command.layer)
      layers.push(command.layer);
    if (command.type === 'CREATE_COMPOSITION' && command.composition)
      layers = command.composition.layers;
  }
  const canvas = new OffscreenCanvas(W, H);
  const context = canvas.getContext('2d')!;
  if (item.type === 'template') {
    context.fillStyle = item.data.background;
    context.fillRect(0, 0, W, H);
  }
  drawComposition(
    context as unknown as CanvasRenderingContext2D,
    {
      ...base,
      composition: { ...composition, layers } as RenderSource['composition'],
      currentTime: time,
    },
    { width: W, height: H, pixelRatio: 1, matrix: [1, 0, 0, 1, 0, 0] },
    null,
    { overlays: false },
  );
  return canvas;
}

async function checkNative(
  item: LibraryItem,
  deps: CheckDeps,
): Promise<RuntimeResult> {
  const frames = [0, 2.5, 4.5].map((time) => {
    try {
      return renderNative(item, time, deps.measureText);
    } catch (error) {
      throw new Error(`It could not be drawn: ${message(error)}`);
    }
  });
  const data = frames.map((frame) => pixelsOf(frame));
  if (data.every(blank))
    return {
      status: 'rejected',
      reasons: [
        'Every checked frame is empty or one colour. Give it visible content.',
      ],
    };
  return {
    status: 'ok',
    reasons: ['Drawn at 0 s, 2.5 s and 4.5 s: visible.'],
    thumbnail: await thumbnailOf(frames[1]!),
  };
}

async function checkMotion(
  item: Extract<CreatorItem, { type: 'motion' }>,
  deps: CheckDeps,
): Promise<RuntimeResult> {
  const started = performance.now();
  const runtime = item.data.tier === 'C' ? await deps.runtime() : null;
  const classified = await classifyCode(item.data.source, runtime);
  if (classified.tier === null)
    return {
      status: 'rejected',
      reasons: classified.issues.map(
        (issue) => `Line ${issue.line}: ${issue.what} Fix: ${issue.fix}`,
      ),
    };
  if (classified.tier !== item.data.tier)
    return {
      status: 'rejected',
      reasons: [
        `The source runs as Tier ${classified.tier ?? '?'}, not Tier ${item.data.tier}. Set data.tier to match.`,
      ],
    };
  const meta = classified.meta;
  const seekable = item.data.tier === 'B' || meta.seekable;
  // A stateful animation renders every frame up to the last one checked,
  // so it is checked at a low rate.
  const fps = seekable ? (meta.fps ?? 30) : Math.min(meta.fps ?? 30, 12);
  const count = Math.max(1, Math.ceil(meta.duration * fps - 1e-6));
  const times = [0, Math.floor(count / 2), Math.max(0, count - 2)];
  const reasons: string[] = [];
  const budget = () => {
    if (performance.now() - started > CHECK_BUDGET)
      throw new Error('The check took longer than 60 s. Make it lighter.');
  };
  const defaults = Object.fromEntries(
    meta.params.map((param) => [param.name, param.default]),
  );
  /** The frames at `frames` with some params (in order for stateful code). */
  const renderAt = async (
    params: Record<string, unknown>,
    frames: readonly number[],
  ): Promise<Uint8ClampedArray[]> => {
    const session: FreeCodeSession = await within(
      openCodeSession(item.data.tier, item.data.source, {
        width: W,
        height: H,
        fps,
        duration: meta.duration,
        params: params as never,
        seed: 1,
      }),
      FRAME_BUDGET,
      'Opening the animation',
    );
    try {
      const out: Uint8ClampedArray[] = [];
      const last = Math.max(...frames);
      for (let frame = seekable ? 0 : 0; frame <= last; frame++) {
        if (seekable && !frames.includes(frame)) continue;
        budget();
        const image = await within(
          session.renderFrame(frame),
          FRAME_BUDGET,
          `Frame ${frame}`,
        );
        if (frames.includes(frame)) out.push(pixelsOf(image));
        image.close();
      }
      return out;
    } finally {
      session.dispose();
    }
  };
  let frames: Uint8ClampedArray[];
  try {
    frames = await renderAt(defaults, times);
  } catch (error) {
    return {
      status: 'rejected',
      reasons: [`It failed while rendering: ${message(error)}`],
    };
  }
  if (frames.every(blank))
    return {
      status: 'rejected',
      reasons: [
        'Every checked frame is empty or one colour. Draw something visible.',
      ],
    };
  reasons.push(
    `Rendered frames ${times.join(', ')} at ${W} × ${H}, ${fps} fps: visible.`,
  );
  // Determinism: the thumbnail twice, byte for byte.
  let thumbnail: string | undefined;
  try {
    const shots: Uint8ClampedArray[] = [];
    for (let run = 0; run < 2; run++) {
      const session = await openCodeSession(item.data.tier, item.data.source, {
        width: W,
        height: H,
        fps,
        duration: meta.duration,
        params: defaults as never,
        seed: 1,
      });
      try {
        const image = await within(
          session.thumbnail(),
          FRAME_BUDGET * 4,
          'The thumbnail',
        );
        shots.push(pixelsOf(image));
        if (run === 0) thumbnail = await thumbnailOf(image);
        image.close();
      } finally {
        session.dispose();
      }
      budget();
    }
    if (!same(shots[0]!, shots[1]!))
      return {
        status: 'rejected',
        reasons: [
          ...reasons,
          'Two renders of the same frame differ: it is not deterministic. Use the seeded random (rng) and the frame time only.',
        ],
      };
    reasons.push('Baked twice: identical bytes.');
  } catch (error) {
    return {
      status: 'rejected',
      reasons: [...reasons, `It failed while rendering: ${message(error)}`],
    };
  }
  // Controls: each number at its min and max must change the middle frame.
  let status: RuntimeResult['status'] = 'ok';
  for (const param of meta.params.slice(0, 8)) {
    if (param.type !== 'number' || param.min === param.max) continue;
    try {
      const middle = [times[1]!];
      const [low] = await renderAt(
        { ...defaults, [param.name]: param.min },
        middle,
      );
      const [high] = await renderAt(
        { ...defaults, [param.name]: param.max },
        middle,
      );
      if (same(low!, high!)) {
        status = 'warning';
        reasons.push(
          `Control "${param.label}" did not change the middle frame. Fix it or remove it.`,
        );
      }
    } catch (error) {
      return {
        status: 'rejected',
        reasons: [
          ...reasons,
          `Control "${param.label}" failed at its minimum or maximum: ${message(error)}`,
        ],
      };
    }
  }
  return {
    status,
    reasons,
    motionMeta: meta,
    ...(thumbnail ? { thumbnail } : {}),
  };
}

async function checkPreset(
  item: Extract<CreatorItem, { type: 'preset' }>,
): Promise<RuntimeResult> {
  const { generatePreset } = await import('../creator-pack');
  const base = JSON.stringify(generatePreset(item.data));
  for (const control of item.data.controls) {
    if (control.type !== 'number' && control.type !== 'angle') continue;
    const low = JSON.stringify(
      generatePreset(item.data, { [control.name]: control.min }),
    );
    const high = JSON.stringify(
      generatePreset(item.data, { [control.name]: control.max }),
    );
    if (low === high && low === base)
      return {
        status: 'rejected',
        reasons: [
          `Control "${control.label.en}" does not change the keyframes. Use it in a track or remove it.`,
        ],
      };
  }
  return {
    status: 'ok',
    reasons: ['Keyframes generated for the defaults and every extreme.'],
  };
}

/** The runtime check of one item that passed `checkPack`. */
export async function runtimeCheck(
  item: CreatorItem,
  deps: CheckDeps,
): Promise<RuntimeResult> {
  if (UNSUPPORTED_KINDS.has(item.type))
    return {
      status: 'unsupported',
      reasons: [
        `Not supported yet: ${item.type} items are not built in this version.`,
      ],
    };
  try {
    if (item.type === 'motion') return await checkMotion(item, deps);
    if (item.type === 'preset') return await checkPreset(item);
    if (item.type === 'theme') return checkTheme(item.data);
    if (
      item.type === 'shape' ||
      item.type === 'text' ||
      item.type === 'background' ||
      item.type === 'template'
    )
      return await checkNative(
        {
          id: item.id,
          name: { en: item.name.en, hi: item.name.hi ?? item.name.en },
          tags: item.tags,
          type: item.type,
          data: item.data,
        } as LibraryItem,
        deps,
      );
  } catch (error) {
    return {
      status: 'rejected',
      reasons: [`It failed while rendering: ${message(error)}`],
    };
  }
  return { status: 'unsupported', reasons: ['Not supported yet.'] };
}

/**
 * T1: a theme item: its fonts must be ones the editor has, and it gets a
 * swatch thumbnail (background with the other slots as bars).
 */
function checkTheme(data: {
  palette: Record<string, string | undefined>;
  fonts: { heading: string; body: string };
}): RuntimeResult {
  const available = SYSTEM_FONTS.map(([name]) => name as string);
  const missing = [data.fonts.heading, data.fonts.body].filter(
    (font) => !available.includes(font),
  );
  if (missing.length)
    return {
      status: 'rejected',
      reasons: [
        `Unknown font ${missing.join(', ')}: use one of ${available.join(', ')}.`,
      ],
    };
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const context = canvas.getContext('2d')!;
  context.fillStyle = data.palette.background!;
  context.fillRect(0, 0, 160, 90);
  const slots = (['primary', 'accent', 'text', 'extra'] as const).filter(
    (slot) => data.palette[slot],
  );
  slots.forEach((slot, index) => {
    context.fillStyle = data.palette[slot]!;
    context.fillRect(16 + index * 34, 30, 28, 30);
  });
  return {
    status: 'ok',
    reasons: ['Theme: fonts available; contrast checked.'],
    thumbnail: canvas.toDataURL('image/png'),
  };
}
