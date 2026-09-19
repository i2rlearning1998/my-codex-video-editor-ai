import { invertMatrix, transformPoint, type Point2 } from '../core';
import { pickLayer, type Viewport } from '../render/canvas';
import { deriveRenderItems, locateLayer } from '../render/adapter';
import { hitHandle, selectionGeometry } from '../render/selection';
import type { EditorSession } from './session';
import type { TransformInteraction } from './transform-interaction';

/** DOM pointer lifetime only; the controller resolves and commits semantic edits. */
export function bindCanvasInteraction(
  canvas: HTMLCanvasElement,
  session: EditorSession,
  interaction: TransformInteraction,
  viewport: () => Viewport,
  report: (error: unknown) => void,
  edit?: (action: 'delete' | 'duplicate') => void,
) {
  let pointer: number | null = null;
  let marquee: {
    start: Point2;
    ids: readonly string[];
    box: HTMLDivElement;
  } | null = null;
  let start: Point2 = [0, 0];
  let moved = false;
  let suppressClick = false;
  const release = () => {
    const id = pointer;
    pointer = null;
    canvas.style.cursor = 'default';
    if (id !== null && canvas.hasPointerCapture(id))
      canvas.releasePointerCapture(id);
  };
  const cancel = () => {
    release();
    interaction.cancel();
    marquee?.box.remove();
    marquee = null;
  };
  const screenPoint = (event: MouseEvent): Point2 => {
    const bounds = canvas.getBoundingClientRect();
    const point: Point2 = [
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    ];
    if (!point.every(Number.isFinite))
      throw new RangeError('Invalid pointer coordinates');
    return point;
  };
  const compositionPoint = (point: Point2): Point2 => {
    const inverse = invertMatrix(viewport().matrix);
    if (!inverse) throw new RangeError('Viewport cannot be inverted');
    return transformPoint(inverse, point);
  };
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      cancel();
      report(error);
    }
  };
  const pointerdown = (event: PointerEvent) =>
    safely(() => {
      if (pointer !== null || event.button !== 0 || event.isPrimary === false)
        return;
      session.setPlaying(false);
      const point = screenPoint(event);
      const handle =
        session.selectedIds.length > 1
          ? null
          : hitHandle(
              session.source,
              session.selectedId,
              viewport().matrix,
              point,
            );
      if (handle === null) {
        const picked = pickLayer(session.source, viewport(), point);
        const selected = session.selectedId
          ? locateLayer(session.source.composition.layers, session.selectedId)
          : null;
        const insideGroup =
          selected?.layer.type === 'group' &&
          deriveRenderItems(session.source).items.some(
            (item) =>
              item.id === picked && item.ancestors.includes(selected.layer.id),
          );
        suppressClick = true;
        if (picked && (event.shiftKey || event.ctrlKey || event.metaKey)) {
          session.select(picked, true);
          return;
        }
        if (!picked) {
          const box = document.createElement('div');
          box.className = 'canvas-marquee';
          document.body.append(box);
          marquee = {
            start: point,
            ids: event.shiftKey ? session.selectedIds : [],
            box,
          };
          pointer = event.pointerId;
          canvas.setPointerCapture(pointer);
          canvas.focus();
          event.preventDefault();
          return;
        }
        if (!insideGroup && !session.selectedIds.includes(picked))
          session.select(picked);
      }
      suppressClick = true;
      if (!interaction.begin(handle ?? 'move', compositionPoint(point))) return;
      pointer = event.pointerId;
      start = point;
      moved = false;
      canvas.setPointerCapture(pointer);
      canvas.style.cursor =
        handle === 'rotate'
          ? 'grabbing'
          : handle === null
            ? 'move'
            : (selectionGeometry(
                session.source,
                session.selectedId,
                viewport().matrix,
              )?.handles.find((item) => item.id === handle)?.cursor ??
              'default');
      canvas.focus({ preventScroll: true });
      event.preventDefault();
    });
  const update = (event: PointerEvent) => {
    const point = screenPoint(event);
    if (marquee) {
      const rect = canvas.getBoundingClientRect();
      Object.assign(marquee.box.style, {
        left: `${rect.left + Math.min(point[0], marquee.start[0])}px`,
        top: `${rect.top + Math.min(point[1], marquee.start[1])}px`,
        width: `${Math.abs(point[0] - marquee.start[0])}px`,
        height: `${Math.abs(point[1] - marquee.start[1])}px`,
      });
      return;
    }
    if (Math.hypot(point[0] - start[0], point[1] - start[1]) >= 3) moved = true;
    if (moved) interaction.update(compositionPoint(point), event.shiftKey);
  };
  const pointermove = (event: PointerEvent) =>
    safely(() => {
      if (pointer === null) {
        const point = screenPoint(event);
        const handle =
          session.selectedIds.length > 1
            ? null
            : hitHandle(
                session.source,
                session.selectedId,
                viewport().matrix,
                point,
              );
        interaction.hover(handle);
        canvas.style.cursor =
          selectionGeometry(
            session.source,
            session.selectedId,
            viewport().matrix,
          )?.handles.find((item) => item.id === handle)?.cursor ??
          (pickLayer(session.source, viewport(), point) ? 'move' : 'default');
        return;
      }
      if (event.pointerId !== pointer) return;
      update(event);
      event.preventDefault();
    });
  const pointerup = (event: PointerEvent) =>
    safely(() => {
      if (event.pointerId !== pointer) return;
      update(event);
      if (marquee) {
        const end = screenPoint(event),
          a = marquee.start;
        const selected = deriveRenderItems(session.source)
          .items.filter((item) => {
            const box = selectionGeometry(
              session.source,
              item.id,
              viewport().matrix,
            );
            if (!box) return false;
            const xs = box.corners.map((p) => p[0]),
              ys = box.corners.map((p) => p[1]);
            return (
              Math.max(...xs) >= Math.min(a[0], end[0]) &&
              Math.min(...xs) <= Math.max(a[0], end[0]) &&
              Math.max(...ys) >= Math.min(a[1], end[1]) &&
              Math.min(...ys) <= Math.max(a[1], end[1])
            );
          })
          .map((item) => item.id);
        const ids = [...marquee.ids, ...selected];
        marquee.box.remove();
        marquee = null;
        release();
        session.selectMany(ids);
        return;
      }
      release();
      interaction.finish();
    });
  const pointercancel = (event: PointerEvent) => {
    if (event.pointerId === pointer) cancel();
  };
  const lostpointercapture = (event: PointerEvent) => {
    if (event.pointerId === pointer) cancel();
  };
  canvas.onclick = (event) =>
    safely(() => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      session.select(
        pickLayer(session.source, viewport(), screenPoint(event)),
        event.shiftKey || event.ctrlKey || event.metaKey,
      );
    });
  const keydown = (event: KeyboardEvent) => {
    if (event.target === canvas && event.key !== 'Escape') {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        safely(() => edit?.('delete'));
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'd'
      ) {
        event.preventDefault();
        safely(() => edit?.('duplicate'));
      } else if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        safely(() => {
          if (interaction.begin('move', [0, 0])) {
            interaction.update([
              event.key === 'ArrowLeft'
                ? -step
                : event.key === 'ArrowRight'
                  ? step
                  : 0,
              event.key === 'ArrowUp'
                ? -step
                : event.key === 'ArrowDown'
                  ? step
                  : 0,
            ]);
            interaction.finish();
          }
        });
      }
      return;
    }
    if (event.key !== 'Escape') return;
    if (interaction.active || marquee) {
      event.preventDefault();
      cancel();
    } else if (event.target === canvas) session.select(null);
  };
  const pointerleave = () => {
    if (pointer === null) {
      interaction.hover(null);
      canvas.style.cursor = 'default';
    }
  };
  const listeners = {
    pointerleave,
    pointerdown,
    pointermove,
    pointerup,
    pointercancel,
    lostpointercapture,
  };
  for (const [type, listener] of Object.entries(listeners))
    canvas.addEventListener(type, listener as EventListener);
  const unsubscribe = session.onChange(() => {
    release();
    marquee?.box.remove();
    marquee = null;
  });
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('blur', cancel);
  return {
    cancel,
    dispose() {
      cancel();
      unsubscribe();
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('blur', cancel);
      for (const [type, listener] of Object.entries(listeners))
        canvas.removeEventListener(type, listener as EventListener);
      canvas.onclick = null;
    },
  };
}
