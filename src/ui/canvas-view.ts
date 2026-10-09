// G3: panning and zooming the canvas view. The view is transient session
// state (zoom relative to Fit, and a pan in CSS pixels); nothing is saved and
// no command runs. Pan with Space-drag, the middle button, the hand tool, a
// trackpad or wheel scroll (Shift scrolls sideways). Ctrl or Cmd with the
// wheel (and a trackpad pinch) zooms toward the pointer; the buttons and the
// % field zoom around the view's center; Fit also resets the pan.
import { invertMatrix, transformPoint, type Point2 } from '../core';
import type { Viewport } from '../render/canvas';
import { isTyping } from '../commands/shortcuts';
import type { EditorSession } from './session';

/** H1.4: how far past the view's edge the artboard may be panned (CSS px). */
export const PAN_MARGIN = 48;
/** H1.4: the smallest effective zoom (composition px per CSS px). */
export const MIN_VIEW_SCALE = 0.1;
/**
 * H1.4: the pan a view may use. `centered` is the view at the same zoom with
 * no pan. On an axis where the artboard fits, it stays centred (pan 0); where
 * it overflows, it may move until PAN_MARGIN px of stage show past its edge.
 */
export function clampPan(
  centered: Viewport,
  size: { width: number; height: number },
  pan: readonly [number, number],
): [number, number] {
  const [a, , , d, e, f] = centered.matrix;
  const axis = (start: number, length: number, view: number, value: number) => {
    if (length <= view + 1e-6) return 0;
    const min = view - PAN_MARGIN - (start + length),
      max = PAN_MARGIN - start;
    return Math.max(min, Math.min(max, value));
  };
  return [
    axis(e, Math.abs(a) * size.width, centered.width, pan[0]),
    axis(f, Math.abs(d) * size.height, centered.height, pan[1]),
  ];
}
export interface CanvasView {
  /** Multiplies the zoom, keeping the composition point under `at` still. */
  zoomBy(factor: number, at?: Point2): void;
  /** Sets the effective scale (1 = one composition pixel per CSS pixel). */
  zoomToScale(scale: number, at?: Point2): void;
  fit(): void;
  /** Zooms so the composition covers the whole view, centered. */
  fill(): void;
  actualSize(): void;
  toggleHand(): void;
  readonly hand: boolean;
  /** The effective scale: composition pixels to CSS pixels. */
  readonly scale: number;
  dispose(): void;
}

export function mountCanvasView(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  session: EditorSession,
  viewportFor: (zoom: number, pan: readonly [number, number]) => Viewport,
  togglePlayback: () => void,
  onHandChange: () => void,
): CanvasView {
  let hand = false;
  let space = false;
  let spaceUsed = false;
  let over = false;
  let pan: {
    pointer: number;
    start: Point2;
    from: readonly [number, number];
  } | null = null;
  const center = (): Point2 => [
    canvas.clientWidth / 2,
    canvas.clientHeight / 2,
  ];
  const local = (event: { clientX: number; clientY: number }): Point2 => {
    const box = canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };
  const fitScale = () => viewportFor(1, [0, 0]).matrix[0];
  /** Stores a view with its pan clamped (the rules of H1.4). */
  const setView = (zoom: number, pan: readonly [number, number]) => {
    const level = Math.max(zoom, MIN_VIEW_SCALE / fitScale());
    session.setCanvasView(
      level,
      clampPan(viewportFor(level, [0, 0]), session.source.composition, pan),
    );
  };
  const zoomTo = (zoom: number, at: Point2 = center()) => {
    const inverse = invertMatrix(
      viewportFor(session.canvasZoom, session.canvasPan).matrix,
    );
    if (!inverse) return;
    const level = Math.max(zoom, MIN_VIEW_SCALE / fitScale());
    const point = transformPoint(inverse, at);
    const next = viewportFor(level, [0, 0]).matrix;
    const landed = transformPoint(next, point);
    setView(level, [at[0] - landed[0], at[1] - landed[1]]);
  };
  const setCursor = () => {
    stage.classList.toggle('panning-ready', hand || space);
    stage.classList.toggle('panning', !!pan);
  };
  // Capture phase on the stage: a pan never reaches the canvas's own
  // selection and transform handling.
  const pointerdown = (event: PointerEvent) => {
    const panButton =
      event.button === 1 || (event.button === 0 && (hand || space));
    if (!panButton || pan) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (space) spaceUsed = true;
    pan = {
      pointer: event.pointerId,
      start: [event.clientX, event.clientY],
      from: session.canvasPan,
    };
    stage.setPointerCapture?.(event.pointerId);
    setCursor();
  };
  const pointermove = (event: PointerEvent) => {
    if (!pan || event.pointerId !== pan.pointer) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setView(session.canvasZoom, [
      pan.from[0] + event.clientX - pan.start[0],
      pan.from[1] + event.clientY - pan.start[1],
    ]);
  };
  const pointerup = (event: PointerEvent) => {
    if (!pan || event.pointerId !== pan.pointer) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pan = null;
    setCursor();
  };
  // The middle button's auxclick would otherwise open links or autoscroll.
  const auxclick = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault();
  };
  const wheel = (event: WheelEvent) => {
    // U3: menus, panels and toolbars floating over the stage scroll
    // themselves; only the canvas and the bare stage pan and zoom.
    const target = event.target as Element | null;
    if (
      target &&
      target !== canvas &&
      target !== stage &&
      !target.closest('#composition-canvas, .artboard-shadow') &&
      target.closest(
        '[role="menu"], .draw-panel, .draw-palette, .draw-flyout, .context-toolbar, .popover, .toolbar-popover, .scene-board, [data-wheel-scroll]',
      )
    )
      return;
    event.preventDefault();
    const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    if (event.ctrlKey || event.metaKey) {
      zoomTo(
        session.canvasZoom * Math.exp((-event.deltaY * lines) / 300),
        local(event),
      );
      return;
    }
    const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
    const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
    const [x, y] = session.canvasPan;
    // H1.4: a view where the artboard fits never moves (clampPan keeps 0).
    setView(session.canvasZoom, [x - dx * lines, y - dy * lines]);
  };
  // Space held over the canvas pans; a Space press without a drag still
  // plays or pauses (on release).
  const keydown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || !over || event.ctrlKey || event.metaKey)
      return;
    if (isTyping(document.activeElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || space) return;
    space = true;
    spaceUsed = false;
    setCursor();
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || !space) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    space = false;
    setCursor();
    if (!spaceUsed) togglePlayback();
  };
  const enter = () => (over = true);
  const leave = () => {
    over = false;
  };
  stage.addEventListener('pointerdown', pointerdown, true);
  stage.addEventListener('pointermove', pointermove, true);
  stage.addEventListener('pointerup', pointerup, true);
  stage.addEventListener('pointercancel', pointerup, true);
  stage.addEventListener('auxclick', auxclick);
  stage.addEventListener('pointerenter', enter);
  stage.addEventListener('pointerleave', leave);
  stage.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('keyup', keyup, true);
  return {
    zoomBy: (factor, at) => zoomTo(session.canvasZoom * factor, at),
    zoomToScale: (scale, at) => zoomTo(scale / fitScale(), at),
    fit: () => session.setCanvasView(1, [0, 0]),
    fill: () => {
      const view = viewportFor(1, [0, 0]);
      const { width, height } = session.source.composition;
      const cover = Math.max(view.width / width, view.height / height);
      setView(cover / view.matrix[0], [0, 0]);
    },
    actualSize: () => zoomTo(1 / fitScale()),
    toggleHand: () => {
      hand = !hand;
      setCursor();
      onHandChange();
    },
    get hand() {
      return hand;
    },
    get scale() {
      return viewportFor(session.canvasZoom, session.canvasPan).matrix[0];
    },
    dispose: () => {
      stage.removeEventListener('pointerdown', pointerdown, true);
      stage.removeEventListener('pointermove', pointermove, true);
      stage.removeEventListener('pointerup', pointerup, true);
      stage.removeEventListener('pointercancel', pointerup, true);
      stage.removeEventListener('auxclick', auxclick);
      stage.removeEventListener('pointerenter', enter);
      stage.removeEventListener('pointerleave', leave);
      stage.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup, true);
    },
  };
}
