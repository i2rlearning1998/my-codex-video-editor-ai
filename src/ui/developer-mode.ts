// FIX7: testing-only tools (importing a composition / plan file, "Export
// code") are for building and testing the editor, not for the people who use
// it. They show in development and test builds, and in a production build
// only when Developer mode is switched on (localStorage `aive.developer`).
export function developerMode(): boolean {
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') return true;
  try {
    return localStorage.getItem('aive.developer') === '1';
  } catch {
    return false;
  }
}
