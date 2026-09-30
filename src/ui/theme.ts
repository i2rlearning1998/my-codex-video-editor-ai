// H2: the UI theme. A preference (dark, light or system) kept in
// localStorage as a UI setting, never in the project. The resolved theme is
// set as data-theme on <html>; index.html applies it before first paint, so
// there is no flash. Project content (the artboard) is never themed.
export type ThemePreference = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';
export const THEME_KEY = 'aive.theme';
const listeners = new Set<() => void>();

export function themePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system')
      return saved;
  } catch {
    /* Storage can be unavailable; the default applies. */
  }
  return 'dark';
}
const systemQuery = () =>
  typeof matchMedia === 'function'
    ? matchMedia('(prefers-color-scheme: light)')
    : null;
export function resolveTheme(preference = themePreference()): Theme {
  if (preference !== 'system') return preference;
  return systemQuery()?.matches ? 'light' : 'dark';
}
export const currentTheme = (): Theme =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

function apply(): void {
  const theme = resolveTheme();
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePreference = themePreference();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#f4f5f8' : '#13141a');
  for (const listener of [...listeners]) listener();
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    /* The choice still applies for this session. */
  }
  apply();
}
/** Dark → light → system → dark. */
export function cycleThemePreference(): ThemePreference {
  const order: ThemePreference[] = ['dark', 'light', 'system'];
  const next = order[(order.indexOf(themePreference()) + 1) % order.length]!;
  setThemePreference(next);
  return next;
}
export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** Applies the saved theme and follows the system when the preference is system. */
export function initTheme(): () => void {
  apply();
  const query = systemQuery();
  const follow = () => {
    if (themePreference() === 'system') apply();
  };
  query?.addEventListener('change', follow);
  return () => query?.removeEventListener('change', follow);
}
