// FIX1 F3: switches for code that is kept but not shown. The owner will plug
// his own voice provider in later through the same provider interface;
// until then the browser voice, the offline voice and the old right-hand
// Text to speech panel stay off. A test can switch one on with
// `window.__AIVE_FLAGS__ = { browserVoice: true }` before the app loads.
export interface FeatureFlags {
  /** The browser's own speechSynthesis voices (preview only). */
  browserVoice: boolean;
  /** The offline (in-browser model) voice. */
  offlineVoice: boolean;
  /** The V7 right-hand Text to speech panel. */
  legacyTtsPanel: boolean;
}
const DEFAULTS: FeatureFlags = {
  browserVoice: false,
  offlineVoice: false,
  legacyTtsPanel: false,
};
export function flag(name: keyof FeatureFlags): boolean {
  const override =
    typeof window === 'undefined'
      ? undefined
      : (window as { __AIVE_FLAGS__?: Partial<FeatureFlags> }).__AIVE_FLAGS__;
  return override?.[name] ?? DEFAULTS[name];
}
