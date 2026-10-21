// FINAL3 C3: the camera frame on the canvas while editing. It shows what
// the selected shot's camera sees at its start or end (the Camera
// section's Start / End switch) and edits that framing: drag inside to
// truck (pan the frame), a corner to zoom (focal length, or the
// orthographic scale), the round handle to roll; the wheel over the frame
// dollies, Alt-drag or the middle button orbits (pan and tilt); Shift makes
// any of them fine. The pointer never commits: release writes one
// "Camera framing" step.
import type { AffineMatrix, Command, Composition, DeepReadonly } from '../core';
import { invertMatrix, transformPoint } from '../core';
import type { Pose, Shot } from '../camera/rig';
import {
  frameCorners,
  shotFramePose,
  type CameraShotEntry,
} from '../camera/shots';
import { updateShotCommands } from '../camera/shot-commands';
import {
  frameRotateHandle,
  type CameraFrameOverlay,
} from '../render/camera-overlay';
import { t } from '../i18n';

export interface CameraFrameDeps {
  readonly stage: HTMLElement;
  readonly canvas: HTMLElement;
  scene(): DeepReadonly<Composition>;
  /** The shot being framed (null: no frame). */
  shot(): CameraShotEntry | null;
  which(): 'start' | 'end';
  /** Composition → canvas CSS pixels. */
  matrix(): AffineMatrix;
  /** Whether the frame is shown and editable now. */
  active(): boolean;
  run(label: string, commands: Command[]): void;
  redraw(): void;
}

type Mode = 'move' | 'scale' | 'rotate' | 'orbit';
type Delta = Partial<Record<keyof Pose, number>>;

/** A pose plus a gesture's change (focal and ortho scale multiply). */
export function applyFrameDelta(pose: Pose, delta: Delta): Pose {
  const next = { ...pose } as Record<keyof Pose, number>;
  for (const [key, value] of Object.entries(delta) as [keyof Pose, number][])
    next[key] =
      key === 'focal' || key === 'orthoScale'
        ? pose[key] * value
        : pose[key] + value;
  return next as unknown as Pose;
}
/** The shot with a framing change written into its start or end. */
export function framedShot(
  shot: Shot,
  spec: { readonly focal: number; readonly orthoScale: number },
  which: 'start' | 'end',
  delta: Delta,
): Shot {
  const key = which === 'start' ? 'from' : 'to';
  const part: Record<string, number> = { ...(shot[key] ?? {}) };
  const rest: Record<string, number> = {
    x: 0,
    y: 0,
    z: 0,
    pan: 0,
    tilt: 0,
    roll: 0,
    focal: spec.focal,
    orthoScale: spec.orthoScale,
    focus: 0,
  };
  for (const [name, value] of Object.entries(delta) as [string, number][]) {
    const now = part[name] ?? rest[name] ?? 0;
    part[name] =
      name === 'focal' || name === 'orthoScale' ? now * value : now + value;
  }
  return { ...shot, [key]: part };
}

export function mountCameraFrame(deps: CameraFrameDeps) {
  let gesture: {
    mode: Mode;
    pointerId: number;
    start: [number, number];
    startScreen: [number, number];
    center: [number, number];
    corners: CameraFrameOverlay['corners'];
    entry: CameraShotEntry;
    which: 'start' | 'end';
    delta: Delta;
  } | null = null;
  const toComposition = (event: { clientX: number; clientY: number }) => {
    const box = deps.canvas.getBoundingClientRect();
    const inverse = invertMatrix(deps.matrix());
    if (!inverse) return null;
    return transformPoint(inverse, [
      event.clientX - box.left,
      event.clientY - box.top,
    ]) as [number, number];
  };
  const zoom = () => {
    const m = deps.matrix();
    return Math.hypot(m[0], m[1]) || 1;
  };
  const poseOf = (entry: CameraShotEntry, which: 'start' | 'end') =>
    shotFramePose(deps.scene() as never, entry, which);
  const cornersOf = (entry: CameraShotEntry, pose: Pose) =>
    frameCorners(entry.spec, pose, deps.scene());
  const overlay = (): CameraFrameOverlay | null => {
    if (!deps.active()) return null;
    const entry = gesture?.entry ?? deps.shot();
    if (!entry) return null;
    const which = gesture?.which ?? deps.which();
    const pose = applyFrameDelta(poseOf(entry, which), gesture?.delta ?? {});
    return {
      corners: cornersOf(entry, pose),
      label: `${entry.spec.name} · ${t(`cam.${which}`)}`,
    };
  };
  const inside = (
    point: readonly [number, number],
    corners: CameraFrameOverlay['corners'],
  ) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!,
        b = corners[(i + 1) % 4]!;
      const cross =
        (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
      if (Math.abs(cross) < 1e-9) continue;
      if (!sign) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
    return true;
  };
  /** What a press at a composition point grabs. */
  const hit = (
    point: readonly [number, number],
    shown: CameraFrameOverlay,
  ): Mode | null => {
    const near = 10 / zoom();
    const rotate = frameRotateHandle(shown.corners, 28 / zoom());
    if (Math.hypot(point[0] - rotate[0], point[1] - rotate[1]) <= near)
      return 'rotate';
    if (
      shown.corners.some(
        (corner) =>
          Math.hypot(point[0] - corner[0], point[1] - corner[1]) <= near,
      )
    )
      return 'scale';
    return inside(point, shown.corners) ? 'move' : null;
  };
  const centerOf = (
    corners: CameraFrameOverlay['corners'],
  ): [number, number] => [
    corners.reduce((sum, c) => sum + c[0], 0) / 4,
    corners.reduce((sum, c) => sum + c[1], 0) / 4,
  ];
  const down = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (
      !deps.canvas.contains(event.target as Node) &&
      event.target !== deps.canvas
    )
      return;
    const shown = overlay();
    const entry = deps.shot();
    if (!shown || !entry) return;
    const point = toComposition(event);
    if (!point) return;
    let mode = hit(point, shown);
    if (!mode) return;
    if (event.button === 1 || (event.altKey && mode === 'move')) mode = 'orbit';
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    gesture = {
      mode,
      pointerId: event.pointerId,
      start: point,
      startScreen: [event.clientX, event.clientY],
      center: centerOf(shown.corners),
      corners: shown.corners,
      entry,
      which: deps.which(),
      delta: {},
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
  };
  const move = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.stopPropagation();
    const point = toComposition(event);
    if (!point) return;
    const fine = event.shiftKey ? 0.1 : 1;
    const g = gesture;
    if (g.mode === 'move')
      g.delta = {
        x: (point[0] - g.start[0]) * fine,
        y: (point[1] - g.start[1]) * fine,
      };
    else if (g.mode === 'scale') {
      const before = Math.hypot(
        g.start[0] - g.center[0],
        g.start[1] - g.center[1],
      );
      const after = Math.hypot(point[0] - g.center[0], point[1] - g.center[1]);
      if (!(before > 0) || !(after > 0)) return;
      const ratio = 1 + (after / before - 1) * fine;
      // A bigger frame sees more: a shorter lens (or a larger ortho scale).
      g.delta =
        g.entry.spec.type === 'ortho'
          ? { orthoScale: Math.max(0.01, ratio) }
          : { focal: 1 / Math.max(0.01, ratio) };
    } else if (g.mode === 'rotate') {
      const a = Math.atan2(g.start[1] - g.center[1], g.start[0] - g.center[0]);
      const b = Math.atan2(point[1] - g.center[1], point[0] - g.center[0]);
      let turn = ((b - a) * 180) / Math.PI;
      if (turn > 180) turn -= 360;
      if (turn < -180) turn += 360;
      g.delta = { roll: turn * fine };
    } else {
      const dx = event.clientX - g.startScreen[0],
        dy = event.clientY - g.startScreen[1];
      g.delta = { pan: -dx * 0.1 * fine, tilt: -dy * 0.1 * fine };
    }
    deps.redraw();
  };
  const finish = (commit: boolean) => {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    const g = gesture;
    gesture = null;
    if (
      commit &&
      g &&
      Object.values(g.delta).some(
        (value) => Number.isFinite(value) && (value as number) !== 0,
      ) &&
      !(
        Object.keys(g.delta).length === 1 &&
        (g.delta.focal === 1 || g.delta.orthoScale === 1)
      )
    )
      deps.run(
        'Camera framing',
        updateShotCommands(
          deps.scene() as never,
          g.entry.layer.id,
          framedShot(g.entry.shot, g.entry.spec, g.which, g.delta),
        ),
      );
    deps.redraw();
  };
  const up = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.stopPropagation();
    // The click that follows belongs to the gesture, not to the canvas.
    const swallow = (click: Event) => {
      click.stopPropagation();
      click.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
    finish(true);
  };
  const cancel = () => finish(false);
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) return;
    const shown = overlay();
    const entry = deps.shot();
    if (!shown || !entry) return;
    const point = toComposition(event);
    if (!point || !inside(point, shown.corners)) return;
    event.preventDefault();
    event.stopPropagation();
    const fine = event.shiftKey ? 0.1 : 1;
    const step = Math.max(-200, Math.min(200, -event.deltaY)) * fine;
    deps.run(
      'Camera framing',
      updateShotCommands(
        deps.scene() as never,
        entry.layer.id,
        framedShot(entry.shot, entry.spec, deps.which(), { z: step }),
      ),
    );
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && gesture) {
      event.stopPropagation();
      cancel();
    }
  };
  deps.stage.addEventListener('pointerdown', down, true);
  deps.stage.addEventListener('wheel', wheel, {
    capture: true,
    passive: false,
  });
  window.addEventListener('keydown', key, true);
  return {
    overlay,
    get active() {
      return !!gesture;
    },
    dispose() {
      deps.stage.removeEventListener('pointerdown', down, true);
      deps.stage.removeEventListener('wheel', wheel, true);
      window.removeEventListener('keydown', key, true);
    },
  };
}
