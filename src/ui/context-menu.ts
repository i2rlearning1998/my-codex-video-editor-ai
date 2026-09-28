// W2-F1: the one right-click menu renderer. A surface (the canvas today, the
// timeline clip context later) builds a list of entries from the selection's
// capabilities; this renders them, with submenus opening in place behind a
// Back item (the VID-015 pattern). Nothing here knows about layers or clips.
import { t } from '../i18n';

export interface MenuEntry {
  /** Stable id, rendered as data-action. */
  readonly id: string;
  readonly label: string;
  /** Runs the action and closes the menu. Absent means disabled. */
  readonly run?: () => void;
  /** Tooltip explaining why a disabled entry is unavailable. */
  readonly reason?: string;
  readonly role?: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio';
  readonly checked?: boolean;
  /** Opens a nested list in place of the menu, with Back. */
  readonly submenu?: () => readonly MenuEntry[];
  /** Runs without closing (toggles), then re-renders the current list. */
  readonly toggle?: () => void;
  /** Draws a divider above the entry. */
  readonly divider?: boolean;
  readonly shortcut?: string;
  /** Extra data-* attributes. */
  readonly data?: Readonly<Record<string, string>>;
}

export interface MenuController {
  open(entries: () => readonly MenuEntry[]): void;
  close(): void;
  readonly isOpen: boolean;
}

export function createMenu(
  container: HTMLElement,
  options: {
    onClose?: () => void;
    report: (error: unknown) => void;
  },
): MenuController {
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      options.report(error);
    }
  };
  const close = () => {
    if (container.hidden) return;
    container.hidden = true;
    options.onClose?.();
  };
  const render = (
    entries: () => readonly MenuEntry[],
    back?: () => void,
  ): void => {
    const items: HTMLButtonElement[] = [];
    if (back) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.dataset.action = 'menu-back';
      item.textContent = `‹ ${t('menu.back')}`;
      item.onclick = (event) => {
        event.stopPropagation();
        back();
      };
      items.push(item);
    }
    for (const entry of entries()) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', entry.role ?? 'menuitem');
      item.dataset.action = entry.id;
      for (const [key, value] of Object.entries(entry.data ?? {}))
        item.dataset[key] = value;
      item.textContent = entry.submenu ? `${entry.label} ›` : entry.label;
      if (entry.shortcut) {
        const shortcut = document.createElement('kbd');
        shortcut.textContent = entry.shortcut;
        item.append(shortcut);
      }
      if (entry.checked !== undefined)
        item.setAttribute('aria-checked', String(entry.checked));
      if (entry.divider) item.classList.add('canvas-context-menu-divider');
      if (entry.submenu) {
        item.setAttribute('aria-haspopup', 'menu');
        const nested = entry.submenu;
        item.onclick = (event) => {
          event.stopPropagation();
          render(nested, () => render(entries, back));
        };
      } else if (entry.toggle) {
        const toggle = entry.toggle;
        item.onclick = (event) => {
          event.stopPropagation();
          safely(toggle);
          render(entries, back);
        };
      } else if (entry.run) {
        const run = entry.run;
        item.onclick = () => {
          close();
          safely(run);
        };
      } else {
        item.disabled = true;
        if (entry.reason) item.title = entry.reason;
      }
      items.push(item);
    }
    container.replaceChildren(...items);
    container
      .querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?.focus();
  };
  return {
    open(entries) {
      container.hidden = false;
      render(entries);
    },
    close,
    get isOpen() {
      return !container.hidden;
    },
  };
}
