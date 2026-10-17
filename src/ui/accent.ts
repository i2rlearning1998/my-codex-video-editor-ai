// FINAL2 U1: the accent colour (Settings › Appearance). One choice per mode,
// kept in this browser (never the project, no undo). Purple, the default,
// leaves every token exactly as tokens.css defines it.
import {
  applyAccent,
  loadAppearance,
  saveAppearance,
  type Appearance,
  type AppearanceMode,
} from '../appearance';
import { currentTheme, onThemeChange } from './theme';

let choices: Appearance = loadAppearance();
const listeners = new Set<() => void>();

export const accentChoices = (): Appearance => ({ ...choices });

function apply(): void {
  if (typeof document === 'undefined') return;
  applyAccent(
    document.documentElement,
    currentTheme(),
    choices[currentTheme()],
  );
  for (const listener of [...listeners]) listener();
}

export function setAccent(mode: AppearanceMode, id: string): void {
  choices = { ...choices, [mode]: id };
  // A blocked storage keeps the choice for this session.
  saveAppearance(choices);
  apply();
}
export function onAccentChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** At startup, after initTheme; follows every dark / light switch. */
export function initAccent(): () => void {
  apply();
  return onThemeChange(apply);
}
