// Phase 1 library brief, P1-30: feature keys for later plans. Every
// feature is on now (no billing exists); a key lets one place in the UI
// show a feature as locked (with Upgrade) or hide it once plans exist,
// without touching the feature itself.
export const FEATURE_KEYS = [
  'export.video',
  'export.mp4',
  'export.4k',
  'ai.autocut',
  'ai.captions',
  'ai.voice',
  'fx.chroma-key',
  'fx.masks',
  'camera',
  'cloud.save',
  'library.premium',
  'mcp.access',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureState = 'on' | 'locked' | 'hidden';

/**
 * The state of a feature. Always 'on' in this phase; dev and e2e pages may
 * set `__AIVE_FEATURES__` ({key: state}) to see the locked and hidden looks.
 */
export function featureState(key: FeatureKey): FeatureState {
  const env = import.meta.env as Record<string, unknown>;
  if (env.DEV === true || env.MODE === 'e2e') {
    const page = (globalThis as { __AIVE_FEATURES__?: Record<string, unknown> })
      .__AIVE_FEATURES__;
    const state = page?.[key];
    if (state === 'locked' || state === 'hidden') return state;
  }
  return 'on';
}
export const isEnabled = (key: FeatureKey): boolean =>
  featureState(key) === 'on';

/**
 * Applies a feature's state to its control: hidden removes it from view;
 * locked keeps it visible with an Upgrade badge, and a click says why
 * instead of running it (the click is stopped before the control's own).
 */
export function gateControl(
  control: HTMLElement,
  key: FeatureKey,
  text: { upgrade: string; locked: string },
  notify: (message: string) => void,
): FeatureState {
  const state = featureState(key);
  control.dataset.feature = key;
  control.dataset.featureState = state;
  if (state === 'hidden') control.hidden = true;
  if (state === 'locked') {
    // Still clickable: a click says why (like a locked library card).
    const badge = document.createElement('span');
    badge.className = 'feature-upgrade';
    badge.textContent = text.upgrade;
    control.append(badge);
    control.title = text.locked;
    control.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        notify(text.locked);
      },
      true,
    );
  }
  return state;
}
