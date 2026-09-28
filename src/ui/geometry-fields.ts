// G2.1: the X, Y, W and H fields and the lock-ratio toggle, built once and
// used by the Inspector, the context toolbar and the Position panel. The
// values come from geometry.ts, so all three always show the same numbers,
// and syncGeometryFields keeps them live while a handle is being dragged.
import { t } from '../i18n';
import type { RenderSource } from '../render/adapter';
import { locateLayer } from '../render/adapter';
import { createNumberField, syncNumberField } from './components/number-field';
import {
  heightEditable,
  isRatioLocked,
  ratioForced,
  selectionGeometry,
  setRatioLocked,
  type GeometryField,
} from './geometry';
import { iconSvg } from './icons';

const PREFIXES = ['inspector', 'toolbar', 'position'] as const;
export type GeometryPrefix = (typeof PREFIXES)[number];

export interface GeometryControls {
  readonly x: HTMLElement;
  readonly y: HTMLElement;
  readonly w: HTMLElement;
  readonly h: HTMLElement;
  readonly lock: HTMLButtonElement;
}

const FIELDS: readonly (readonly [GeometryField, keyof GeometryControls])[] = [
  ['X', 'x'],
  ['Y', 'y'],
  ['W', 'w'],
  ['H', 'h'],
];
const LABELS: Record<GeometryField, string> = {
  X: 'geometry.x',
  Y: 'geometry.y',
  W: 'geometry.width',
  H: 'geometry.height',
};

/** The controls for the current selection, or null when nothing is selected. */
export function createGeometryControls(
  prefix: GeometryPrefix,
  source: RenderSource,
  onEdit: (field: GeometryField, value: number) => void,
  /** Called after the lock is toggled, so the owner can re-render. */
  onLockChange?: () => void,
  compact = false,
): GeometryControls | null {
  const geometry = selectionGeometry(source);
  const ids = source.selectedIds ?? [];
  if (!geometry || !ids.length) return null;
  const multi = ids.length > 1;
  const layer = multi
    ? null
    : (locateLayer(source.composition.layers, ids[0]!)?.layer ?? null);
  const forced = !!layer && ratioForced(layer);
  const values: Record<GeometryField, number> = {
    X: geometry.x,
    Y: geometry.y,
    W: geometry.width,
    H: geometry.height,
  };
  const controls: Partial<Record<keyof GeometryControls, HTMLElement>> = {};
  for (const [field, key] of FIELDS) {
    const size = field === 'W' || field === 'H';
    controls[key] = createNumberField({
      id: `${prefix}-${key}`,
      label: t(LABELS[field]),
      value: values[field],
      unit: 'px',
      decimals: 1,
      compact,
      data: { control: key, geometry: field },
      ...(size ? { min: 1 } : {}),
      // A multi-selection resizes from its box handles; a text box's height
      // follows its text.
      disabled:
        (size && multi) || (field === 'H' && !!layer && !heightEditable(layer)),
      onCommit: (value) => onEdit(field, value),
      onInvalid: (_message, kind) => {
        if (kind === 'invalid') onEdit(field, Number.NaN);
      },
    });
  }
  const lock = document.createElement('button');
  lock.type = 'button';
  lock.id = `${prefix}-lock-ratio`;
  lock.className = 'toolbar-button geometry-lock';
  lock.dataset.control = 'lock';
  const pressed = forced || isRatioLocked();
  lock.setAttribute('aria-pressed', String(pressed));
  lock.setAttribute('aria-label', t('geometry.lock'));
  lock.title = forced ? t('geometry.lockForced') : t('geometry.lock');
  lock.innerHTML = iconSvg(pressed ? 'lock' : 'unlock', 16);
  lock.disabled = forced || multi || layer?.type === 'text';
  lock.onclick = () => {
    setRatioLocked(!isRatioLocked());
    onLockChange?.();
  };
  return { ...(controls as Omit<GeometryControls, 'lock'>), lock };
}

/** The four fields and the lock in one row, for panels. */
export function createGeometryRow(
  prefix: GeometryPrefix,
  source: RenderSource,
  onEdit: (field: GeometryField, value: number) => void,
  onLockChange?: () => void,
): HTMLElement | null {
  const controls = createGeometryControls(prefix, source, onEdit, onLockChange);
  if (!controls) return null;
  const row = document.createElement('div');
  row.className = 'geometry-fields';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', t('geometry.title'));
  row.append(controls.x, controls.y, controls.w, controls.lock, controls.h);
  return row;
}

/** Shows the live geometry (during a drag) in every geometry field on screen. */
export function syncGeometryFields(
  root: ParentNode,
  source: RenderSource,
): void {
  const geometry = selectionGeometry(source);
  if (!geometry) return;
  for (const prefix of PREFIXES) {
    syncNumberField(root, `${prefix}-x`, geometry.x);
    syncNumberField(root, `${prefix}-y`, geometry.y);
    syncNumberField(root, `${prefix}-w`, geometry.width);
    syncNumberField(root, `${prefix}-h`, geometry.height);
  }
}
