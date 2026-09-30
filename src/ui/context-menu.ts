// W2-F1: the one right-click menu renderer. A surface (the canvas today, the
// timeline clip context later) builds a list of entries from the selection's
// capabilities; this renders them. Nothing here knows about layers or clips.
// G1.3: submenus are flyouts that open on hover after a short delay, with a
// grace period so a diagonal move toward the flyout never closes it; arrow
// keys, Enter and Escape work at every level; the menu is placed to fit the
// viewport (flipping up or left) and only scrolls when the viewport is truly
// too small.

import { iconSvg } from './icons';

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
  /** Opens a nested flyout list. */
  readonly submenu?: () => readonly MenuEntry[];
  /** Runs without closing (toggles), then re-renders the current list. */
  readonly toggle?: () => void;
  /** Draws a divider above the entry. */
  readonly divider?: boolean;
  readonly shortcut?: string;
  /** H2: a 16 px icon in the menu's icon column. */
  readonly icon?: string;
  /** Extra data-* attributes. */
  readonly data?: Readonly<Record<string, string>>;
}

export interface MenuController {
  open(entries: () => readonly MenuEntry[]): void;
  close(): void;
  /** Keeps the open menu inside its container's box (flips up or left). */
  fit(): void;
  readonly isOpen: boolean;
}

/** Hover delay before a flyout opens, and the grace before it closes (H2). */
export const SUBMENU_OPEN_DELAY = 120;
const SUBMENU_CLOSE_GRACE = 200;

export function createMenu(
  container: HTMLElement,
  options: {
    onClose?: () => void;
    report: (error: unknown) => void;
  },
): MenuController {
  container.setAttribute('role', 'menu');
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      options.report(error);
    }
  };
  /** Open flyouts, outermost first; each belongs to a parent item. */
  let flyouts: { list: HTMLElement; parent: HTMLButtonElement }[] = [];
  let openTimer = 0,
    closeTimer = 0;
  const clearTimers = () => {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
  };
  /** Closes flyouts deeper than `level` (0 = the root list). */
  const closeFrom = (level: number) => {
    for (const { list, parent } of flyouts.slice(level)) {
      list.remove();
      parent.setAttribute('aria-expanded', 'false');
    }
    flyouts = flyouts.slice(0, level);
  };
  const close = () => {
    clearTimers();
    if (container.hidden) return;
    closeFrom(0);
    container.hidden = true;
    options.onClose?.();
  };
  const buttons = (list: HTMLElement) => [
    ...list.querySelectorAll<HTMLButtonElement>(':scope > button'),
  ];
  const focusStep = (list: HTMLElement, step: number) => {
    const items = buttons(list).filter(
      (item) => !item.disabled && item.getAttribute('aria-disabled') !== 'true',
    );
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + step + items.length) % items.length]?.focus();
  };
  const placeFlyout = (list: HTMLElement, parent: HTMLElement) => {
    const box = parent.getBoundingClientRect();
    const width = list.offsetWidth,
      height = list.offsetHeight;
    const margin = 8;
    const right = box.right + 2;
    const left =
      right + width + margin > window.innerWidth
        ? Math.max(margin, box.left - width - 2)
        : right;
    const top = Math.max(
      margin,
      Math.min(box.top - 4, window.innerHeight - height - margin),
    );
    list.style.left = `${Math.round(left)}px`;
    list.style.top = `${Math.round(top)}px`;
    list.style.maxBlockSize = `${window.innerHeight - 2 * margin}px`;
  };
  const openFlyout = (
    level: number,
    parent: HTMLButtonElement,
    entries: () => readonly MenuEntry[],
    focusFirst: boolean,
  ) => {
    clearTimers();
    if (flyouts[level]?.parent === parent) {
      closeFrom(level + 1);
      return;
    }
    closeFrom(level);
    const list = document.createElement('div');
    list.className = 'menu-flyout';
    list.setAttribute('role', 'menu');
    list.setAttribute('aria-label', parent.dataset.label ?? '');
    container.append(list);
    flyouts.push({ list, parent });
    parent.setAttribute('aria-expanded', 'true');
    fill(list, entries, level + 1);
    placeFlyout(list, parent);
    list.onpointerenter = () => window.clearTimeout(closeTimer);
    if (focusFirst) focusStep(list, 1);
  };
  const fill = (
    list: HTMLElement,
    entries: () => readonly MenuEntry[],
    level: number,
  ): void => {
    const items: HTMLButtonElement[] = [];
    for (const entry of entries()) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', entry.role ?? 'menuitem');
      item.dataset.action = entry.id;
      item.dataset.label = entry.label;
      for (const [key, value] of Object.entries(entry.data ?? {}))
        item.dataset[key] = value;
      const icon = document.createElement('span');
      icon.className = 'menu-icon';
      icon.setAttribute('aria-hidden', 'true');
      if (entry.icon) icon.innerHTML = iconSvg(entry.icon, 16);
      const label = document.createElement('span');
      label.className = 'menu-label';
      label.textContent = entry.label;
      item.append(icon, label);
      if (entry.shortcut) {
        const shortcut = document.createElement('kbd');
        shortcut.textContent = entry.shortcut;
        // The name stays the label; the keys are announced as shortcuts.
        shortcut.setAttribute('aria-hidden', 'true');
        item.setAttribute(
          'aria-keyshortcuts',
          entry.shortcut.replace(/Ctrl/g, 'Control'),
        );
        item.append(shortcut);
      }
      if (entry.checked !== undefined)
        item.setAttribute('aria-checked', String(entry.checked));
      if (entry.divider) item.classList.add('canvas-context-menu-divider');
      if (entry.submenu) {
        const nested = entry.submenu;
        item.setAttribute('aria-haspopup', 'menu');
        item.setAttribute('aria-expanded', 'false');
        item.classList.add('menu-parent');
        item.onclick = (event) => {
          event.stopPropagation();
          openFlyout(level, item, nested, event.detail === 0);
        };
        item.onpointerenter = () => {
          window.clearTimeout(closeTimer);
          window.clearTimeout(openTimer);
          openTimer = window.setTimeout(
            () => openFlyout(level, item, nested, false),
            SUBMENU_OPEN_DELAY,
          );
        };
      } else {
        // Hovering a sibling closes this level's open flyout after a grace
        // period, so a diagonal move toward the flyout does not close it.
        item.onpointerenter = () => {
          window.clearTimeout(openTimer);
          if (flyouts.length > level) {
            window.clearTimeout(closeTimer);
            closeTimer = window.setTimeout(
              () => closeFrom(level),
              SUBMENU_CLOSE_GRACE,
            );
          }
        };
        if (entry.toggle) {
          const toggle = entry.toggle;
          item.onclick = (event) => {
            event.stopPropagation();
            safely(toggle);
            fill(list, entries, level);
            list
              .querySelector<HTMLElement>(`[data-action="${entry.id}"]`)
              ?.focus();
          };
        } else if (entry.run) {
          const run = entry.run;
          item.onclick = () => {
            close();
            safely(run);
          };
        } else {
          // H2: disabled items stay hoverable so their reason shows as a
          // tooltip ("Planned: ..."); aria-disabled keeps them inert.
          item.setAttribute('aria-disabled', 'true');
          if (entry.reason) item.title = entry.reason;
        }
      }
      items.push(item);
    }
    list.replaceChildren(...items);
    list.onkeydown = (event) => {
      const active = document.activeElement as HTMLButtonElement | null;
      if (event.key === 'ArrowDown') focusStep(list, 1);
      else if (event.key === 'ArrowUp') focusStep(list, -1);
      else if (event.key === 'Home') focusStep(list, -buttons(list).length);
      else if (
        event.key === 'ArrowRight' &&
        active?.classList.contains('menu-parent')
      )
        active.click();
      else if (event.key === 'ArrowLeft' && level > 0) {
        const parent = flyouts[level - 1]!.parent;
        closeFrom(level - 1);
        parent.focus();
      } else if (event.key === 'Escape') {
        if (level > 0) {
          const parent = flyouts[level - 1]!.parent;
          closeFrom(level - 1);
          parent.focus();
        } else close();
      } else return;
      event.preventDefault();
      event.stopPropagation();
    };
  };
  const fit = () => {
    if (container.hidden) return;
    const area = container.offsetParent?.getBoundingClientRect();
    if (!area) return;
    container.style.maxBlockSize = '';
    const left = container.offsetLeft,
      top = container.offsetTop;
    const width = container.offsetWidth,
      height = container.offsetHeight;
    // Flip up (or left) when the menu would pass the area's edge.
    if (top + height > area.height)
      container.style.top = `${Math.max(0, Math.min(top - height, area.height - height))}px`;
    if (left + width > area.width)
      container.style.left = `${Math.max(0, area.width - width)}px`;
    // Only a truly small area scrolls, with the thin themed scrollbar.
    if (height > area.height) container.style.maxBlockSize = `${area.height}px`;
  };
  return {
    open(entries) {
      clearTimers();
      closeFrom(0);
      container.hidden = false;
      fill(container, entries, 0);
      container
        .querySelector<HTMLButtonElement>(
          ':scope > button:not(:disabled):not([aria-disabled="true"])',
        )
        ?.focus();
    },
    close,
    fit,
    get isOpen() {
      return !container.hidden;
    },
  };
}
