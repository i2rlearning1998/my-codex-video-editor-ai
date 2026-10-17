import {
  accentPalette,
  type AccentPalette,
  type AppearanceMode,
} from './palettes';
export type ModePreference = AppearanceMode | 'system';
export interface Appearance {
  dark: string;
  light: string;
}
export interface AppearanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface AccentRoot {
  style: { setProperty(name: string, value: string): void };
  dataset: { [key: string]: string | undefined };
}
export const APPEARANCE_KEY = 'aive.appearance.accents';
export const EXISTING_THEME_KEY = 'aive.theme';
const defaultAppearance = (): Appearance => ({
  dark: 'purple',
  light: 'purple',
});
const browserStorage = () =>
  typeof localStorage === 'undefined' ? undefined : localStorage;
const normalize = (value: unknown): Appearance => {
  if (!value || typeof value !== 'object') return defaultAppearance();
  const record = value as Record<string, unknown>;
  return {
    dark: accentPalette(
      'dark',
      typeof record.dark === 'string' ? record.dark : 'purple',
    ).id,
    light: accentPalette(
      'light',
      typeof record.light === 'string' ? record.light : 'purple',
    ).id,
  };
};
/** Storage getter supports disabled storage and node unit tests without touching UI. */
export function loadAppearance(
  storage: () => AppearanceStorage | undefined = browserStorage,
): Appearance {
  try {
    const saved = storage()?.getItem(APPEARANCE_KEY);
    return saved ? normalize(JSON.parse(saved)) : defaultAppearance();
  } catch {
    return defaultAppearance();
  }
}
/** Returns whether durable persistence succeeded. Caller keeps the active session choice. */
export function saveAppearance(
  value: Appearance,
  storage: () => AppearanceStorage | undefined = browserStorage,
): boolean {
  try {
    const target = storage();
    if (!target) return false;
    target.setItem(APPEARANCE_KEY, JSON.stringify(normalize(value)));
    return true;
  } catch {
    return false;
  }
}
export function resolveMode(
  preference?: ModePreference,
  options: {
    storage?: () => AppearanceStorage | undefined;
    systemLight?: () => boolean;
  } = {},
): AppearanceMode {
  let selected = preference;
  if (!selected)
    try {
      const stored = (options.storage ?? browserStorage)()?.getItem(
        EXISTING_THEME_KEY,
      );
      if (stored === 'dark' || stored === 'light' || stored === 'system')
        selected = stored;
    } catch {
      /* Existing default is dark. */
    }
  if (selected !== 'system') return selected === 'light' ? 'light' : 'dark';
  try {
    return (
      options.systemLight ??
      (() =>
        typeof matchMedia === 'function' &&
        matchMedia('(prefers-color-scheme: light)').matches)
    )()
      ? 'light'
      : 'dark';
  } catch {
    return 'dark';
  }
}
export function applyAccent(
  root: AccentRoot,
  mode: AppearanceMode,
  accentId: string,
): AccentPalette {
  const palette = accentPalette(mode, accentId);
  for (const [variable, value] of Object.entries({
    '--accent': palette.accent,
    '--accent-hover': palette.accentHover,
    '--accent-active': palette.accentActive,
    '--accent-soft': palette.accentSoft,
    '--accent-contrast': palette.accentContrast,
  }))
    root.style.setProperty(variable, value);
  root.dataset.accent = palette.id;
  root.dataset.mode = mode;
  return palette;
}
