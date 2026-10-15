// Q5: Settings › Animations. Panel and timeline transitions follow the
// system's reduce-motion signal by default (Auto); On forces them, Off
// removes them. The choice is a UI setting in localStorage (`aive.motion`),
// set as `data-motion` on <html> (index.html does it before first paint), and
// the stylesheet reads that attribute instead of a bare media query (D-253).
export type MotionSetting = 'auto' | 'on' | 'off';
export const MOTION_KEY = 'aive.motion';
export const MOTION_SETTINGS: readonly MotionSetting[] = ['auto', 'on', 'off'];

export const isMotionSetting = (value: unknown): value is MotionSetting =>
  value === 'auto' || value === 'on' || value === 'off';

/** True when transitions are reduced for this setting and system signal. */
export function motionReduced(
  setting: MotionSetting,
  systemReduces: boolean,
): boolean {
  return setting === 'off' || (setting === 'auto' && systemReduces);
}
export function systemReducesMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
export function readMotion(): MotionSetting {
  try {
    const saved = localStorage.getItem(MOTION_KEY);
    return isMotionSetting(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}
export function applyMotion(setting: MotionSetting): void {
  document.documentElement.dataset.motion = setting;
  try {
    localStorage.setItem(MOTION_KEY, setting);
  } catch {
    // A view setting: not kept when storage is blocked.
  }
}
/** Whether the editor should reduce motion now (setting and system). */
export const reducedNow = () =>
  motionReduced(
    isMotionSetting(document.documentElement.dataset.motion)
      ? (document.documentElement.dataset.motion as MotionSetting)
      : 'auto',
    systemReducesMotion(),
  );
