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
  const zoomTo = (zoom: number, at: Point2 = center()) => {
    const inverse = invertMatrix(
      viewportFor(session.canvasZoom, session.canvasPan).matrix,
    );
    if (!inverse) return;
    const point = transformPoint(inverse, at);
    const next = viewportFor(zoom, [0, 0]).matrix;
    const landed = transformPoint(next, point);
    session.setCanvasView(zoom, [at[0] - landed[0], at[1] - landed[1]]);
  };
  const fitScale = () => viewportFor(1, [0, 0]).matrix[0];
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
    session.setCanvasView(session.canvasZoom, [
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
    session.setCanvasView(session.canvasZoom, [x - dx * lines, y - dy * lines]);
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
      session.setCanvasView(cover / view.matrix[0], [0, 0]);
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
