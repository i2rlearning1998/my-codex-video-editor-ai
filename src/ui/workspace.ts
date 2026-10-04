import type { EditorSession } from './session';
import { iconSvg } from './icons';
import { t } from '../i18n';

/**
 * H1.5: the one source of truth for whether each side panel is open. The
 * rails and the top-bar toggles all read and change it here.
 */
export interface Workspace {
  readonly leftOpen: boolean;
  readonly rightOpen: boolean;
  /** H2: the layout for the window width (see LAYOUTS). */
  readonly layout: Layout;
  setOpen(side: 'left' | 'right', open: boolean): void;
  onChange(listener: () => void): () => void;
  dispose(): void;
}
/**
 * H2 layouts by window width:
 * - wide (≥ 1440): both panels docked; the right one collapses to its rail;
 * - medium (1024 to 1439): the left panel docked, the right one an overlay
 *   drawer beside its rail, closed at first;
 * - narrow (768 to 1023): both panels are drawers over a scrim;
 * - phone (< 768): one panel at a time, as a bottom sheet.
 */
export type Layout = 'wide' | 'medium' | 'narrow' | 'phone';
export function layoutFor(width: number): Layout {
  return width >= 1440
    ? 'wide'
    : width >= 1024
      ? 'medium'
      : width >= 768
        ? 'narrow'
        : 'phone';
}
const SIZES: Record<
  Layout,
  { rail: number; left: number; right: number; timeline: number }
> = {
  wide: { rail: 64, left: 320, right: 280, timeline: 280 },
  medium: { rail: 56, left: 280, right: 280, timeline: 220 },
  narrow: { rail: 56, left: 300, right: 300, timeline: 200 },
  phone: { rail: 56, left: 0, right: 0, timeline: 180 },
};
const LIMITS = {
  left: [260, 420],
  right: [240, 360],
  timeline: [160, 0.6],
} as const;

/** T4: the timeline's height is a view setting kept in this browser. */
const HEIGHT_KEY = 'aive.timelineHeight';
function storedHeight(): number | null {
  try {
    const value = Number(localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
function storeHeight(value: number | null): void {
  try {
    if (value !== null)
      localStorage.setItem(HEIGHT_KEY, String(Math.round(value)));
  } catch {
    // Storage may be blocked; the height then lasts for this page only.
  }
}

/** Small transient panel sizing, not a docking or document-layout model. */
export function mountWorkspace(
  shell: HTMLElement,
  session: EditorSession,
  resize: () => void,
): Workspace {
  const listeners = new Set<() => void>();
  let layout = layoutFor(window.innerWidth);
  let left = SIZES[layout].left || SIZES.wide.left,
    right = SIZES[layout].right || SIZES.wide.right,
    height: number | null = storedHeight();
  let leftClosed = layout === 'narrow' || layout === 'phone',
    rightClosed = layout !== 'wide';
  const bar = shell.querySelector('.topbar')!;
  const leftToggle = document.createElement('div');
  leftToggle.className = 'workspace-controls';
  leftToggle.innerHTML = `<button type="button" class="icon-button" data-panel="left" aria-controls="library-panel" aria-label="${t('workspace.toggleLibrary')}" title="${t('workspace.toggleLibrary')}">${iconSvg('panelLeft')}</button>`;
  (bar.querySelector('#menu-trigger') ?? bar.firstElementChild)!.after(
    leftToggle,
  );
  const rightToggle = document.createElement('div');
  rightToggle.className = 'workspace-controls';
  rightToggle.innerHTML = `<button type="button" class="icon-button" data-panel="right" aria-controls="inspector-panel" aria-label="${t('workspace.toggleInspector')}" title="${t('workspace.toggleInspector')}">${iconSvg('panelRight')}</button>`;
  (bar.querySelector('.top-actions') ?? bar).prepend(rightToggle);
  const scrim = shell.querySelector<HTMLElement>('#drawer-scrim');
  const clampTimeline = (value: number) =>
    Math.max(
      LIMITS.timeline[0],
      Math.min(window.innerHeight * LIMITS.timeline[1], value),
    );
  // The canvas refits at most once per frame while a panel animates.
  let queued = false;
  const refit = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      resize();
    });
  };
  const paint = () => {
    const sizes = SIZES[layout];
    const docked = (side: 'left' | 'right') =>
      side === 'left'
        ? layout === 'wide' || layout === 'medium'
        : layout === 'wide';
    shell.dataset.layout = layout;
    shell.style.setProperty('--rail-width', `${sizes.rail}px`);
    shell.style.setProperty(
      '--left-panel',
      `${docked('left') && !leftClosed ? left : 0}px`,
    );
    shell.style.setProperty(
      '--right-panel',
      `${docked('right') && !rightClosed ? right : 0}px`,
    );
    // The open widths, for drawers and for content that must not reflow.
    shell.style.setProperty('--left-open', `${left}px`);
    shell.style.setProperty('--right-open', `${right}px`);
    shell.style.setProperty(
      '--timeline-height',
      `${Math.round(clampTimeline(height ?? sizes.timeline))}px`,
    );
    // Floating layers under <body> (toasts) read these too.
    for (const name of ['--rail-width', '--timeline-height'])
      document.documentElement.style.setProperty(
        name,
        shell.style.getPropertyValue(name),
      );
    shell.classList.toggle('library-collapsed', leftClosed);
    shell.classList.toggle('inspector-collapsed', rightClosed);
    shell.classList.toggle('left-drawer', !docked('left'));
    shell.classList.toggle('right-drawer', !docked('right'));
    const drawerOpen =
      (!docked('left') && !leftClosed) ||
      ((layout === 'narrow' || layout === 'phone') && !rightClosed);
    if (scrim) scrim.hidden = !drawerOpen;
    leftToggle
      .querySelector('button')
      ?.setAttribute('aria-expanded', String(!leftClosed));
    rightToggle
      .querySelector('button')
      ?.setAttribute('aria-expanded', String(!rightClosed));
    refit();
    for (const listener of [...listeners]) listener();
  };
  const setOpen = (side: 'left' | 'right', open: boolean) => {
    if (side === 'left') leftClosed = !open;
    else rightClosed = !open;
    // A phone shows one sheet at a time; a narrow screen one drawer.
    if (open && (layout === 'phone' || layout === 'narrow')) {
      if (side === 'left') rightClosed = true;
      else leftClosed = true;
    }
    paint();
  };
  const togglePanel = (event: MouseEvent) => {
    const side = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-panel]',
    )?.dataset.panel;
    if (side === 'left') setOpen('left', leftClosed);
    if (side === 'right') setOpen('right', rightClosed);
  };
  leftToggle.onclick = togglePanel;
  rightToggle.onclick = togglePanel;
  if (scrim)
    scrim.onclick = () => {
      if (layout !== 'wide' && layout !== 'medium') leftClosed = true;
      if (layout !== 'wide') rightClosed = true;
      paint();
    };
  const disposers: (() => void)[] = [];
  for (const [selector, axis, key] of [
    ['.library', 'left', 'workspace.resizeLeft'],
    ['.inspector', 'right', 'workspace.resizeRight'],
    ['.timeline', 'height', 'workspace.resizeTimeline'],
  ] as const) {
    const handle = document.createElement('div');
    handle.className = `panel-resizer ${axis}`;
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', t(key));
    handle.setAttribute(
      'aria-orientation',
      axis === 'height' ? 'horizontal' : 'vertical',
    );
    shell.querySelector(selector)!.append(handle);
    let gesture: {
      id: number;
      x: number;
      y: number;
      left: number;
      right: number;
      height: number;
    } | null = null;
    const release = () => {
      const id = gesture?.id;
      if (gesture && axis === 'height') storeHeight(height);
      gesture = null;
      shell.classList.remove('resizing');
      if (id !== undefined && handle.hasPointerCapture(id))
        handle.releasePointerCapture(id);
    };
    const current = () => height ?? SIZES[layout].timeline;
    const cancel = () => {
      if (gesture) {
        left = gesture.left;
        right = gesture.right;
        height = gesture.height;
        release();
        paint();
      }
    };
    const apply = (delta: number) => {
      if (axis === 'left')
        left = Math.max(
          LIMITS.left[0],
          Math.min(LIMITS.left[1], (gesture?.left ?? left) + delta),
        );
      else if (axis === 'right')
        right = Math.max(
          LIMITS.right[0],
          Math.min(LIMITS.right[1], (gesture?.right ?? right) - delta),
        );
      else height = clampTimeline((gesture?.height ?? current()) - delta);
      paint();
    };
    handle.onpointerdown = (event) => {
      if (event.button !== 0 || gesture) return;
      session.setPlaying(false);
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left,
        right,
        height: current(),
      };
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        cancel();
        return;
      }
      // Dragging a divider follows the pointer without the open animation.
      shell.classList.add('resizing');
      event.preventDefault();
    };
    handle.onpointermove = (event) => {
      if (event.pointerId !== gesture?.id) return;
      const delta =
        axis === 'height'
          ? event.clientY - gesture.y
          : event.clientX - gesture.x;
      if (!Number.isFinite(delta)) {
        cancel();
        return;
      }
      apply(delta);
    };
    // T4: the player bar is the timeline's top edge, so a press on its
    // empty background (not on a control) also resizes the timeline.
    if (axis === 'height') {
      const grip = (event: PointerEvent) => {
        const target = event.target as HTMLElement;
        if (
          !target.closest('[data-resize-grip]') ||
          target.closest(
            'button, input, select, textarea, a, [role="button"], [role="group"], [contenteditable], .number-field',
          ) ||
          shell.classList.contains('timeline-collapsed')
        )
          return;
        handle.onpointerdown?.(event);
      };
      const area = shell.querySelector<HTMLElement>(selector)!;
      area.addEventListener('pointerdown', grip);
      disposers.push(() => area.removeEventListener('pointerdown', grip));
    }
    handle.onpointerup = (event) => {
      if (event.pointerId === gesture?.id) release();
    };
    handle.onpointercancel = cancel;
    handle.onlostpointercapture = cancel;
    handle.onkeydown = (event) => {
      if (event.key === 'Escape') cancel();
      else if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        event.preventDefault();
        apply(['ArrowLeft', 'ArrowUp'].includes(event.key) ? -10 : 10);
        if (axis === 'height') storeHeight(height);
      }
    };
    window.addEventListener('blur', cancel);
    disposers.push(() => {
      cancel();
      window.removeEventListener('blur', cancel);
      handle.remove();
    });
  }
  const onWindowResize = () => {
    const next = layoutFor(window.innerWidth);
    if (next !== layout) {
      // A new layout starts from its own defaults.
      layout = next;
      leftClosed = layout === 'narrow' || layout === 'phone';
      rightClosed = layout !== 'wide';
      left = Math.max(LIMITS.left[0], SIZES[layout].left || left);
      right = Math.max(LIMITS.right[0], SIZES[layout].right || right);
    }
    paint();
  };
  window.addEventListener('resize', onWindowResize);
  paint();
  return {
    get leftOpen() {
      return !leftClosed;
    },
    get rightOpen() {
      return !rightClosed;
    },
    get layout() {
      return layout;
    },
    setOpen,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      listeners.clear();
      disposers.forEach((fn) => fn());
      window.removeEventListener('resize', onWindowResize);
      leftToggle.remove();
      rightToggle.remove();
    },
  };
}
