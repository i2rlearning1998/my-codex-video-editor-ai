// FINAL2 U7: masks, layer blend modes and chroma key in the right panel,
// with mask handles and a chroma eyedropper on the canvas. The engines live
// in src/masks, src/blend and src/chroma (docs/MASKS-API.md, BLEND-API.md,
// CHROMA-API.md); every edit here is one validated capability command.
import {
  effectiveLayerTiming,
  invertMatrix,
  multiplyMatrices,
  transformPoint,
  worldTransform,
  type AffineMatrix,
  type Command,
  type EditorEngine,
  type Point2,
} from '../../core';
import {
  evaluateMask,
  getMaskHandles,
  moveHandle,
  registerLayerMasks,
  type Mask,
  type Matte,
  type ReadMask,
} from '../../masks';
import { BLEND_OPTIONS, registerLayerBlend } from '../../blend';
import {
  createWebGlChroma,
  registerChromaKey,
  settings as chromaSettings,
  type ChromaKey,
} from '../../chroma';
import { t } from '../../i18n';
import { locateLayer } from '../../render/adapter';
import { selectionBounds } from '../../render/selection';
import { iconSvg } from '../icons';
import { createColorField } from '../components/color-picker';
import { createNumberField } from '../components/number-field';
import { createSelect } from '../components/select';
import type { EditorSession } from '../session';

/** Transient UI state (never saved, no history). */
export const layerEffects = {
  /** The mask whose handles are shown, per layer. */
  maskId: null as string | null,
  /** The layer whose chroma eyedropper is armed. */
  eyedropper: null as string | null,
  /** Chroma preview quality; export always renders full. */
  quality: 'full' as 'full' | 'fast',
  /** Redraws the canvas (set by the shell). */
  requestDraw: () => {},
};

type Accordion = (
  id: string,
  title: string,
  content: readonly (HTMLElement | null | undefined)[],
) => HTMLElement;
export interface LayerEffectsContext {
  readonly engine: EditorEngine;
  readonly session: EditorSession;
  readonly accordion: Accordion;
  readonly run: (label: string, commands: (Command | null)[]) => void;
  readonly safely: (action: () => void) => void;
  readonly report: (error: unknown) => void;
  readonly rerender: () => void;
}

/** The stored (not time-evaluated) layer of the open scene. */
function storedLayer(engine: EditorEngine, session: EditorSession, id: string) {
  const scene = engine.state.compositions.find(
    (item) => item.id === session.source.composition.id,
  );
  return scene ? (locateLayer(scene.layers, id)?.layer ?? null) : null;
}
const clone = <T>(value: T): T => structuredClone(value) as T;
export function masksCommand(
  engine: EditorEngine,
  session: EditorSession,
  layerId: string,
  masks: readonly ReadMask[],
  matte?: Matte | null,
): Command {
  registerLayerMasks(engine);
  return {
    type: 'plugin:layer-masks:SET',
    input: {
      compositionId: session.source.composition.id,
      layerId,
      masks: clone(masks) as Mask[],
      ...(matte !== undefined ? { matte } : {}),
    },
  } as unknown as Command;
}
export function chromaCommand(
  engine: EditorEngine,
  session: EditorSession,
  layerId: string,
  chromaKey: ChromaKey | null,
): Command {
  registerChromaKey(engine);
  return {
    type: 'plugin:chroma-key:SET',
    input: {
      compositionId: session.source.composition.id,
      layerId,
      chromaKey,
    },
  } as unknown as Command;
}
export function blendCommand(
  engine: EditorEngine,
  session: EditorSession,
  layerId: string,
  blendMode: string,
): Command {
  registerLayerBlend(engine);
  return {
    type: 'plugin:layer-blend:SET',
    input: {
      compositionId: session.source.composition.id,
      layerId,
      blendMode,
    },
  } as unknown as Command;
}

/** Time local to the layer's effective start (mask keys use it). */
function localTime(session: EditorSession, layerId: string) {
  const found = locateLayer(session.source.composition.layers, layerId);
  if (!found) return 0;
  return Math.max(
    0,
    session.currentTime -
      effectiveLayerTiming(session.source.composition, found.layer).startTime,
  );
}
const KEY_EPSILON = 1e-3;
/** The mask's geometry where the playhead is. */
const evaluated = (mask: ReadMask, time: number) =>
  evaluateMask(mask, time).geometry;
/**
 * A handle edit: an animated mask writes the key at the playhead (adding one
 * there when none exists); a still mask edits its geometry.
 */
export function withGeometry(
  mask: ReadMask,
  geometry: readonly Point2[],
  time: number,
): ReadMask {
  const keys = mask.keyframes;
  if (!keys?.length) return { ...mask, geometry };
  const at = keys.findIndex((key) => Math.abs(key.time - time) < KEY_EPSILON);
  const next = keys.map((key) => ({ ...key }));
  if (at >= 0) next[at] = { ...next[at]!, value: geometry };
  else {
    next.push({ time, value: geometry });
    next.sort((a, b) => a.time - b.time);
  }
  return { ...mask, keyframes: next };
}

const MASK_TYPES = ['rect', 'ellipse', 'polygon', 'path'] as const;
/** A new mask in the middle of the layer's box (layer-local units). */
export function defaultMask(
  type: Mask['type'],
  box: { x: number; y: number; width: number; height: number },
  id: string,
): Mask {
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2,
    rx = box.width * 0.3,
    ry = box.height * 0.3;
  const round = (p: [number, number]): [number, number] => [
    Math.round(p[0] * 100) / 100,
    Math.round(p[1] * 100) / 100,
  ];
  if (type === 'rect' || type === 'ellipse')
    return {
      id,
      type,
      geometry: [round([cx - rx, cy - ry]), round([cx + rx, cy + ry])],
    };
  if (type === 'polygon')
    return {
      id,
      type,
      geometry: Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return round([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
      }),
    };
  // A closed cubic ellipse: start, then four control1/control2/end triplets.
  const k = 0.5523;
  const pts: [number, number][] = [[cx + rx, cy]];
  const quarter = [
    [
      [cx + rx, cy + ry * k],
      [cx + rx * k, cy + ry],
      [cx, cy + ry],
    ],
    [
      [cx - rx * k, cy + ry],
      [cx - rx, cy + ry * k],
      [cx - rx, cy],
    ],
    [
      [cx - rx, cy - ry * k],
      [cx - rx * k, cy - ry],
      [cx, cy - ry],
    ],
    [
      [cx + rx * k, cy - ry],
      [cx + rx, cy - ry * k],
      [cx + rx, cy],
    ],
  ] as [number, number][][];
  for (const segment of quarter) pts.push(...segment.map(round));
  return { id, type, geometry: pts.map(round) };
}

/** The mask's outline in layer-local units, for drawing. */
function outline(mask: ReadMask, geometry: readonly Point2[]): Point2[] {
  if (mask.type === 'rect') {
    const [a, b] = geometry as [Point2, Point2];
    return [a, [b[0], a[1]], b, [a[0], b[1]]];
  }
  if (mask.type === 'ellipse') {
    const [a, b] = geometry as [Point2, Point2];
    const cx = (a[0] + b[0]) / 2,
      cy = (a[1] + b[1]) / 2,
      rx = Math.abs(b[0] - a[0]) / 2,
      ry = Math.abs(b[1] - a[1]) / 2;
    return Array.from({ length: 48 }, (_, i) => {
      const angle = (i / 48) * Math.PI * 2;
      return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)] as Point2;
    });
  }
  if (mask.type === 'polygon') return [...geometry];
  const out: Point2[] = [geometry[0]!];
  for (let i = 1; i + 2 < geometry.length; i += 3) {
    const p0 = geometry[i - 1]!,
      p1 = geometry[i]!,
      p2 = geometry[i + 1]!,
      p3 = geometry[i + 2]!;
    for (let j = 1; j <= 12; j++) {
      const s = j / 12,
        u = 1 - s;
      out.push([
        u * u * u * p0[0] +
          3 * u * u * s * p1[0] +
          3 * u * s * s * p2[0] +
          s * s * s * p3[0],
        u * u * u * p0[1] +
          3 * u * u * s * p1[1] +
          3 * u * s * s * p2[1] +
          s * s * s * p3[1],
      ]);
    }
  }
  return out;
}

/** The selected single layer whose Masks section is open and visible. */
function openMaskLayer(session: EditorSession): string | null {
  const id = session.selectedIds.length === 1 ? session.selectedId : null;
  if (!id) return null;
  const section = document.querySelector<HTMLElement>(
    '#right-section [data-accordion="layer-masks"]',
  );
  const body = section?.querySelector<HTMLElement>('.right-accordion-body');
  if (
    !section ||
    section.dataset.layer !== id ||
    !body ||
    body.hidden ||
    !section.checkVisibility()
  )
    return null;
  return id;
}

/** The canvas side: mask handles and the chroma eyedropper. */
export interface EffectsCanvasTool {
  hit(view: AffineMatrix, point: Point2): boolean;
  begin(view: AffineMatrix, point: Point2): boolean;
  update(view: AffineMatrix, point: Point2): void;
  end(): void;
  cancel(): void;
  cursor(view: AffineMatrix, point: Point2): string | null;
}
const HANDLE_RADIUS = 9;
export function createEffectsCanvasTool(
  engine: EditorEngine,
  session: EditorSession,
  canvas: HTMLCanvasElement,
  report: (error: unknown) => void,
): EffectsCanvasTool & {
  draw(view: AffineMatrix): void;
} {
  let drag: {
    layerId: string;
    maskIndex: number;
    handle: number;
    inverse: AffineMatrix;
    masks: ReadMask[];
    time: number;
    command: Command | null;
  } | null = null;
  /** The active mask and its handles in canvas CSS px. */
  const handles = (view: AffineMatrix) => {
    const layerId = openMaskLayer(session);
    if (!layerId || layerEffects.eyedropper) return null;
    const layer = storedLayer(engine, session, layerId);
    if (!layer?.masks?.length) return null;
    const index = Math.max(
      0,
      layer.masks.findIndex((mask) => mask.id === layerEffects.maskId),
    );
    const mask = layer.masks[index]!;
    const time = localTime(session, layerId);
    const world = worldTransform(session.source.composition, layerId).matrix;
    const toScreen = multiplyMatrices(view, world);
    const geometry = evaluated(mask, time);
    return {
      layerId,
      index,
      mask,
      time,
      world,
      toScreen,
      masks: layer.masks as readonly ReadMask[],
      points: getMaskHandles({ ...mask, geometry }).map((handle) => ({
        ...handle,
        screen: transformPoint(toScreen, handle.position),
      })),
      outline: outline(mask, geometry).map((p) => transformPoint(toScreen, p)),
    };
  };
  const hitHandle = (view: AffineMatrix, point: Point2) => {
    const found = handles(view);
    if (!found) return null;
    const handle = found.points.find(
      (item) =>
        Math.hypot(item.screen[0] - point[0], item.screen[1] - point[1]) <=
        HANDLE_RADIUS,
    );
    return handle ? { found, handle } : null;
  };
  const inside = (view: AffineMatrix, point: Point2) => {
    const inverse = invertMatrix(view);
    if (!inverse) return false;
    const at = transformPoint(inverse, point);
    const { width, height } = session.source.composition;
    return at[0] >= 0 && at[1] >= 0 && at[0] <= width && at[1] <= height;
  };
  const sample = (point: Point2): string | null => {
    const context = canvas.getContext('2d');
    if (!context) return null;
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / Math.max(1, rect.width);
    const data = context.getImageData(
      Math.round(point[0] * ratio),
      Math.round(point[1] * ratio),
      1,
      1,
    ).data;
    return `#${[data[0]!, data[1]!, data[2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  const tool = {
    hit(view: AffineMatrix, point: Point2) {
      if (layerEffects.eyedropper) return inside(view, point);
      return !!hitHandle(view, point);
    },
    begin(view: AffineMatrix, point: Point2) {
      const armed = layerEffects.eyedropper;
      if (armed) {
        disarmEyedropper(session);
        const color = sample(point);
        const layer = storedLayer(engine, session, armed);
        if (color && layer) {
          try {
            engine.commands.transaction('Pick key colour', [
              chromaCommand(engine, session, armed, {
                ...(layer.chromaKey ?? {}),
                color,
              } as ChromaKey),
            ]);
          } catch (error) {
            report(error);
          }
        }
        return false;
      }
      const hit = hitHandle(view, point);
      if (!hit) return false;
      const inverse = invertMatrix(hit.found.toScreen);
      if (!inverse) return false;
      layerEffects.maskId = hit.found.mask.id;
      drag = {
        layerId: hit.found.layerId,
        maskIndex: hit.found.index,
        handle: hit.handle.id,
        inverse,
        masks: hit.found.masks.map((mask) => mask),
        time: hit.found.time,
        command: null,
      };
      return true;
    },
    update(_view: AffineMatrix, point: Point2) {
      if (!drag) return;
      const local = transformPoint(drag.inverse, point);
      const mask = drag.masks[drag.maskIndex]!;
      const moved = moveHandle(
        { ...mask, geometry: evaluated(mask, drag.time) },
        drag.handle,
        local.map((v) => Math.round(v * 100) / 100) as unknown as Point2,
      );
      const next = drag.masks.map((item, index) =>
        index === drag!.maskIndex
          ? withGeometry(mask, moved.geometry, drag!.time)
          : item,
      );
      drag.command = masksCommand(engine, session, drag.layerId, next);
      try {
        // Pointer moves only preview; the release commits once.
        session.setPreview(engine.preview([drag.command]));
      } catch (error) {
        report(error);
      }
    },
    end() {
      const done = drag;
      drag = null;
      session.setPreview(null);
      if (!done?.command) return;
      try {
        engine.commands.transaction('Edit mask', [done.command]);
      } catch (error) {
        report(error);
      }
    },
    cancel() {
      drag = null;
      session.setPreview(null);
    },
    cursor(view: AffineMatrix, point: Point2) {
      if (layerEffects.eyedropper)
        return inside(view, point) ? 'crosshair' : null;
      return hitHandle(view, point) ? 'pointer' : null;
    },
    /** Draws the open mask's outline and handles over the canvas. */
    draw(view: AffineMatrix) {
      let found: ReturnType<typeof handles> = null;
      try {
        found = handles(view);
      } catch {
        found = null;
      }
      if (!found) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = canvas.width / Math.max(1, rect.width);
      const styles = getComputedStyle(document.documentElement);
      const accent = styles.getPropertyValue('--accent').trim() || 'magenta';
      const light = styles.getPropertyValue('--text').trim() || 'white';
      context.save();
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      context.lineWidth = 1.5;
      context.strokeStyle = accent;
      context.setLineDash([5, 4]);
      context.beginPath();
      found.outline.forEach((p, i) =>
        i ? context.lineTo(p[0], p[1]) : context.moveTo(p[0], p[1]),
      );
      context.closePath();
      context.stroke();
      context.setLineDash([]);
      if (found.mask.type === 'path') {
        // Control arms from each control point to its vertex.
        context.lineWidth = 1;
        context.beginPath();
        found.points.forEach((p, i) => {
          if (p.kind !== 'control') return;
          const vertex = found!.points[i % 3 === 1 ? i - 1 : i + 1]!;
          context.moveTo(vertex.screen[0], vertex.screen[1]);
          context.lineTo(p.screen[0], p.screen[1]);
        });
        context.stroke();
      }
      for (const p of found.points) {
        context.beginPath();
        if (p.kind === 'control')
          context.rect(p.screen[0] - 4, p.screen[1] - 4, 8, 8);
        else context.arc(p.screen[0], p.screen[1], 5, 0, Math.PI * 2);
        context.fillStyle = light;
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = accent;
        context.stroke();
      }
      context.restore();
    },
  };
  return tool;
}

/** Arms the eyedropper: the canvas shows the picture without its key. */
function armEyedropper(
  engine: EditorEngine,
  session: EditorSession,
  layerId: string,
) {
  layerEffects.eyedropper = layerId;
  try {
    session.setPreview(
      engine.preview([chromaCommand(engine, session, layerId, null)]),
    );
  } catch {
    session.setPreview(null);
  }
  layerEffects.requestDraw();
}
function disarmEyedropper(session: EditorSession) {
  if (!layerEffects.eyedropper) return;
  layerEffects.eyedropper = null;
  session.setPreview(null);
  layerEffects.requestDraw();
}
/** Escape (or selecting something else) disarms the eyedropper. */
export function cancelEyedropper(session: EditorSession): boolean {
  if (!layerEffects.eyedropper) return false;
  disarmEyedropper(session);
  return true;
}

// --- Panel builders -------------------------------------------------------
const switchRow = (
  action: string,
  label: string,
  on: boolean,
  click: () => void,
) => {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'switch-row';
  item.dataset.action = action;
  item.setAttribute('role', 'switch');
  item.setAttribute('aria-checked', String(on));
  item.innerHTML = '<span></span>';
  item.querySelector('span')!.textContent = label;
  item.onclick = click;
  return item;
};
const smallButton = (
  action: string,
  icon: string,
  label: string,
  click: () => void,
  options: { pressed?: boolean; title?: string } = {},
) => {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'button sm right-button';
  item.dataset.action = action;
  item.innerHTML = `${iconSvg(icon, 16)}<span></span>`;
  item.querySelector('span')!.textContent = label;
  item.title = options.title ?? label;
  if (options.pressed !== undefined)
    item.setAttribute('aria-pressed', String(options.pressed));
  item.onclick = click;
  return item;
};
const rowOf = (...items: HTMLElement[]) => {
  const wrap = document.createElement('div');
  wrap.className = 'right-button-row';
  wrap.append(...items);
  return wrap;
};
const note = (text: string, className = 'right-note') => {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
};
let maskCounter = 0;
const newMaskId = (masks: readonly ReadMask[]) => {
  let id = '';
  do id = `mask-${Date.now().toString(36)}-${(maskCounter++).toString(36)}`;
  while (masks.some((mask) => mask.id === id));
  return id;
};

/** Masks: add, choose, combine, feather, expand, invert, keys and matte. */
export function masksAccordion(ctx: LayerEffectsContext): HTMLElement | null {
  const { engine, session, run, safely } = ctx;
  const id = session.selectedIds.length === 1 ? session.selectedId : null;
  const layer = id ? storedLayer(engine, session, id) : null;
  if (!id || !layer || layer.type === 'audio') return null;
  const masks = (layer.masks ?? []) as readonly ReadMask[];
  const active =
    masks.find((mask) => mask.id === layerEffects.maskId) ?? masks[0] ?? null;
  if (active) layerEffects.maskId = active.id;
  const commit = (label: string, next: readonly ReadMask[]) =>
    safely(() =>
      run(label, [masksCommand(engine, session, id, next, undefined)]),
    );
  const replace = (change: (mask: ReadMask) => ReadMask) =>
    masks.map((mask) => (mask.id === active?.id ? change(mask) : mask));
  const content: HTMLElement[] = [];
  const bounds = selectionBounds(session.source, id)?.bounds ?? {
    x: 0,
    y: 0,
    width: session.source.composition.width,
    height: session.source.composition.height,
  };
  const add = rowOf(
    ...MASK_TYPES.map((type) =>
      smallButton(
        `mask-add-${type}`,
        'plus',
        t(`mask.type.${type}`),
        () => {
          const mask = defaultMask(type, bounds, newMaskId(masks));
          layerEffects.maskId = mask.id;
          commit('Add mask', [...masks, mask]);
        },
        { title: t('mask.addTitle', { type: t(`mask.type.${type}`) }) },
      ),
    ),
  );
  content.push(note(t('mask.hint')), add);
  if (masks.length) {
    const list = document.createElement('div');
    list.className = 'mask-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', t('mask.list'));
    masks.forEach((mask, index) => {
      const item = document.createElement('div');
      item.className = 'mask-row';
      item.dataset.maskId = mask.id;
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'mask-pick';
      pick.setAttribute('role', 'option');
      pick.setAttribute('aria-selected', String(mask.id === active?.id));
      pick.textContent = t('mask.name', {
        n: String(index + 1),
        type: t(`mask.type.${mask.type}`),
      });
      pick.onclick = () => {
        layerEffects.maskId = mask.id;
        ctx.rerender();
        layerEffects.requestDraw();
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button sm';
      remove.dataset.action = 'mask-delete';
      remove.innerHTML = iconSvg('delete', 16);
      remove.setAttribute('aria-label', t('mask.delete'));
      remove.title = t('mask.delete');
      remove.onclick = () => {
        if (layerEffects.maskId === mask.id) layerEffects.maskId = null;
        commit(
          'Delete mask',
          masks.filter((item) => item.id !== mask.id),
        );
      };
      item.append(pick, remove);
      list.append(item);
    });
    content.push(list);
  }
  if (active) {
    content.push(
      createSelect({
        id: 'mask-mode',
        label: t('mask.mode'),
        value: active.mode ?? 'add',
        options: (['add', 'subtract', 'intersect'] as const).map((mode) => ({
          value: mode,
          label: t(`mask.mode.${mode}`),
        })),
        onChange: (value) =>
          commit(
            'Mask mode',
            replace((mask) => ({ ...mask, mode: value as Mask['mode'] })),
          ),
      }),
      createNumberField({
        id: 'mask-feather',
        label: t('mask.feather'),
        value: active.feather ?? 0,
        min: 0,
        max: 500,
        step: 1,
        decimals: 0,
        unit: 'px',
        slider: true,
        onCommit: (value) =>
          commit(
            'Mask feather',
            replace((mask) => ({ ...mask, feather: value })),
          ),
        onInvalid: (message) => ctx.report(new RangeError(message)),
      }),
      createNumberField({
        id: 'mask-expansion',
        label: t('mask.expansion'),
        value: active.expansion ?? 0,
        min: -500,
        max: 500,
        step: 1,
        decimals: 0,
        unit: 'px',
        slider: true,
        sliderRange: [-200, 200],
        onCommit: (value) =>
          commit(
            'Mask expansion',
            replace((mask) => ({ ...mask, expansion: value })),
          ),
        onInvalid: (message) => ctx.report(new RangeError(message)),
      }),
      createNumberField({
        id: 'mask-opacity',
        label: t('mask.opacity'),
        value: Math.round((active.opacity ?? 1) * 100),
        min: 0,
        max: 100,
        step: 1,
        decimals: 0,
        unit: '%',
        slider: true,
        onCommit: (value) =>
          commit(
            'Mask opacity',
            replace((mask) => ({ ...mask, opacity: value / 100 })),
          ),
        onInvalid: (message) => ctx.report(new RangeError(message)),
      }),
      switchRow('mask-invert', t('mask.invert'), !!active.invert, () =>
        commit(
          'Invert mask',
          replace((mask) => ({ ...mask, invert: !mask.invert })),
        ),
      ),
    );
    // Keyframes: the shape at the playhead, local to the layer's start.
    const time = localTime(session, id);
    const keys = active.keyframes ?? [];
    const keyed = keys.some((key) => Math.abs(key.time - time) < KEY_EPSILON);
    const keyRow = rowOf(
      smallButton(
        'mask-key',
        keyed ? 'diamondFilled' : 'diamondOutline',
        keyed ? t('mask.keyRemove') : t('mask.keyAdd'),
        () => {
          if (keyed) {
            const left = keys.filter(
              (key) => Math.abs(key.time - time) >= KEY_EPSILON,
            );
            commit(
              'Remove mask keyframe',
              replace((mask) => {
                const next = { ...mask, geometry: evaluated(mask, time) };
                if (left.length) return { ...next, keyframes: left };
                delete (next as { keyframes?: unknown }).keyframes;
                return next;
              }),
            );
          } else
            commit(
              'Add mask keyframe',
              replace((mask) => {
                const geometry = evaluated(mask, time);
                const next = [
                  ...(mask.keyframes ?? []),
                  { time, value: geometry },
                ]
                  .map((key) => ({ ...key }))
                  .sort((a, b) => a.time - b.time);
                return { ...mask, keyframes: next };
              }),
            );
        },
        { pressed: keyed },
      ),
    );
    const keyNote = note(
      keys.length
        ? t('mask.keyCount', { n: String(keys.length) })
        : t('mask.keyNone'),
      'right-note mask-key-note',
    );
    content.push(keyRow, keyNote);
  }
  // Matte from another layer of this scene.
  const others = session.source.composition.layers.filter(
    (item) => item.id !== id && item.type !== 'audio',
  );
  const matte = layer.matte ?? null;
  content.push(
    createSelect({
      id: 'mask-matte-source',
      label: t('mask.matte'),
      value: matte?.layerId ?? '',
      options: [
        { value: '', label: t('mask.matteNone') },
        ...others.map((item) => ({ value: item.id, label: item.name })),
      ],
      onChange: (value) =>
        safely(() =>
          run('Track matte', [
            masksCommand(
              engine,
              session,
              id,
              masks,
              value
                ? {
                    layerId: value,
                    type: matte?.type ?? 'alpha',
                    ...(matte?.invert ? { invert: true } : {}),
                  }
                : null,
            ),
          ]),
        ),
    }),
  );
  if (matte)
    content.push(
      createSelect({
        id: 'mask-matte-type',
        label: t('mask.matteType'),
        value: matte.type,
        options: (['alpha', 'luma'] as const).map((type) => ({
          value: type,
          label: t(`mask.matte.${type}`),
        })),
        onChange: (value) =>
          safely(() =>
            run('Track matte', [
              masksCommand(engine, session, id, masks, {
                ...matte,
                type: value as Matte['type'],
              }),
            ]),
          ),
      }),
      switchRow(
        'mask-matte-invert',
        t('mask.matteInvert'),
        !!matte.invert,
        () =>
          safely(() =>
            run('Track matte', [
              masksCommand(engine, session, id, masks, {
                ...matte,
                invert: !matte.invert,
              }),
            ]),
          ),
      ),
    );
  const section = ctx.accordion('layer-masks', t('mask.title'), content);
  section.dataset.layer = id;
  section
    .querySelector('.right-accordion-head')
    ?.addEventListener('click', () => layerEffects.requestDraw());
  return section;
}

/** One blend control: the layer's blend mode, grouped by category. */
export function blendControl(
  ctx: LayerEffectsContext,
  options: {
    /** A legacy clip-FX blend mode (V4), shown until a layer mode is set. */
    readonly legacy?: string | undefined;
    /** Commands that clear the legacy clip-FX blend in the same step. */
    readonly clearLegacy: () => Command[];
  },
): HTMLElement {
  const { engine, session } = ctx;
  const id = session.selectedIds.length === 1 ? session.selectedId : null;
  const layer = id ? storedLayer(engine, session, id) : null;
  const legacy = options.legacy?.startsWith('blend.')
    ? options.legacy.slice('blend.'.length)
    : undefined;
  const value = layer?.blendMode ?? legacy ?? 'normal';
  const known = BLEND_OPTIONS.some((option) => option.id === value);
  const wrap = document.createElement('div');
  wrap.className = 'blend-control';
  wrap.append(
    createSelect({
      id: 'right-blend-mode',
      label: t('right.adjust.blend'),
      value: known ? value : 'normal',
      options: BLEND_OPTIONS.map((option) => ({
        value: option.id,
        label: t(`blend.mode.${option.id}`),
        group: t(`blend.group.${option.category}`),
      })),
      disabled: !layer || layer.type === 'audio',
      onChange: (next) =>
        ctx.safely(() =>
          ctx.run('Blend mode', [
            blendCommand(engine, session, id!, next),
            ...options.clearLegacy(),
          ]),
        ),
    }),
  );
  if (layer?.blendMode !== undefined && !known)
    wrap.append(
      note(
        t('blend.unsupported', { mode: layer.blendMode }),
        'right-note right-warning',
      ),
    );
  return wrap;
}

let gpuProbe: boolean | undefined;
/** Whether WebGL can key colours here (probed once). A dev/test hook can
 *  turn it off to show the slower CPU path's notice. */
export function chromaGpuAvailable(): boolean {
  if (
    (window as unknown as { __AIVE_E2E_CHROMA_GPU__?: string })
      .__AIVE_E2E_CHROMA_GPU__ === 'off'
  )
    return false;
  if (gpuProbe === undefined) {
    try {
      const gpu = createWebGlChroma();
      gpuProbe = !!gpu;
      gpu?.dispose();
    } catch {
      gpuProbe = false;
    }
  }
  return gpuProbe;
}

/** Chroma key for pictures and video: colour, eyedropper and edges. */
export function chromaAccordion(ctx: LayerEffectsContext): HTMLElement | null {
  const { engine, session, run, safely } = ctx;
  const id = session.selectedIds.length === 1 ? session.selectedId : null;
  const layer = id ? storedLayer(engine, session, id) : null;
  if (!id || !layer || (layer.type !== 'image' && layer.type !== 'video'))
    return null;
  const key = layer.chromaKey ?? null;
  const set = (label: string, next: ChromaKey | null) =>
    safely(() => run(label, [chromaCommand(engine, session, id, next)]));
  const content: HTMLElement[] = [
    switchRow('chroma-enable', t('chroma.enable'), !!key, () =>
      set(
        key ? 'Remove chroma key' : 'Chroma key',
        key ? null : { color: '#00ff00' },
      ),
    ),
  ];
  if (!chromaGpuAvailable())
    content.push(note(t('chroma.cpuNotice'), 'right-note right-warning'));
  if (key) {
    const s = chromaSettings(key);
    const eyedropper = smallButton(
      'chroma-eyedropper',
      'eyedropper',
      layerEffects.eyedropper === id
        ? t('chroma.pickActive')
        : t('chroma.pick'),
      () => {
        if (layerEffects.eyedropper === id) disarmEyedropper(session);
        else armEyedropper(engine, session, id);
        ctx.rerender();
      },
      { pressed: layerEffects.eyedropper === id },
    );
    const percent = (
      field: 'similarity' | 'smoothness' | 'spill',
      label: string,
    ) =>
      createNumberField({
        id: `chroma-${field}`,
        label,
        value: Math.round(s[field] * 100),
        min: 0,
        max: 100,
        step: 1,
        decimals: 0,
        unit: '%',
        slider: true,
        onCommit: (value) =>
          set('Chroma key', { ...key, [field]: value / 100 } as ChromaKey),
        onInvalid: (message) => ctx.report(new RangeError(message)),
      });
    const pixels = (field: 'feather' | 'shrink', label: string) =>
      createNumberField({
        id: `chroma-${field}`,
        label,
        value: s[field],
        min: 0,
        max: 8,
        step: 1,
        decimals: 0,
        unit: 'px',
        slider: true,
        onCommit: (value) =>
          set('Chroma key', {
            ...key,
            [field]: Math.round(value),
          } as ChromaKey),
        onInvalid: (message) => ctx.report(new RangeError(message)),
      });
    const quality = document.createElement('div');
    quality.className = 'segmented chroma-quality';
    quality.setAttribute('role', 'radiogroup');
    quality.setAttribute('aria-label', t('chroma.quality'));
    for (const mode of ['full', 'fast'] as const) {
      const option = document.createElement('button');
      option.type = 'button';
      option.dataset.quality = mode;
      option.setAttribute('role', 'radio');
      option.setAttribute(
        'aria-checked',
        String(layerEffects.quality === mode),
      );
      option.textContent = t(`chroma.quality.${mode}`);
      option.onclick = () => {
        layerEffects.quality = mode;
        ctx.rerender();
        layerEffects.requestDraw();
      };
      quality.append(option);
    }
    content.push(
      createColorField({
        id: 'chroma-color',
        label: t('chroma.color'),
        value: s.color,
        onCommit: (color) => set('Chroma key', { ...key, color }),
      }),
      rowOf(eyedropper),
      ...(layerEffects.eyedropper === id ? [note(t('chroma.pickHint'))] : []),
      percent('similarity', t('chroma.similarity')),
      percent('smoothness', t('chroma.smoothness')),
      percent('spill', t('chroma.spill')),
      pixels('feather', t('chroma.feather')),
      pixels('shrink', t('chroma.shrink')),
      switchRow('chroma-invert', t('chroma.invert'), s.invert, () =>
        set('Chroma key', { ...key, invert: !s.invert }),
      ),
      note(t('chroma.quality')),
      quality,
      note(t('chroma.qualityHint')),
    );
  }
  const section = ctx.accordion('layer-chroma', t('chroma.title'), content);
  section.dataset.layer = id;
  return section;
}
