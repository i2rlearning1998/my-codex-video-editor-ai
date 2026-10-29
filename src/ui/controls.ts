// FIX7 Part B: the editor asks here whether a control is on for a kind of
// selection; the owner's switches arrive in the signed catalog settings.
import { libraryClient } from '../library-client';
import {
  controlKey,
  offKeys,
  type ControlSurface,
} from '../library-client/controls';
import type { MenuEntry } from './context-menu';

export function controlOn(
  surface: ControlSurface,
  type: string,
  id: string,
): boolean {
  const off = offKeys(libraryClient().config()?.controls);
  return !off.has(controlKey(surface, type, id === 'unlock' ? 'lock' : id));
}

/** The menu without the entries the owner switched off (submenus too). */
export function filterMenu(
  entries: readonly MenuEntry[],
  type: string,
): MenuEntry[] {
  return entries
    .filter((entry) => controlOn('menu', type, entry.id))
    .map((entry) => {
      const { submenu } = entry;
      return submenu
        ? { ...entry, submenu: () => filterMenu(submenu(), type) }
        : entry;
    });
}
