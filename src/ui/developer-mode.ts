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

// P4 Part 2: "Your own keys" and "Offline voice & captions" are gone from the
// editor's Settings. Stock and offline engines belong to the owner (Admin) and
// captions to Studio. Only automated tests (e2e build) and the explicit flag
// `aive.developer` = "1" still open those two tabs; a plain dev server does not.
export function engineTabsVisible(): boolean {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('aive.developer');
  } catch {
    /* Storage blocked: the build's default. */
  }
  if (saved === '0') return false;
  return import.meta.env.MODE === 'e2e' || saved === '1';
}
