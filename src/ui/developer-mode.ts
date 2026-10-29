// FIX7: testing-only tools (importing a composition / plan file, "Export
// code") are for building and testing the editor, not for the people who use
// it. They show in development and test builds, and in a production build
// only when Developer mode is switched on (localStorage `aive.developer`).
export function developerMode(): boolean {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('aive.developer');
  } catch {
    /* Storage blocked: the build's default. */
  }
  // FIX9: "0" is an explicit off (also in development), so the view people
  // get can be checked: no engines, no keys, no offline model screen.
  if (saved === '0') return false;
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') return true;
  return saved === '1';
}
