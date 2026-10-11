// G1, J3: the one numeric input (INS-006, LAY-023). Drag left or right on the
// label or on the unfocused field to scrub (Shift fine, Alt coarse); click to
// type; Enter or leaving commits, Escape reverts. The up and down arrow
// buttons, the arrow keys and the mouse wheel (while focused) step once
// (Shift ×10, Alt ×0.1). A bounded field shows a slider beside it; the
// chevron opens presets. The unit and the range are shown. Scrubbing and
// sliding preview live on the canvas and commit once, on release (one undo
// step).
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
  /**
   * Called while scrubbing or sliding, before the commit. Without it, the
   * shell's live preview (J3) shows the edit that `onCommit` would make.
   */
  readonly onPreview?: (value: number) => void;
  /** J3: the slider's range when the field itself is unbounded (rotation). */
  readonly sliderRange?: readonly [number, number];
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

/**
 * J3: the shell's live preview of a field's edit while it is dragged:
 * `preview` runs the field's commit in capture mode and draws the result;
 * `end` clears it. Unset outside the editor (unit tests).
 */
let livePreview: {
  preview: (commit: () => void) => void;
  end: () => void;
} | null = null;
export function setFieldPreview(handler: typeof livePreview): void {
  livePreview = handler;
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
  const range =
    options.sliderRange ??
    (options.min !== undefined && options.max !== undefined
      ? ([options.min, options.max] as const)
      : null);
  // J3: the range is shown with the label (and in the tooltip).
  wrap.title =
    options.min !== undefined && options.max !== undefined
      ? t('field.range', {
          label: options.label,
          min: formatNumber(options.min),
          max: formatNumber(options.max),
          unit: options.unit ?? '',
        })
      : options.label;
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
  let committing = false;
  input.addEventListener('number-field-sync', (event) => {
    const value = (event as CustomEvent<number>).detail;
    // (While its own commit runs, the owner may correct the value, e.g. a
    // clamp with a message; V7.)
    if (
      !committing &&
      (document.activeElement === input || wrap.classList.contains('scrubbing'))
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
    endPreview();
    if (round(next) === round(committed)) return;
    committed = next;
    committing = true;
    try {
      options.onCommit(next);
    } finally {
      committing = false;
    }
  };
  // J3: a live preview of the value being dragged (no history).
  let previewing = false;
  const preview = (value: number) => {
    if (options.onPreview) return options.onPreview(value);
    if (!livePreview) return;
    previewing = true;
    livePreview.preview(() => options.onCommit(value));
  };
  const endPreview = () => {
    if (!previewing) return;
    previewing = false;
    livePreview?.end();
  };
  /** One step of the arrows, the keys or the wheel (Shift ×10, Alt ×0.1). */
  const stepBy = (
    direction: 1 | -1,
    modifiers: { shiftKey: boolean; altKey: boolean },
  ) => {
    const base = Number(input.value.trim().replace(',', '.'));
    const from = Number.isFinite(base) ? base : committed;
    const factor = modifiers.shiftKey ? 10 : modifiers.altKey ? 0.1 : 1;
    // The owner may re-render more than once for this commit; keep the
    // field focused through all of them, then forget it.
    if (document.activeElement === input) {
      refocusId = input.id;
      window.setTimeout(() => {
        if (refocusId === input.id) refocusId = null;
      });
    }
    commit(from + direction * step * factor);
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
      stepBy(event.key === 'ArrowUp' ? 1 : -1, event);
    }
  };
  // The wheel steps while the field has focus (so panels still scroll).
  input.addEventListener(
    'wheel',
    (event) => {
      if (document.activeElement !== input || input.disabled || !event.deltaY)
        return;
      event.preventDefault();
      stepBy(event.deltaY < 0 ? 1 : -1, event);
    },
    { passive: false },
  );
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
      preview(value);
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
      if (options.onPreview) options.onPreview(committed);
      endPreview();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cancel);
  };
  label.onpointerdown = (event) => scrub(event, false);
  input.onpointerdown = (event) => scrub(event, true);
  // J3: up and down arrows, one step per click (Shift ×10, Alt ×0.1).
  const steps = document.createElement('span');
  steps.className = 'number-field-steps';
  for (const direction of [1, -1] as const) {
    const arrow = document.createElement('button');
    arrow.type = 'button';
    arrow.tabIndex = -1;
    arrow.id = `${options.id}-${direction > 0 ? 'up' : 'down'}`;
    arrow.className = 'number-field-step';
    arrow.dataset.step = direction > 0 ? 'up' : 'down';
    arrow.innerHTML = iconSvg(direction > 0 ? 'chevronUp' : 'chevronDown', 10);
    arrow.setAttribute(
      'aria-label',
      t(direction > 0 ? 'field.increase' : 'field.decrease', {
        label: options.label,
      }),
    );
    arrow.disabled = input.disabled;
    // Keep focus where it is (the field or the canvas).
    arrow.onpointerdown = (event) => event.preventDefault();
    arrow.onclick = (event) => stepBy(direction, event);
    steps.append(arrow);
  }
  wrap.append(steps);
  // J3: a bounded field shows its slider beside it.
  if (options.slider && range) {
    wrap.classList.add('has-slider');
    wrap.append(
      createSlider({
        id: `${options.id}-slider`,
        label: t('field.slider', { label: options.label }),
        value: committed,
        min: range[0],
        max: range[1],
        step,
        decimals,
        disabled: input.disabled,
        readout: false,
        ...(options.unit ? { unit: options.unit } : {}),
        onPreview: (value) => {
          setShown(value);
          preview(value);
        },
        onCommit: (value) => commit(value),
      }),
    );
  }
  if (options.presets?.length) {
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
  /** Shows the value beside the slider (default true). */
  readonly readout?: boolean;
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
  wrap.append(range);
  if (options.readout !== false) wrap.append(readout);
  return wrap;
}
