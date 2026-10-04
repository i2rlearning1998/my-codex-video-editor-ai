// T1: one drag controller for every in-app drag source (Media cards, library
// cards, shape presets, My Templates, the text box). It follows the pointer
// with pointer events, not the browser's HTML5 drag and drop, so no browser
// drag session, drag image or dataTransfer negotiation can get stuck: a drag
// is a plain record in this module, cleared on release, Escape, pointer
// cancel, window blur and a hidden page. OS files still use HTML5 drag and
// drop (window level, in the shell), because a page can receive files only
// that way.
import { setAssetDrag } from './drag-state';

/** What a drag carries. */
export interface DragPayload {
  readonly kind: 'asset' | 'library' | 'preset' | 'mine' | 'textbox';
  /** The asset id, library item id, shape preset or My Template id. */
  readonly id: string;
  readonly name: string;
  /** An image for the ghost (a thumbnail URL), when there is one. */
  readonly thumb?: string | null;
  /** Media kind of an asset. */
  readonly media?: 'image' | 'video' | 'audio';
  /** Length of the clip a drop makes (seconds). */
  readonly duration?: number;
  /** Natural size (asset pixels); the canvas preview scales it to fit. */
  readonly width?: number;
  readonly height?: number;
}

export interface DragPoint {
  readonly x: number;
  readonly y: number;
  /** The element under the pointer (the ghost never takes the pointer). */
  readonly element: Element | null;
}

export interface DropTarget {
  /** The area the target covers: the pointer is over it when inside. */
  contains(element: Element): boolean;
  /** The pointer moves over the target; returns whether a drop is allowed. */
  over(payload: DragPayload, point: DragPoint): boolean;
  /** The pointer left the target, or the drag ended. */
  leave(): void;
  drop(payload: DragPayload, point: DragPoint): void;
  /** Released where the target refuses (it may say why). */
  refuse?(payload: DragPayload, point: DragPoint): void;
}

export interface DragController {
  /** Makes `element` a drag source; `payload` is read when a drag starts. */
  source(element: HTMLElement, payload: () => DragPayload | null): () => void;
  register(target: DropTarget): () => void;
  /** The payload being dragged, if any. */
  current(): DragPayload | null;
  cancel(): void;
  dispose(): void;
}

/** Pixels the pointer must travel before a press becomes a drag. */
const THRESHOLD = 4;

export function createDragController(
  options: { report?: (error: unknown) => void } = {},
): DragController {
  const targets = new Set<DropTarget>();
  let pending: {
    payload: () => DragPayload | null;
    x: number;
    y: number;
    pointerId: number;
    source: HTMLElement;
  } | null = null;
  let active: {
    payload: DragPayload;
    ghost: HTMLElement;
    target: DropTarget | null;
    allowed: boolean;
    source: HTMLElement;
  } | null = null;
  const root = document.documentElement;
  const safely = (run: () => void) => {
    try {
      run();
    } catch (error) {
      options.report?.(error);
    }
  };

  const ghostFor = (payload: DragPayload) => {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost drag-follow';
    ghost.setAttribute('aria-hidden', 'true');
    const image = document.createElement('span');
    image.className = 'drag-ghost-thumb';
    if (payload.thumb)
      image.style.backgroundImage = `url("${payload.thumb.replace(/"/g, '%22')}")`;
    const label = document.createElement('span');
    label.className = 'drag-ghost-name';
    label.textContent = payload.name;
    ghost.append(image, label);
    document.body.append(ghost);
    return ghost;
  };
  const pointAt = (x: number, y: number): DragPoint => ({
    x,
    y,
    element: document.elementFromPoint(x, y),
  });
  const targetAt = (point: DragPoint) => {
    if (!point.element) return null;
    for (const target of targets)
      if (target.contains(point.element)) return target;
    return null;
  };
  const move = (x: number, y: number) => {
    if (!active) return;
    active.ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
    const point = pointAt(x, y);
    const target = targetAt(point);
    if (target !== active.target) {
      const left = active.target;
      active.target = target;
      if (left) safely(() => left.leave());
    }
    let allowed = false;
    if (target) safely(() => (allowed = target.over(active!.payload, point)));
    active.allowed = allowed;
    root.dataset.dragging = allowed ? 'allowed' : 'refused';
  };
  // A press that turned into a drag must not also click the card.
  const swallowClick = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  const end = (drop: DragPoint | null) => {
    const ending = active;
    pending = null;
    active = null;
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', onCancel);
    document.removeEventListener('visibilitychange', onVisibility);
    delete root.dataset.dragging;
    if (!ending) return setAssetDrag(null);
    ending.ghost.remove();
    window.addEventListener('click', swallowClick, true);
    // The click (if any) follows the pointerup in the same task.
    setTimeout(() => window.removeEventListener('click', swallowClick, true));
    const target = ending.target;
    // The target decides again at the release point (a drag can end without
    // a final pointermove), while the drag record is still readable.
    if (drop && target && targetAt(drop) === target)
      safely(() => {
        if (target.over(ending.payload, drop))
          target.drop(ending.payload, drop);
        else target.refuse?.(ending.payload, drop);
      });
    if (target) safely(() => target.leave());
    setAssetDrag(null);
  };
  const begin = (x: number, y: number) => {
    if (!pending) return;
    const payload = pending.payload();
    const source = pending.source;
    pending = null;
    if (!payload) return end(null);
    if (payload.kind === 'asset' && payload.media)
      setAssetDrag({
        assetId: payload.id,
        type: payload.media,
        name: payload.name,
        duration: payload.duration ?? 5,
        ...(payload.width && payload.height
          ? { width: payload.width, height: payload.height }
          : {}),
      });
    active = {
      payload,
      ghost: ghostFor(payload),
      target: null,
      allowed: false,
      source,
    };
    move(x, y);
  };
  const onMove = (event: PointerEvent) => {
    if (pending && event.pointerId === pending.pointerId) {
      if (
        Math.hypot(event.clientX - pending.x, event.clientY - pending.y) <
        THRESHOLD
      )
        return;
      begin(event.clientX, event.clientY);
    }
    if (!active) return;
    event.preventDefault();
    move(event.clientX, event.clientY);
  };
  const onUp = (event: PointerEvent) => {
    if (!active) return end(null);
    event.preventDefault();
    end(pointAt(event.clientX, event.clientY));
  };
  const onCancel = () => end(null);
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') end(null);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || (!active && !pending)) return;
    event.preventDefault();
    event.stopPropagation();
    end(null);
  };
  const start = (
    event: PointerEvent,
    source: HTMLElement,
    payload: () => DragPayload | null,
  ) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (active || pending) end(null);
    pending = {
      payload,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      source,
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onCancel);
    document.addEventListener('visibilitychange', onVisibility);
  };

  return {
    source(element, payload) {
      // No browser drag: neither the card nor an image inside it.
      element.draggable = false;
      for (const image of element.querySelectorAll('img'))
        image.draggable = false;
      element.dataset.dragSource = 'true';
      const down = (event: PointerEvent) => start(event, element, payload);
      // An image added later (a thumbnail) must not start a browser drag.
      const native = (event: DragEvent) => event.preventDefault();
      element.addEventListener('pointerdown', down);
      element.addEventListener('dragstart', native);
      return () => {
        element.removeEventListener('pointerdown', down);
        element.removeEventListener('dragstart', native);
      };
    },
    register(target) {
      targets.add(target);
      return () => targets.delete(target);
    },
    current: () => active?.payload ?? null,
    cancel: () => end(null),
    dispose() {
      end(null);
      targets.clear();
    },
  };
}

let shared: DragController | null = null;
let reporter: ((error: unknown) => void) | undefined;
/** The page's one drag controller (sources and targets in any module). */
export function drags(): DragController {
  shared ??= createDragController({ report: (error) => reporter?.(error) });
  return shared;
}
/** The shell reports errors raised by drop targets. */
export function setDragReporter(report: (error: unknown) => void): void {
  reporter = report;
}
