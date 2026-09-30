// G1: the one colour picker (LAY-022). A swatch button opens a popover with a
// saturation/value square, a hue slider, a hex field, the eyedropper where the
// browser has one, recent colours, the colours already in the design, default
// swatches and, where allowed, No fill. Dragging previews; each release,
// swatch or hex entry commits once.
import { t } from '../../i18n';
import { iconSvg } from '../icons';
import { DEFAULT_SWATCHES } from '../palette';
import { closePopover, openAnchor, openPopover } from './popover';

export interface ColorFieldOptions {
  readonly id: string;
  readonly label: string;
  /** `#rrggbb`, or null for no fill. */
  readonly value: string | null;
  readonly compact?: boolean;
  readonly disabled?: boolean;
  readonly allowNone?: boolean;
  readonly data?: Readonly<Record<string, string>>;
  /** Colours used in the design, for the "In this design" row. */
  readonly documentColors?: () => readonly string[];
  readonly onCommit: (value: string) => void;
  readonly onNone?: () => void;
  readonly onPreview?: (value: string) => void;
  /**
   * Hosts the picker somewhere other than a popover (the left side panel for
   * toolbar colours, G1.5). It receives a builder to call on open and refresh.
   */
  readonly host?: (build: () => HTMLElement) => void;
}

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;
const recent: string[] = [];
const remember = (hex: string) => {
  const at = recent.indexOf(hex);
  if (at >= 0) recent.splice(at, 1);
  recent.unshift(hex);
  recent.length = Math.min(recent.length, 8);
};

export function normalizeHex(text: string): string | null {
  const match = HEX.exec(text.trim());
  if (!match) return null;
  const digits =
    match[1]!.length === 3
      ? [...match[1]!].map((digit) => digit + digit).join('')
      : match[1]!;
  return `#${digits.toLowerCase()}`;
}

type Hsv = { h: number; s: number; v: number };
export function hexToHsv(hex: string): Hsv {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function createColorField(options: ColorFieldOptions): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'color-field';
  if (options.compact) wrap.classList.add('compact');
  wrap.title = options.label;
  const label = document.createElement('span');
  label.className = 'color-field-label';
  label.textContent = options.label;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = options.id;
  trigger.className = 'color-swatch-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', options.label);
  trigger.disabled = !!options.disabled;
  for (const [key, value] of Object.entries(options.data ?? {}))
    trigger.dataset[key] = value;
  let value = options.value;
  const paint = (color: string | null) => {
    trigger.dataset.value = color ?? 'none';
    trigger.style.setProperty('--swatch', color ?? 'transparent');
    trigger.classList.toggle('none', color === null);
  };
  paint(value);
  const commit = (color: string) => {
    paint(color);
    remember(color);
    if (color === value) return;
    value = color;
    options.onCommit(color);
  };
  trigger.onclick = () => {
    if (options.host) {
      options.host(() =>
        createColorPicker({ ...options, value }, (color) => {
          paint(color);
          commit(color);
        }),
      );
      document.querySelector<HTMLInputElement>('#color-picker-hex')?.focus();
      return;
    }
    if (openAnchor() === trigger) return closePopover();
    openPopover(
      trigger,
      createColorPicker({ ...options, value }, commit, paint),
      {
        label: options.label,
        className: 'color-popover',
        onClose: () => paint(value),
      },
    );
    document.querySelector<HTMLInputElement>('#color-picker-hex')?.focus();
  };
  wrap.append(label, trigger);
  return wrap;
}

/**
 * The picker body: square, hue, hex, eyedropper, No fill and swatch rows.
 * `commit` runs once per release, swatch or hex entry; `paint` on every change.
 */
export function createColorPicker(
  options: ColorFieldOptions,
  commit: (color: string) => void,
  paint: (color: string | null) => void = () => {},
): HTMLElement {
  const value = options.value;
  {
    let hsv = hexToHsv(value ?? '#000000');
    const body = document.createElement('div');
    body.className = 'color-picker';
    const square = document.createElement('div');
    square.className = 'color-square';
    square.setAttribute('role', 'slider');
    square.setAttribute('aria-label', t('color.saturation'));
    square.tabIndex = 0;
    const knob = document.createElement('span');
    knob.className = 'color-knob';
    square.append(knob);
    const hue = document.createElement('input');
    hue.type = 'range';
    hue.className = 'color-hue';
    hue.id = 'color-picker-hue';
    hue.min = '0';
    hue.max = '359';
    hue.setAttribute('aria-label', t('color.hue'));
    const hexRow = document.createElement('div');
    hexRow.className = 'color-hex-row';
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.id = 'color-picker-hex';
    hex.className = 'color-hex';
    hex.spellcheck = false;
    hex.setAttribute('aria-label', t('color.hex'));
    hexRow.append(hex);
    if ('EyeDropper' in window) {
      const dropper = document.createElement('button');
      dropper.type = 'button';
      dropper.className = 'icon-button';
      dropper.dataset.action = 'eyedropper';
      dropper.innerHTML = iconSvg('eyedropper', 14);
      dropper.setAttribute('aria-label', t('color.eyedropper'));
      dropper.title = t('color.eyedropper');
      dropper.onclick = async () => {
        try {
          const result = await new (
            window as unknown as {
              EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> };
            }
          ).EyeDropper().open();
          const picked = normalizeHex(result.sRGBHex);
          if (picked) {
            hsv = hexToHsv(picked);
            sync();
            commit(picked);
          }
        } catch {
          // Cancelled by the user.
        }
      };
      hexRow.append(dropper);
    }
    const sync = () => {
      const color = hsvToHex(hsv);
      square.style.setProperty('--hue', `hsl(${hsv.h} 100% 50%)`);
      knob.style.left = `${hsv.s * 100}%`;
      knob.style.top = `${(1 - hsv.v) * 100}%`;
      hue.value = String(Math.round(hsv.h));
      if (document.activeElement !== hex) hex.value = color;
      paint(color);
      return color;
    };
    const fromPointer = (event: PointerEvent) => {
      const box = square.getBoundingClientRect();
      hsv = {
        h: hsv.h,
        s: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
        v: 1 - Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
      };
      options.onPreview?.(sync());
    };
    square.onpointerdown = (event) => {
      event.preventDefault();
      square.setPointerCapture(event.pointerId);
      fromPointer(event);
      square.onpointermove = fromPointer;
      square.onpointerup = () => {
        square.onpointermove = null;
        square.onpointerup = null;
        commit(sync());
      };
    };
    square.onkeydown = (event) => {
      const d = event.shiftKey ? 0.1 : 0.02;
      if (event.key === 'ArrowLeft') hsv.s = Math.max(0, hsv.s - d);
      else if (event.key === 'ArrowRight') hsv.s = Math.min(1, hsv.s + d);
      else if (event.key === 'ArrowUp') hsv.v = Math.min(1, hsv.v + d);
      else if (event.key === 'ArrowDown') hsv.v = Math.max(0, hsv.v - d);
      else return;
      event.preventDefault();
      commit(sync());
    };
    hue.oninput = () => {
      hsv = { ...hsv, h: Number(hue.value) };
      options.onPreview?.(sync());
    };
    hue.onchange = () => commit(sync());
    hex.onkeydown = (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const parsed = normalizeHex(hex.value);
      if (!parsed) {
        hex.value = hsvToHex(hsv);
        hex.setAttribute('aria-invalid', 'true');
        return;
      }
      hex.removeAttribute('aria-invalid');
      hsv = hexToHsv(parsed);
      sync();
      commit(parsed);
    };
    const row = (title: string, colors: readonly string[], kind: string) => {
      const section = document.createElement('section');
      section.className = 'color-row';
      section.dataset.row = kind;
      const heading = document.createElement('h4');
      heading.textContent = title;
      const grid = document.createElement('div');
      grid.className = 'color-grid';
      for (const color of colors) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'color-swatch';
        swatch.dataset.color = color;
        swatch.style.setProperty('--swatch', color);
        swatch.setAttribute('aria-label', color);
        swatch.title = color;
        swatch.onclick = () => {
          hsv = hexToHsv(color);
          sync();
          commit(color);
        };
        grid.append(swatch);
      }
      section.append(heading, grid);
      return section;
    };
    body.append(square, hue, hexRow);
    if (options.allowNone && options.onNone) {
      const none = document.createElement('button');
      none.type = 'button';
      none.className = 'color-none';
      none.dataset.action = 'no-fill';
      none.innerHTML = `${iconSvg('noFill', 14)}<span>${t('toolbar.noFill')}</span>`;
      none.setAttribute('aria-pressed', String(value === null));
      const onNone = options.onNone;
      none.onclick = () => {
        closePopover();
        onNone();
      };
      body.append(none);
    }
    if (recent.length) body.append(row(t('color.recent'), recent, 'recent'));
    const used = [...new Set(options.documentColors?.() ?? [])].slice(0, 16);
    if (used.length) body.append(row(t('color.document'), used, 'document'));
    body.append(row(t('color.defaults'), DEFAULT_SWATCHES, 'defaults'));
    sync();
    return body;
  }
}
