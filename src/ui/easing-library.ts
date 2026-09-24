// ANI-010 easing preset library: named cubic-bezier curves, each shown as a
// drawn curve plus a dot that slides with that timing on hover or focus.
import type { Easing } from '../core';
import { t } from '../i18n';

export const EASING_LIBRARY = [
  { id: 'smooth', curve: [0.45, 0, 0.55, 1] },
  { id: 'gentle', curve: [0.25, 0.1, 0.25, 1] },
  { id: 'snappy', curve: [0.2, 0.9, 0.3, 1] },
  { id: 'slow-start', curve: [0.7, 0, 0.84, 0] },
  { id: 'slow-end', curve: [0.16, 1, 0.3, 1] },
  { id: 'anticipate', curve: [0.36, 0, 0.66, -0.56] },
  { id: 'overshoot', curve: [0.34, 1.56, 0.64, 1] },
] as const;

const SIZE = 40,
  PAD = 8;
/** The curve drawn in a 40×40 box; y may leave [0, 1] (overshoot). */
function curvePath([x1, y1, x2, y2]: readonly number[]): string {
  const px = (x: number) => PAD + x * (SIZE - 2 * PAD);
  const py = (y: number) => SIZE - PAD - y * (SIZE - 2 * PAD);
  return `M${px(0)} ${py(0)} C${px(x1!)} ${py(y1!)} ${px(x2!)} ${py(y2!)} ${px(1)} ${py(1)}`;
}

export function easingLibrary(
  current: Easing | undefined,
  pick: (easing: Easing) => void,
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'easing-library';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', t('easing.library'));
  for (const { id, curve } of EASING_LIBRARY) {
    const [x1, y1, x2, y2] = curve;
    const active =
      typeof current === 'object' &&
      current.x1 === x1 &&
      current.y1 === y1 &&
      current.x2 === x2 &&
      current.y2 === y2;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'easing-preset';
    button.dataset.easingPreset = id;
    button.setAttribute('aria-pressed', String(active));
    const label = t(`easing.preset.${id}`);
    button.title = label;
    button.style.setProperty(
      '--easing',
      `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`,
    );
    button.innerHTML = `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" aria-hidden="true"><path class="easing-grid" d="M${PAD} ${SIZE - PAD}H${SIZE - PAD}M${PAD} ${PAD}V${SIZE - PAD}"/><path class="easing-curve" d="${curvePath(curve)}"/></svg><span class="easing-track" aria-hidden="true"><span class="easing-dot"></span></span><span class="easing-name"></span>`;
    button.querySelector('.easing-name')!.textContent = label;
    button.onclick = () => pick({ type: 'cubic', x1, y1, x2, y2 } as Easing);
    grid.append(button);
  }
  return grid;
}
