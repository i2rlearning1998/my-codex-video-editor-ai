// G1: the one numeric input (INS-006, LAY-023). Drag left or right on the
// label or on the unfocused field to scrub (Shift fine, Alt coarse); click to
// type; Enter commits, Escape reverts; arrow keys step (Shift ×10); the unit is
// shown; values clamp to min and max; the chevron opens a slider and presets.
// Scrubbing previews only; it commits once, on release.
import { formatNumber, t } from '../../i18n';
import { iconSvg } from '../icons';
import { closePopover, openAnchor, openPopover } from './popover';

export interface NumberFieldOptions {
  /** The input's id (and the chevron's `${id}-more`). */
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly unit?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Decimal places shown (default 2). */
  readonly decimals?: number;
  /** Chevron popover: a slider over [min, max] and preset values. */
  readonly slider?: boolean;
  readonly presets?: readonly number[];
  /** Hides the visible label (the input keeps it as its accessible name). */
  readonly compact?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly data?: Readonly<Record<string, string>>;
  /** Called with the clamped value when a scrub or edit is committed. */
  readonly onCommit: (value: number) => void;
  /** Called while scrubbing or sliding, before the commit. */
  readonly onPreview?: (value: number) => void;
  /**
   * Reports an entry that was not a number (reverted) or was outside min and
   * max (clamped and committed).
   */
  readonly onInvalid?: (message: string, kind: 'invalid' | 'clamped') => void;
}

/** A field committed by an arrow key re-renders its owner; refocus it after. */
let refocusId: string | null = null;
export function restoreFieldFocus(root: ParentNode): void {
  if (!refocusId) return;
  const input = root.querySelector<HTMLInputElement>(
    `#${CSS.escape(refocusId)}`,
  );
  if (input && !input.disabled && document.activeElement !== input) {
    input.focus();
    input.select();
  }
}

/** G2: shows a new value in a field unless the user is editing it. */
export function syncNumberField(
  root: ParentNode,
  id: string,
  value: number,
): void {
  root
    .querySelector(`[id="${id}"]`)
    ?.dispatchEvent(new CustomEvent('number-field-sync', { detail: value }));
}

const SCRUB_THRESHOLD = 3;
/** Composition units (or unit steps) per CSS pixel of drag. */
const SCRUB_RATE = 0.5;

export function createNumberField(options: NumberFieldOptions): HTMLElement {
  const decimals = options.decimals ?? 2;
  const step = options.step ?? 1;
  const clamp = (value: number) =>
    Math.min(
      options.max ?? Number.POSITIVE_INFINITY,
      Math.max(options.min ?? Number.NEGATIVE_INFINITY, value),
    );
  const round = (value: number) => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  };
  const show = (value: number) => {
    const rounded = round(value);
    return String(rounded === 0 ? 0 : rounded);
  };
  const wrap = document.createElement('div');
  wrap.className = `number-field ${options.className ?? ''}`.trim();
  if (options.compact) wrap.classList.add('compact');
  wrap.title = options.label;
  const label = document.createElement('label');
  label.className = 'number-field-label';
  label.htmlFor = options.id;
  label.textContent = options.label;
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.id = options.id;
  input.className = 'number-field-input';
  input.setAttribute('aria-label', options.label);
  input.setAttribute('role', 'spinbutton');
  if (options.min !== undefined)
    input.setAttribute('aria-valuemin', String(options.min));
  if (options.max !== undefined)
    input.setAttribute('aria-valuemax', String(options.max));
  for (const [key, value] of Object.entries(options.data ?? {}))
    input.dataset[key] = value;
  input.disabled = !!options.disabled;
  let committed = options.value;
  const setShown = (value: number) => {
    input.value = show(value);
    input.setAttribute('aria-valuenow', show(value));
  };
  setShown(committed);
  // G2: the owner shows a live value (a drag on the canvas) without a rebuild.
  input.addEventListener('number-field-sync', (event) => {
    const value = (event as CustomEvent<number>).detail;
    if (
      document.activeElement === input ||
      wrap.classList.contains('scrubbing')
    )
      return;
    committed = value;
    setShown(value);
  });
  wrap.append(label, input);
  if (options.unit) {
    const unit = document.createElement('span');
    unit.className = 'number-field-unit';
    unit.textContent = options.unit;
    unit.setAttribute('aria-hidden', 'true');
    wrap.append(unit);
  }
  const commit = (value: number) => {
    const next = clamp(value);
    setShown(next);
    if (round(next) === round(committed)) return;
    committed = next;
    options.onCommit(next);
  };
  const commitTyped = () => {
    const text = input.value.trim().replace(',', '.');
    const value = Number(text);
    if (text === '' || !Number.isFinite(value)) {
      setShown(committed);
      if (text !== show(committed))
        options.onInvalid?.(t('toolbar.number'), 'invalid');
      return;
    }
    // An out-of-range entry is reported and clamped, like Canva.
    if (clamp(value) !== value)
      options.onInvalid?.(t('field.clamped'), 'clamped');
    commit(value);
  };
  input.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTyped();
      input.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setShown(committed);
      input.blur();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? 1 : -1;
      const base = Number(input.value);
      const from = Number.isFinite(base) ? base : committed;
      // The owner may re-render more than once for this commit; keep the
      // field focused through all of them, then forget it.
      refocusId = input.id;
      window.setTimeout(() => {
        if (refocusId === input.id) refocusId = null;
      });
      commit(from + direction * step * (event.shiftKey ? 10 : 1));
    }
  };
  input.onblur = () => {
    if (input.value !== show(committed)) commitTyped();
  };
  // Browsers fire change on blur after an edit; a scripted change commits too.
  input.onchange = () => {
    if (input.value !== show(committed)) commitTyped();
  };
  // Scrub on the label, or on the field before it has focus.
  const scrub = (event: PointerEvent, fromInput: boolean) => {
    if (input.disabled || event.button !== 0) return;
    if (fromInput && document.activeElement === input) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const start = Number.isFinite(Number(input.value))
      ? Number(input.value)
      : committed;
    let moving = false,
      value = start;
    const move = (next: PointerEvent) => {
      const dx = next.clientX - startX;
      if (!moving && Math.abs(dx) < SCRUB_THRESHOLD) return;
      moving = true;
      wrap.classList.add('scrubbing');
      const rate = next.shiftKey ? 0.1 : next.altKey ? 10 : 1;
      value = clamp(start + Math.round(dx * SCRUB_RATE) * step * rate);
      setShown(value);
      options.onPreview?.(value);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', cancel);
      wrap.classList.remove('scrubbing');
      if (moving) commit(value);
      else {
        input.focus();
        input.select();
      }
    };
    const cancel = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', cancel);
      wrap.classList.remove('scrubbing');
      setShown(committed);
      options.onPreview?.(committed);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cancel);
  };
  label.onpointerdown = (event) => scrub(event, false);
  input.onpointerdown = (event) => scrub(event, true);
  if (options.slider || options.presets?.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'number-field-more';
    more.id = `${options.id}-more`;
    more.innerHTML = iconSvg('chevronDown', 12);
    more.setAttribute('aria-label', t('field.more', { label: options.label }));
    more.setAttribute('aria-haspopup', 'dialog');
    more.disabled = input.disabled;
    more.onclick = () => {
      if (openAnchor() === more) return closePopover();
      const body = document.createElement('div');
      body.className = 'number-field-popover';
      if (
        options.slider &&
        options.min !== undefined &&
        options.max !== undefined
      )
        body.append(
          createSlider({
            id: `${options.id}-slider`,
            label: options.label,
            value: committed,
            min: options.min,
            max: options.max,
            step,
            decimals,
            ...(options.unit ? { unit: options.unit } : {}),
            onPreview: (value) => {
              setShown(value);
              options.onPreview?.(value);
            },
            onCommit: (value) => commit(value),
          }),
        );
      if (options.presets?.length) {
        const list = document.createElement('div');
        list.className = 'number-field-presets';
        for (const preset of options.presets) {
          const item = document.createElement('button');
          item.type = 'button';
          item.dataset.preset = String(preset);
          item.textContent = `${formatNumber(preset)}${options.unit ?? ''}`;
          item.onclick = () => {
            closePopover();
            commit(preset);
          };
          list.append(item);
        }
        body.append(list);
      }
      openPopover(more, body, { label: options.label });
    };
    wrap.append(more);
  }
  return wrap;
}

export interface SliderOptions {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string;
  readonly decimals?: number;
  readonly disabled?: boolean;
  readonly onCommit: (value: number) => void;
  readonly onPreview?: (value: number) => void;
}

/** A range slider with a numeric readout; commits once, on release. */
export function createSlider(options: SliderOptions): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'slider-field';
  const range = document.createElement('input');
  range.type = 'range';
  range.id = options.id;
  range.min = String(options.min);
  range.max = String(options.max);
  range.step = String(options.step ?? 1);
  range.value = String(options.value);
  range.disabled = !!options.disabled;
  range.setAttribute('aria-label', options.label);
  const readout = document.createElement('output');
  readout.className = 'slider-readout';
  readout.htmlFor.add(options.id);
  const factor = 10 ** (options.decimals ?? 0);
  const show = (value: number) =>
    `${formatNumber(Math.round(value * factor) / factor)}${options.unit ?? ''}`;
  readout.textContent = show(options.value);
  const fill = () =>
    wrap.style.setProperty(
      '--slider-fill',
      `${((Number(range.value) - options.min) / (options.max - options.min || 1)) * 100}%`,
    );
  fill();
  range.oninput = () => {
    readout.textContent = show(Number(range.value));
    fill();
    options.onPreview?.(Number(range.value));
  };
  range.onchange = () => options.onCommit(Number(range.value));
  wrap.append(range, readout);
  return wrap;
}
