import type { PlaceTool } from './draw-palette';
import { invertMatrix, transformPoint, type Point2 } from '../core';
import { pickLayer, type Viewport } from '../render/canvas';
import { deriveRenderItems, locateLayer } from '../render/adapter';
import {
  hitHandle,
  hitMultiHandle,
  multiSelectionGeometry,
  selectionGeometry,
  type TransformHandle,
} from '../render/selection';
import type { EditorSession } from './session';
import type { TransformInteraction } from './transform-interaction';
import { SNAP_PIXELS } from './snapping';
import type { DrawTool } from './draw-tool';
import type { CropTool } from './crop-tool';
import { guardAnimated } from './editor-mode';

/**
 * CV-022: map a picked leaf to the selectable layer. Outside any entered group
 * that is its top-level ancestor; inside an entered group it is that group's
 * child on the path. `inside` is false when the pick lies outside the group.
 */
export function resolvePick(
  source: EditorSession['source'],
  picked: string | null,
  entered: string | null,
): { id: string | null; inside: boolean } {
  if (!picked) return { id: null, inside: false };
  const item = deriveRenderItems(source).items.find(
    (entry) => entry.id === picked,
  );
  const path = [...(item?.ancestors ?? []), picked];
  const at = entered ? path.indexOf(entered) : -1;
  return at >= 0 && at < path.length - 1
    ? { id: path[at + 1]!, inside: true }
    : { id: path[0]!, inside: false };
}
/**
 * H1.1: whether a layer's drawn box (a convex quad, possibly rotated) touches
 * the axis-aligned marquee from `a` to `b`, by the separating-axis test: the
 * marquee's two axes and the quad's own edge normals.
 */
export function quadTouchesRect(
  quad: readonly Point2[],
  a: Point2,
  b: Point2,
): boolean {
  const rect: Point2[] = [
    [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
    [Math.max(a[0], b[0]), Math.min(a[1], b[1])],
    [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
    [Math.min(a[0], b[0]), Math.max(a[1], b[1])],
  ];
  const axes: Point2[] = [
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i < quad.length; i++) {
    const p = quad[i]!,
      q = quad[(i + 1) % quad.length]!;
    if (p[0] !== q[0] || p[1] !== q[1]) axes.push([q[1] - p[1], p[0] - q[0]]);
  }
  const project = (points: readonly Point2[], axis: Point2) => {
    const values = points.map(
      (point) => point[0] * axis[0] + point[1] * axis[1],
    );
    return [Math.min(...values), Math.max(...values)] as const;
  };
  return axes.every((axis) => {
    const [minA, maxA] = project(quad, axis);
    const [minB, maxB] = project(rect, axis);
    return maxA >= minB && maxB >= minA;
  });
}
/** DOM pointer lifetime only; the controller resolves and commits semantic edits. */
export function bindCanvasInteraction(
  canvas: HTMLCanvasElement,
  session: EditorSession,
  interaction: TransformInteraction,
  viewport: () => Viewport,
  report: (error: unknown) => void,
  edit?: (action: 'delete' | 'duplicate') => void,
  externalKeyboard = false,
  onContextMenu?: (point: Point2, layerId: string | null) => void,
  draw?: DrawTool,
  /** H3: the crop tool (picture and video layers). */
  crop?: CropTool,
  /** H3: the object or empty artboard under the pointer changed. */
  onHover?: (target: string | 'artboard' | null) => void,
  /** I2: the Draw palette's Shape, Line, Sticky note and Text tools. */
  place?: PlaceTool,
) {
  let pointer: number | null = null;
  let cropping = false;
  /** H4: what the current drag changes, for the Editor-mode guard. */
  let dragKind: TransformHandle | 'move' = 'move';
  // CV-041: a multi-selection has its own box and handles (revision 6).
  const handleAt = (point: Point2): TransformHandle | null =>
    session.selectedIds.length > 1
      ? hitMultiHandle(session.source, viewport().matrix, point)
      : hitHandle(session.source, session.selectedId, viewport().matrix, point);
  const handleCursor = (handle: TransformHandle) =>
    (session.selectedIds.length > 1
      ? multiSelectionGeometry(session.source, viewport().matrix)
      : selectionGeometry(session.source, session.selectedId, viewport().matrix)
    )?.handles.find((item) => item.id === handle)?.cursor;
  // SHP-018: in draw mode the canvas draws instead of picking (revision 5).
  const drawing = () => !!draw && session.drawBrush !== null;
  // Clicking outside the entered group leaves isolation (CV-022).
  const pick = (point: Point2) => {
    const resolved = resolvePick(
      session.source,
      pickLayer(session.source, viewport(), point),
      session.enteredGroupId,
    );
    if (!resolved.inside && session.enteredGroupId) session.enterGroup(null);
    return resolved.id;
  };
  let marquee: {
    start: Point2;
    ids: readonly string[];
    box: HTMLDivElement;
  } | null = null;
  let start: Point2 = [0, 0];
  let moved = false;
  let suppressClick = false;
  /**
   * G2.4: a click (no drag) on one member of a multi-selection selects just
   * that member; a drag still moves them all (like Canva and Figma).
   */
  let collapseTo: string | null = null;
  const release = () => {
    const id = pointer;
    pointer = null;
    canvas.style.cursor = 'default';
    if (id !== null && canvas.hasPointerCapture(id))
      canvas.releasePointerCapture(id);
  };
  const cancel = () => {
    release();
    // A crop drag stops; the crop tool itself stays open (Cancel or Escape
    // leaves it).
    cropping = false;
    crop?.end();
    draw?.cancel();
    place?.cancel();
    interaction.cancel();
    marquee?.box.remove();
    marquee = null;
    interaction.setHighlight([]);
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
      // H3: while cropping, the canvas edits the crop frame; a press
      // outside it applies the crop (Canva).
      if (crop?.active) {
        suppressClick = true;
        if (crop.begin(viewport().matrix, point)) {
          cropping = true;
          pointer = event.pointerId;
          canvas.setPointerCapture(pointer);
          canvas.focus({ preventScroll: true });
          event.preventDefault();
        } else crop.done();
        return;
      }
      if (place?.armed) {
        suppressClick = true;
        place.begin(compositionPoint(point));
        pointer = event.pointerId;
        canvas.setPointerCapture(pointer);
        canvas.focus({ preventScroll: true });
        event.preventDefault();
        return;
      }
      if (drawing()) {
        const at = compositionPoint(point);
        const { width, height } = session.source.composition;
        suppressClick = true;
        if (at[0] < 0 || at[1] < 0 || at[0] > width || at[1] > height) return;
        draw!.begin(at);
        pointer = event.pointerId;
        canvas.setPointerCapture(pointer);
        canvas.focus({ preventScroll: true });
        event.preventDefault();
        return;
      }
      const handle = handleAt(point);
      if (handle === null) {
        const picked = pick(point);
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
        collapseTo =
          session.selectedIds.length > 1 && session.selectedIds.includes(picked)
            ? picked
            : null;
      } else collapseTo = null;
      suppressClick = true;
      if (!interaction.begin(handle ?? 'move', compositionPoint(point))) return;
      dragKind = handle ?? 'move';
      pointer = event.pointerId;
      start = point;
      moved = false;
      canvas.setPointerCapture(pointer);
      canvas.style.cursor =
        handle === 'rotate'
          ? 'grabbing'
          : handle === null
            ? 'move'
            : (handleCursor(handle) ?? 'default');
      canvas.focus({ preventScroll: true });
      event.preventDefault();
    });
  /** The layers a marquee from its start to `end` selects (G3: also live). */
  const marqueeIds = (end: Point2): string[] => {
    const a = marquee!.start;
    const selected = deriveRenderItems(session.source)
      .items.filter((item) => {
        const box = selectionGeometry(
          session.source,
          item.id,
          viewport().matrix,
        );
        return !!box && quadTouchesRect(box.corners, a, end);
      })
      .map((item) =>
        resolvePick(session.source, item.id, session.enteredGroupId),
      )
      .filter((resolved) => !session.enteredGroupId || resolved.inside)
      .map((resolved) => resolved.id!);
    return [...new Set([...marquee!.ids, ...selected])];
  };
  const update = (event: PointerEvent) => {
    const point = screenPoint(event);
    if (cropping) {
      crop?.update(viewport().matrix, point);
      return;
    }
    if (draw?.active) {
      draw.add(compositionPoint(point), event.shiftKey);
      return;
    }
    if (place?.active) {
      place.update(compositionPoint(point));
      return;
    }
    if (marquee) {
      const rect = canvas.getBoundingClientRect();
      Object.assign(marquee.box.style, {
        left: `${rect.left + Math.min(point[0], marquee.start[0])}px`,
        top: `${rect.top + Math.min(point[1], marquee.start[1])}px`,
        width: `${Math.abs(point[0] - marquee.start[0])}px`,
        height: `${Math.abs(point[1] - marquee.start[1])}px`,
      });
      // G3: the layers the marquee would select are outlined as it grows.
      interaction.setHighlight(marqueeIds(point));
      return;
    }
    if (!moved && Math.hypot(point[0] - start[0], point[1] - start[1]) >= 3) {
      // H4: in Editor mode an animated layer is changed in 2D Animation.
      try {
        guardAnimated(
          session,
          session.selectedIds,
          dragKind === 'move'
            ? ['position']
            : dragKind === 'rotate'
              ? ['rotation']
              : ['scale', 'width', 'height', 'position'],
        );
      } catch (error) {
        interaction.cancel();
        if (pointer !== null && canvas.hasPointerCapture(pointer))
          canvas.releasePointerCapture(pointer);
        pointer = null;
        report(error);
        return;
      }
      moved = true;
    }
    if (moved) {
      // CV-013: snap within 6 CSS px at any zoom; Ctrl or Cmd places freely.
      const [a, b] = viewport().matrix;
      interaction.update(
        compositionPoint(point),
        event.shiftKey,
        event.altKey,
        event.ctrlKey || event.metaKey
          ? undefined
          : SNAP_PIXELS / Math.hypot(a, b),
      );
    }
  };
  const pointermove = (event: PointerEvent) =>
    safely(() => {
      if (pointer === null) {
        if (drawing()) {
          interaction.hover(null);
          canvas.style.cursor = 'crosshair';
          return;
        }
        const point = screenPoint(event);
        if (crop?.active) {
          const hit = crop.hit(viewport().matrix, point);
          canvas.style.cursor =
            hit === null
              ? 'default'
              : hit === 'move'
                ? 'move'
                : hit === 0 || hit === 2
                  ? 'nwse-resize'
                  : hit === 1 || hit === 3
                    ? 'nesw-resize'
                    : hit === 'left' || hit === 'right'
                      ? 'ew-resize'
                      : 'ns-resize';
          return;
        }
        const handle = handleAt(point);
        interaction.hover(handle);
        const picked = pickLayer(session.source, viewport(), point);
        canvas.style.cursor =
          (handle === null ? undefined : handleCursor(handle)) ??
          (picked ? 'move' : 'default');
        // H3: outline what a click would select, or the empty page.
        if (onHover) {
          const resolved = resolvePick(
            session.source,
            picked,
            session.enteredGroupId,
          );
          const at = compositionPoint(point);
          const { width, height } = session.source.composition;
          onHover(
            handle !== null
              ? null
              : (resolved.id ??
                  (at[0] >= 0 && at[1] >= 0 && at[0] <= width && at[1] <= height
                    ? 'artboard'
                    : null)),
          );
        }
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
      if (cropping) {
        cropping = false;
        crop?.end();
        release();
        return;
      }
      if (draw?.active) {
        release();
        draw.finish();
        return;
      }
      if (place?.active) {
        release();
        place.finish();
        return;
      }
      if (marquee) {
        const end = screenPoint(event);
        const ids = marqueeIds(end);
        const click =
          Math.hypot(end[0] - marquee.start[0], end[1] - marquee.start[1]) < 3;
        marquee.box.remove();
        marquee = null;
        interaction.setHighlight([]);
        release();
        session.selectMany(ids);
        // H3: a click on the empty page selects the page (the scene bar);
        // a click on the stage outside it deselects everything.
        if (click && !ids.length) {
          const at = compositionPoint(end);
          const { width, height } = session.source.composition;
          session.setCanvasSelected(
            at[0] >= 0 && at[1] >= 0 && at[0] <= width && at[1] <= height,
          );
        }
        return;
      }
      release();
      interaction.finish();
      if (!moved && collapseTo) session.select(collapseTo);
      collapseTo = null;
    });
  const pointercancel = (event: PointerEvent) => {
    if (event.pointerId === pointer) cancel();
  };
  const lostpointercapture = (event: PointerEvent) => {
    if (event.pointerId === pointer) cancel();
  };
  canvas.onclick = (event) =>
    safely(() => {
      if (drawing()) return;
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      session.select(
        pick(screenPoint(event)),
        event.shiftKey || event.ctrlKey || event.metaKey,
      );
    });
  // Double-click enters the group under the pointer and selects its child.
  canvas.ondblclick = (event) =>
    safely(() => {
      if (drawing()) return;
      const point = screenPoint(event);
      const leaf = pickLayer(session.source, viewport(), point);
      const current = resolvePick(session.source, leaf, session.enteredGroupId);
      if (!current.id) return;
      const found = locateLayer(session.source.composition.layers, current.id);
      // H3: a double-click on a picture or video crops it (Canva).
      if (
        crop &&
        (found?.layer.type === 'image' || found?.layer.type === 'video')
      ) {
        session.select(current.id);
        crop.start(current.id);
        return;
      }
      if (found?.layer.type !== 'group') return;
      session.enterGroup(current.id);
      session.select(resolvePick(session.source, leaf, current.id).id);
    });
  const keydown = (event: KeyboardEvent) => {
    // H3: Enter applies a crop, Escape cancels it.
    if (crop?.active && (event.key === 'Escape' || event.key === 'Enter')) {
      event.preventDefault();
      if (event.key === 'Enter') crop.done();
      else crop.cancel();
      return;
    }
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
          guardAnimated(session, session.selectedIds, ['position']);
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
      onHover?.(null);
      interaction.hover(null);
      canvas.style.cursor = 'default';
    }
  };
  const contextmenu = (event: MouseEvent) =>
    safely(() => {
      event.preventDefault();
      if (drawing()) return;
      const point = screenPoint(event);
      const picked = pick(point);
      if (picked) {
        if (!session.selectedIds.includes(picked)) session.select(picked);
      } else session.select(null);
      onContextMenu?.(point, picked);
    });
  const listeners = {
    pointerleave,
    pointerdown,
    pointermove,
    pointerup,
    pointercancel,
    lostpointercapture,
    contextmenu,
  };
  for (const [type, listener] of Object.entries(listeners))
    canvas.addEventListener(type, listener as EventListener);
  const unsubscribe = session.onChange(() => {
    release();
    draw?.cancel();
    marquee?.box.remove();
    marquee = null;
  });
  if (!externalKeyboard) window.addEventListener('keydown', keydown, true);
  window.addEventListener('blur', cancel);
  return {
    get active() {
      return (
        pointer !== null ||
        interaction.active ||
        marquee !== null ||
        !!draw?.active ||
        !!place?.active
      );
    },
    handleKey: keydown,
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
