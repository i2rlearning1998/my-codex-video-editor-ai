// FINAL3 Part C: a Blender-like camera for a scene, moved only by code
// controllers. A camera (its Blender settings) and a shot (which camera, a
// controller, its parameters and optional start and end framing) live on a
// "camera shot" layer whose clip sits on the scene's Camera track; the
// clip's start and length are the shot's (so shots trim, move, split and
// delete like any clip). Schema unchanged: the camera and the shot are JSON
// string properties of that layer (D-033 pattern), read defensively here.
// Everything is computed in floating point (no rounding, so no jitter) and
// shared by the preview and the export. DOM-free.
import { rngFor } from '../blocks/helpers';
import { CAMERA_EASINGS, CONTROLLERS } from '../ai-spec/camera-names';
export { CAMERA_EASINGS, CONTROLLERS };

export const CAMERA_ROLE = 'camera';
export type Matrix = readonly [number, number, number, number, number, number];
type Vec2 = readonly [number, number];

/** Blender's camera settings (names and units as in the Blender manual). */
export interface CameraSpec {
  readonly id: string;
  readonly name: string;
  /** Perspective or Orthographic (Panoramic is Cycles-only in Blender). */
  readonly type: 'persp' | 'ortho';
  /** Lens Unit: the lens is edited as Millimetres or Field of View. */
  readonly lensUnit: 'mm' | 'fov';
  /** Focal Length in mm (50 frames the canvas exactly). */
  readonly focal: number;
  /** Orthographic Scale (1 frames the canvas exactly; 2 shows twice as much). */
  readonly orthoScale: number;
  readonly sensorFit: 'auto' | 'horizontal' | 'vertical';
  /** Sensor Size in mm (36 is full frame). */
  readonly sensor: number;
  /** Shift X / Y, a fraction of the frame's larger side. */
  readonly shiftX: number;
  readonly shiftY: number;
  /** Clip Start / End: layers nearer or farther (depth units) are not drawn. */
  readonly clipStart: number;
  readonly clipEnd: number;
  /** "Limits": show the clip range on the camera frame. */
  readonly showLimits: boolean;
  readonly dof: {
    readonly enabled: boolean;
    /** Focus Object: a layer whose depth is in focus (else the distance). */
    readonly focusLayer: string | null;
    readonly distance: number;
    readonly fStop: number;
    /** Aperture Blades (3 or more; 0 is a round aperture). */
    readonly blades: number;
    /** Aperture Rotation in degrees. */
    readonly rotation: number;
    /** Aperture Ratio (anamorphic: above 1 stretches bokeh sideways). */
    readonly ratio: number;
  };
  readonly safeAreas: {
    readonly show: boolean;
    /** Title Safe and Action Safe margins X / Y (EBU: 10 % 5 %, 3.5 % 3.5 %). */
    readonly title: Vec2;
    readonly action: Vec2;
    readonly centerCut: boolean;
    readonly centerTitle: Vec2;
    readonly centerAction: Vec2;
  };
  readonly passepartout: { readonly show: boolean; readonly alpha: number };
  readonly guides: Readonly<Record<CompositionGuide, boolean>>;
  readonly display: {
    /** Viewport Display Size of the camera frame's line and label. */
    readonly size: number;
    readonly showName: boolean;
    readonly showSensor: boolean;
  };
  /** A reference image or video on the camera view. */
  readonly background: CameraBackground | null;
  /** Track To constraint: keep a layer centred (target and up axis). */
  readonly trackTo: {
    readonly layerId: string | null;
    readonly up: 'Y' | '-Y' | 'X' | '-X';
  };
}
export const COMPOSITION_GUIDES = [
  'center',
  'centerDiagonal',
  'thirds',
  'golden',
  'goldenTriangleA',
  'goldenTriangleB',
  'harmoniousTriangleA',
  'harmoniousTriangleB',
] as const;
export type CompositionGuide = (typeof COMPOSITION_GUIDES)[number];
export interface CameraBackground {
  readonly assetId: string;
  readonly alpha: number;
  /** Back: behind the scene; Front: over it. */
  readonly depth: 'back' | 'front';
  readonly frame: 'stretch' | 'fit' | 'crop';
  readonly offset: Vec2;
  readonly rotation: number;
  readonly scale: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  /** Include in render: also drawn in the export (else a reference only). */
  readonly render: boolean;
}

export function defaultCameraSpec(id: string, name: string): CameraSpec {
  return {
    id,
    name,
    type: 'persp',
    lensUnit: 'mm',
    focal: 50,
    orthoScale: 1,
    sensorFit: 'auto',
    sensor: 36,
    shiftX: 0,
    shiftY: 0,
    clipStart: 0.1,
    clipEnd: 100000,
    showLimits: false,
    dof: {
      enabled: false,
      focusLayer: null,
      distance: 0,
      fStop: 2.8,
      blades: 0,
      rotation: 0,
      ratio: 1,
    },
    safeAreas: {
      show: false,
      title: [0.1, 0.05],
      action: [0.035, 0.035],
      centerCut: false,
      centerTitle: [0.175, 0.05],
      centerAction: [0.15, 0.05],
    },
    passepartout: { show: true, alpha: 0.5 },
    guides: Object.fromEntries(
      COMPOSITION_GUIDES.map((guide) => [guide, false]),
    ) as Record<CompositionGuide, boolean>,
    display: { size: 1, showName: true, showSensor: false },
    background: null,
    trackTo: { layerId: null, up: 'Y' },
  };
}
/** Real camera presets (sensor sizes in mm). */
export const SENSOR_PRESETS = [
  ['full-frame', 36],
  ['aps-c', 23.6],
  ['micro-four-thirds', 17.3],
  ['super-35', 24.89],
  ['one-inch', 13.2],
  ['phone', 7.6],
] as const;
/** Focal length presets (mm): wide, standard, normal, portrait, tele. */
export const LENS_PRESETS = [24, 35, 50, 85, 135] as const;

/** Where the camera is and how it looks at one moment. */
export interface Pose {
  /** Truck (x), pedestal (y) in composition px; dolly (z) toward the scene. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Pan, tilt and roll in degrees. */
  readonly pan: number;
  readonly tilt: number;
  readonly roll: number;
  readonly focal: number;
  /** The focus distance (depth units) when depth of field is on. */
  readonly focus: number;
  /** Orthographic scale (orthographic cameras). */
  readonly orthoScale: number;
}
export const restPose = (spec?: CameraSpec): Pose => ({
  x: 0,
  y: 0,
  z: 0,
  pan: 0,
  tilt: 0,
  roll: 0,
  focal: spec?.focal ?? 50,
  focus: spec?.dof.distance ?? 0,
  orthoScale: spec?.orthoScale ?? 1,
});

export interface Frame {
  readonly width: number;
  readonly height: number;
}
/** The distance at which depth 0 looks exactly like the canvas (px). */
export const referenceDistance = (frame: Frame) =>
  Math.max(frame.width, frame.height);
/**
 * The lens zoom: 1 at 50 mm on a 36 mm sensor fitted to the larger side.
 * Sensor Fit maps the sensor to the width, the height or (Auto) the larger.
 */
export function lensZoom(spec: CameraSpec, focal: number, frame: Frame) {
  const max = Math.max(frame.width, frame.height);
  const span =
    spec.sensorFit === 'horizontal'
      ? frame.width
      : spec.sensorFit === 'vertical'
        ? frame.height
        : max;
  return (focal / spec.sensor / (50 / 36)) * (max / span);
}
/** Field of view (degrees) along the fitted side, from a focal length. */
export const fieldOfView = (spec: CameraSpec, focal: number) =>
  (2 * Math.atan(spec.sensor / 2 / focal) * 180) / Math.PI;
/** The focal length for a field of view (degrees). */
export const focalForFov = (spec: CameraSpec, fov: number) =>
  spec.sensor / 2 / Math.tan(((fov / 2) * Math.PI) / 180);

/**
 * The matrix that draws a layer at `depth` (0: the canvas plane; positive:
 * farther) through the camera. Perspective scales a layer by D / (D − z +
 * depth), so dollying and trucking show parallax; pan, tilt and shift move
 * every depth alike; roll turns about the centre. Orthographic ignores
 * depth. At rest the matrix is the identity.
 */
export function poseMatrix(
  spec: CameraSpec,
  pose: Pose,
  frame: Frame,
  depth = 0,
): Matrix {
  const cx = frame.width / 2,
    cy = frame.height / 2;
  const d = referenceDistance(frame);
  const k = lensZoom(spec, pose.focal, frame);
  let scale: number;
  if (spec.type === 'ortho') scale = 1 / Math.max(1e-3, pose.orthoScale);
  else {
    const distance = Math.max(d * 0.02, d - pose.z + depth);
    scale = (k * d) / distance;
  }
  const max = Math.max(frame.width, frame.height);
  // Rotations move every depth alike (no parallax): the angle at distance D.
  const ox = -d * k * Math.tan((pose.pan * Math.PI) / 180) + spec.shiftX * max;
  const oy = -d * k * Math.tan((pose.tilt * Math.PI) / 180) + spec.shiftY * max;
  const angle = (-pose.roll * Math.PI) / 180;
  const a = scale * Math.cos(angle),
    b = scale * Math.sin(angle),
    c = -b,
    dd = a;
  // screen = centre + R·S·(p − centre − (x, y)) + offset
  const px = cx + pose.x,
    py = cy + pose.y;
  const matrix: Matrix = [
    a,
    b,
    c,
    dd,
    cx + ox - a * px - c * py,
    cy + oy - b * px - dd * py,
  ];
  if (!matrix.every(Number.isFinite)) throw new Error('Camera matrix overflow');
  return matrix.map((value) => (value === 0 ? 0 : value)) as unknown as Matrix;
}
/** Whether a layer at `depth` lies inside Clip Start and Clip End. */
export function insideClip(
  spec: CameraSpec,
  pose: Pose,
  frame: Frame,
  depth: number,
): boolean {
  if (spec.type === 'ortho') return true;
  const distance = referenceDistance(frame) - pose.z + depth;
  return distance >= spec.clipStart && distance <= spec.clipEnd;
}
/**
 * Depth of field: the blur radius (composition px) of a layer at `depth`,
 * growing with its distance from the focus and with a wider aperture
 * (a smaller F-Stop), like a real lens; 0 with depth of field off.
 */
export function dofBlur(
  spec: CameraSpec,
  pose: Pose,
  frame: Frame,
  depth: number,
  focusDepth = pose.focus,
): number {
  if (!spec.dof.enabled || spec.type === 'ortho') return 0;
  const d = referenceDistance(frame);
  const away = Math.abs(depth - focusDepth);
  const blur =
    ((away / (away + d)) * (pose.focal / Math.max(0.5, spec.dof.fStop)) * d) /
    900;
  return Math.min(60, blur);
}

// --- Controllers -------------------------------------------------------------

export type ControllerId = (typeof CONTROLLERS)[number];

export type CameraEasing = (typeof CAMERA_EASINGS)[number];
export function ease(easing: CameraEasing, u: number): number {
  const x = Math.max(0, Math.min(1, u));
  switch (easing) {
    case 'linear':
      return x;
    case 'ease-in':
      return x * x * x;
    case 'ease-out':
      return 1 - (1 - x) ** 3;
    case 'ease-in-out':
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
    case 'smooth':
      return x * x * x * (x * (6 * x - 15) + 10);
    case 'snap':
      return 1 - (1 - x) ** 6;
  }
}

/** A shot: which camera, how it moves and how strongly. */
export interface Shot {
  readonly cameraId: string;
  readonly controller: ControllerId;
  readonly easing: CameraEasing;
  /** 0 to 2 (1 is the controller's usual amount). */
  readonly strength: number;
  /** Handheld: amount (px), speed (Hz) and seed; also used by Shake hit. */
  readonly amount: number;
  readonly speed: number;
  readonly seed: number;
  /** Pan, tilt and orbit direction (1 or −1). */
  readonly direction: 1 | -1;
  /** Rack focus and Follow: the layer to focus or to follow. */
  readonly target: string | null;
  /** Start and end framing (each value optional; missing: at rest). */
  readonly from?: Partial<Pose>;
  readonly to?: Partial<Pose>;
}
export function defaultShot(
  cameraId: string,
  controller: ControllerId = 'push-in',
): Shot {
  return {
    cameraId,
    controller,
    easing: 'smooth',
    strength: 1,
    amount: 6,
    speed: 1.2,
    seed: 1,
    direction: 1,
    target: null,
  };
}
/** The presets row: a controller with its settings. */
export const SHOT_PRESETS: Readonly<
  Record<
    'slow-push' | 'reveal' | 'documentary-drift' | 'punch-in' | 'shake-hit',
    Partial<Shot> & { controller: ControllerId }
  >
> = {
  'slow-push': { controller: 'push-in', strength: 0.5, easing: 'smooth' },
  reveal: {
    controller: 'pull-out',
    strength: 1.2,
    easing: 'ease-out',
    from: { tilt: -4 },
  },
  'documentary-drift': {
    controller: 'parallax-drift',
    strength: 0.6,
    easing: 'linear',
    amount: 2,
    speed: 0.4,
  },
  'punch-in': { controller: 'push-in', strength: 1.6, easing: 'snap' },
  'shake-hit': {
    controller: 'handheld',
    strength: 1.5,
    amount: 18,
    speed: 7,
    easing: 'ease-out',
  },
};

/** Smooth value noise in [−1, 1] (seeded; the same frames every time). */
function noise(seed: number, position: number, axis: number): number {
  const index = Math.floor(position),
    fraction = position - index,
    smooth = fraction * fraction * (3 - 2 * fraction);
  const a = rngFor(seed, index * 3 + axis) * 2 - 1,
    b = rngFor(seed, (index + 1) * 3 + axis) * 2 - 1;
  return a + (b - a) * smooth;
}
const KEYS = [
  'x',
  'y',
  'z',
  'pan',
  'tilt',
  'roll',
  'focal',
  'focus',
  'orthoScale',
] as const;
const mix = (a: Pose, b: Pose, t: number): Pose =>
  Object.fromEntries(
    KEYS.map((key) => [key, a[key] + (b[key] - a[key]) * t]),
  ) as unknown as Pose;
const withPartial = (base: Pose, part?: Partial<Pose>): Pose => {
  if (!part) return base;
  const next = { ...base } as Record<(typeof KEYS)[number], number>;
  for (const key of KEYS) {
    const value = part[key];
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = value;
  }
  return next as unknown as Pose;
};

/** What a controller needs about the scene (the target's place and depth). */
export interface ShotContext {
  readonly frame: Frame;
  /** A layer's centre (composition px) and depth at a time, or null. */
  readonly layerCenter: (
    id: string,
    time: number,
  ) => { x: number; y: number; depth: number } | null;
}

/**
 * The camera pose `local` seconds into a shot of `duration` seconds: the
 * start and end framing mixed by the easing, plus the controller's motion.
 */
export function shotPose(
  spec: CameraSpec,
  shot: Shot,
  local: number,
  duration: number,
  context: ShotContext,
  /** Composition time (for targets that move). */
  time = local,
): Pose {
  const u = duration > 0 ? Math.max(0, Math.min(1, local / duration)) : 0;
  const e = ease(shot.easing, u);
  const rest = restPose(spec);
  const start = withPartial(rest, shot.from);
  const end = withPartial(rest, shot.to);
  let pose = mix(start, end, e);
  const s = Math.max(0, Math.min(2, shot.strength));
  const d = referenceDistance(context.frame);
  const add = (delta: Partial<Pose>) => {
    const next = { ...pose } as Record<(typeof KEYS)[number], number>;
    for (const key of KEYS) next[key] += delta[key] ?? 0;
    pose = next as unknown as Pose;
  };
  const dir = shot.direction;
  switch (shot.controller) {
    case 'hold':
      break;
    case 'push-in':
      add({ z: e * s * d * 0.18 });
      break;
    case 'pull-out':
      add({ z: (1 - e) * s * d * 0.18 });
      break;
    case 'pan-left':
      add({ pan: (0.5 - e) * s * 10 });
      break;
    case 'pan-right':
      add({ pan: (e - 0.5) * s * 10 });
      break;
    case 'pan-up':
      add({ tilt: (0.5 - e) * s * 8 });
      break;
    case 'pan-down':
      add({ tilt: (e - 0.5) * s * 8 });
      break;
    case 'tilt':
      add({ tilt: (e - 0.5) * s * 8 * dir, roll: 0 });
      break;
    case 'orbit': {
      // Around the target (or the centre): truck on an arc, pan to keep it.
      const target = shot.target
        ? context.layerCenter(shot.target, time)
        : null;
      const radius = d + (target?.depth ?? 0);
      const theta = ((e - 0.5) * s * 30 * dir * Math.PI) / 180;
      add({
        x: Math.sin(theta) * radius * 0.6,
        z: (1 - Math.cos(theta)) * radius * 0.6,
        pan: ((theta * 180) / Math.PI) * 0.6,
      });
      break;
    }
    case 'dolly-zoom': {
      // The subject at depth 0 keeps its size; the background changes.
      const z = e * s * d * 0.3;
      add({ z });
      pose = { ...pose, focal: pose.focal * ((d - pose.z) / d) };
      break;
    }
    case 'handheld': {
      const p = time * shot.speed;
      const amount = shot.amount * s;
      add({
        x: noise(shot.seed, p, 0) * amount,
        y: noise(shot.seed, p, 1) * amount,
        roll: noise(shot.seed, p, 2) * amount * 0.02,
      });
      break;
    }
    case 'whip-pan': {
      // Fast in the middle: most of the turn happens in a fifth of the shot.
      const w = 1 / (1 + Math.exp(-(u - 0.5) * 24));
      add({ pan: (w - 0.5) * s * 40 * dir });
      break;
    }
    case 'rack-focus': {
      const target = shot.target
        ? context.layerCenter(shot.target, time)
        : null;
      const from = shot.from?.focus ?? pose.focus;
      const to = target?.depth ?? shot.to?.focus ?? from + d * 0.5 * s;
      pose = { ...pose, focus: from + (to - from) * e };
      break;
    }
    case 'follow': {
      const target = shot.target
        ? context.layerCenter(shot.target, time)
        : null;
      if (target)
        pose = {
          ...pose,
          x: (target.x - context.frame.width / 2) * Math.min(1, s),
          y: (target.y - context.frame.height / 2) * Math.min(1, s),
        };
      break;
    }
    case 'parallax-drift':
      add({
        x: (e - 0.5) * s * d * 0.08 * dir,
        z: e * s * d * 0.03,
        ...(shot.amount
          ? {
              y: noise(shot.seed, time * shot.speed, 1) * shot.amount * 0.5,
            }
          : {}),
      });
      break;
  }
  return pose;
}

/** Track To: the truck that centres the target, and the roll of the up axis. */
export function applyTrackTo(
  spec: CameraSpec,
  pose: Pose,
  context: ShotContext,
  time: number,
): Pose {
  if (!spec.trackTo.layerId) return pose;
  const target = context.layerCenter(spec.trackTo.layerId, time);
  const roll =
    spec.trackTo.up === '-Y'
      ? 180
      : spec.trackTo.up === 'X'
        ? -90
        : spec.trackTo.up === '-X'
          ? 90
          : 0;
  if (!target) return { ...pose, roll: pose.roll + roll };
  return {
    ...pose,
    x: target.x - context.frame.width / 2,
    y: target.y - context.frame.height / 2,
    pan: 0,
    tilt: 0,
    roll: pose.roll + roll,
  };
}

/** "Randomise within safe limits": a fresh, tasteful variation. */
export function randomiseShot(shot: Shot, random: () => number): Shot {
  const pick = <T>(list: readonly T[]) =>
    list[Math.floor(random() * list.length)]!;
  return {
    ...shot,
    strength: Math.round((0.4 + random() * 0.8) * 100) / 100,
    easing: pick(['smooth', 'ease-in-out', 'ease-out'] as const),
    direction: random() < 0.5 ? 1 : -1,
    seed: 1 + Math.floor(random() * 9999),
    amount:
      shot.controller === 'handheld'
        ? Math.round((2 + random() * 8) * 10) / 10
        : shot.amount,
  };
}

// --- Reading the stored camera and shot --------------------------------------

const num = (value: unknown, low: number, high: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(low, Math.min(high, n)) : fallback;
};
const bool = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;
const pair = (value: unknown, fallback: Vec2): Vec2 =>
  Array.isArray(value) && value.length === 2
    ? [num(value[0], 0, 0.5, fallback[0]), num(value[1], 0, 0.5, fallback[1])]
    : fallback;
const oneOf = <T extends string>(
  value: unknown,
  list: readonly T[],
  fallback: T,
): T =>
  (list as readonly unknown[]).includes(value) ? (value as T) : fallback;
const idOrNull = (value: unknown) =>
  typeof value === 'string' && value.length <= 200 ? value : null;

/** A stored camera, read defensively (missing values: Blender's defaults). */
export function parseCameraSpec(text: string | undefined): CameraSpec | null {
  if (!text) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string')
    return null;
  const base = defaultCameraSpec(
    raw.id,
    typeof raw.name === 'string' ? raw.name.slice(0, 80) : 'Camera',
  );
  const dof = (raw.dof ?? {}) as Record<string, unknown>;
  const safe = (raw.safeAreas ?? {}) as Record<string, unknown>;
  const pass = (raw.passepartout ?? {}) as Record<string, unknown>;
  const guides = (raw.guides ?? {}) as Record<string, unknown>;
  const display = (raw.display ?? {}) as Record<string, unknown>;
  const track = (raw.trackTo ?? {}) as Record<string, unknown>;
  const bg = raw.background as Record<string, unknown> | null | undefined;
  return {
    ...base,
    type: oneOf(raw.type, ['persp', 'ortho'] as const, 'persp'),
    lensUnit: oneOf(raw.lensUnit, ['mm', 'fov'] as const, 'mm'),
    focal: num(raw.focal, 1, 5000, 50),
    orthoScale: num(raw.orthoScale, 0.01, 100, 1),
    sensorFit: oneOf(
      raw.sensorFit,
      ['auto', 'horizontal', 'vertical'] as const,
      'auto',
    ),
    sensor: num(raw.sensor, 1, 100, 36),
    shiftX: num(raw.shiftX, -2, 2, 0),
    shiftY: num(raw.shiftY, -2, 2, 0),
    clipStart: num(raw.clipStart, 0, 1e7, 0.1),
    clipEnd: num(raw.clipEnd, 0, 1e7, 100000),
    showLimits: bool(raw.showLimits, false),
    dof: {
      enabled: bool(dof.enabled, false),
      focusLayer: idOrNull(dof.focusLayer),
      distance: num(dof.distance, -1e6, 1e6, 0),
      fStop: num(dof.fStop, 0.5, 128, 2.8),
      blades: Math.round(num(dof.blades, 0, 16, 0)),
      rotation: num(dof.rotation, -180, 180, 0),
      ratio: num(dof.ratio, 0.25, 4, 1),
    },
    safeAreas: {
      show: bool(safe.show, false),
      title: pair(safe.title, base.safeAreas.title),
      action: pair(safe.action, base.safeAreas.action),
      centerCut: bool(safe.centerCut, false),
      centerTitle: pair(safe.centerTitle, base.safeAreas.centerTitle),
      centerAction: pair(safe.centerAction, base.safeAreas.centerAction),
    },
    passepartout: {
      show: bool(pass.show, true),
      alpha: num(pass.alpha, 0, 1, 0.5),
    },
    guides: Object.fromEntries(
      COMPOSITION_GUIDES.map((guide) => [guide, bool(guides[guide], false)]),
    ) as Record<CompositionGuide, boolean>,
    display: {
      size: num(display.size, 0.25, 5, 1),
      showName: bool(display.showName, true),
      showSensor: bool(display.showSensor, false),
    },
    background:
      bg && typeof bg === 'object' && typeof bg.assetId === 'string'
        ? {
            assetId: bg.assetId,
            alpha: num(bg.alpha, 0, 1, 0.5),
            depth: oneOf(bg.depth, ['back', 'front'] as const, 'back'),
            frame: oneOf(bg.frame, ['stretch', 'fit', 'crop'] as const, 'fit'),
            offset: Array.isArray(bg.offset)
              ? [num(bg.offset[0], -10, 10, 0), num(bg.offset[1], -10, 10, 0)]
              : [0, 0],
            rotation: num(bg.rotation, -360, 360, 0),
            scale: num(bg.scale, 0.01, 100, 1),
            flipX: bool(bg.flipX, false),
            flipY: bool(bg.flipY, false),
            render: bool(bg.render, false),
          }
        : null,
    trackTo: {
      layerId: idOrNull(track.layerId),
      up: oneOf(track.up, ['Y', '-Y', 'X', '-X'] as const, 'Y'),
    },
  };
}
const posePart = (value: unknown): Partial<Pose> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const part: Partial<Record<(typeof KEYS)[number], number>> = {};
  for (const key of KEYS)
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key]))
      part[key] = raw[key] as number;
  return Object.keys(part).length ? (part as Partial<Pose>) : undefined;
};
/** A stored shot, read defensively. */
export function parseShot(text: string | undefined): Shot | null {
  if (!text) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || typeof raw.cameraId !== 'string')
    return null;
  const from = posePart(raw.from),
    to = posePart(raw.to);
  return {
    cameraId: raw.cameraId,
    controller: oneOf(raw.controller, CONTROLLERS, 'hold'),
    easing: oneOf(raw.easing, CAMERA_EASINGS, 'smooth'),
    strength: num(raw.strength, 0, 2, 1),
    amount: num(raw.amount, 0, 200, 6),
    speed: num(raw.speed, 0, 30, 1.2),
    seed: Math.round(num(raw.seed, 0, 1e9, 1)),
    direction: raw.direction === -1 ? -1 : 1,
    target: idOrNull(raw.target),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}
