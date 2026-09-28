// G1.5: deep panels (Position, Animate, Colour, Stroke style) open in the LEFT
// side panel, like Canva, with a header holding Back. Only one is open at a
// time; while one is open the rail's own content is hidden. Panels never float
// over the canvas, so they never cover the selected object.
import { t } from '../i18n';
import { iconSvg } from './icons';

export interface DeepPanelHandle {
  /** The element the panel renders into (below the header). */
  readonly body: HTMLElement;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
}

export interface SidePanels {
  /** A panel whose content a module renders itself into `body`. */
  register(
    id: string,
    title: () => string,
    hooks?: { onOpen?: () => void; onClose?: () => void },
  ): DeepPanelHandle;
  /**
   * A panel built on demand; `build` runs on open and on every refresh and
   * returns null when the panel no longer applies (it then closes).
   */
  show(id: string, title: string, build: () => HTMLElement | null): void;
  /** Re-renders the open built panel (after a selection or project change). */
  refresh(): void;
  close(): void;
  readonly openId: string | null;
}

export function createSidePanels(
  host: HTMLElement,
  registerOverlay: (close: () => void) => () => void,
): SidePanels {
  host.classList.add('side-panel-host');
  let openId: string | null = null;
  let unregister: (() => void) | undefined;
  const closers = new Map<string, () => void>();
  const frame = (id: string, title: () => string, close: () => void) => {
    const root = document.createElement('section');
    root.className = 'deep-panel';
    root.dataset.deepPanel = id;
    root.setAttribute('role', 'region');
    root.hidden = true;
    const header = document.createElement('header');
    header.className = 'deep-panel-header';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'icon-button deep-panel-back';
    back.dataset.action = 'side-panel-back';
    back.innerHTML = iconSvg('chevronLeft', 16);
    back.setAttribute('aria-label', t('sidePanel.back'));
    back.title = t('sidePanel.back');
    back.onclick = close;
    const heading = document.createElement('h2');
    header.append(back, heading);
    const body = document.createElement('div');
    body.className = 'deep-panel-body';
    root.append(header, body);
    host.append(root);
    const label = () => {
      heading.textContent = title();
      root.setAttribute('aria-label', title());
    };
    return { root, body, label };
  };
  const opened = (id: string) => {
    for (const [other, close] of closers) if (other !== id) close();
    openId = id;
    host.dataset.open = id;
    host.closest('.library')?.classList.add('deep-open');
    unregister ??= registerOverlay(() => closers.get(openId ?? '')?.());
  };
  const closed = (id: string) => {
    if (openId !== id) return;
    openId = null;
    delete host.dataset.open;
    host.closest('.library')?.classList.remove('deep-open');
    unregister?.();
    unregister = undefined;
  };
  let built: {
    id: string;
    title: string;
    build: () => HTMLElement | null;
    frame: ReturnType<typeof frame>;
  } | null = null;
  const builtFrames = new Map<string, ReturnType<typeof frame>>();
  const closeBuilt = () => {
    if (!built) return;
    const { id, frame } = built;
    built = null;
    frame.root.hidden = true;
    frame.body.replaceChildren();
    closed(id);
  };
  const renderBuilt = () => {
    if (!built) return;
    const content = built.build();
    if (!content) return closeBuilt();
    // Keep the focused control focused across the re-render.
    const focusedId =
      document.activeElement instanceof HTMLElement &&
      built.frame.body.contains(document.activeElement)
        ? document.activeElement.id
        : '';
    built.frame.body.replaceChildren(content);
    if (focusedId)
      built.frame.body
        .querySelector<HTMLElement>(`#${CSS.escape(focusedId)}`)
        ?.focus();
  };
  return {
    register(id, title, hooks = {}) {
      const panel = frame(id, title, () => handle.close());
      const handle: DeepPanelHandle = {
        body: panel.body,
        get isOpen() {
          return !panel.root.hidden;
        },
        open() {
          panel.label();
          const wasOpen = !panel.root.hidden;
          panel.root.hidden = false;
          opened(id);
          if (!wasOpen) hooks.onOpen?.();
        },
        close() {
          if (panel.root.hidden) return;
          panel.root.hidden = true;
          closed(id);
          hooks.onClose?.();
        },
        toggle() {
          if (panel.root.hidden) handle.open();
          else handle.close();
        },
      };
      closers.set(id, () => handle.close());
      return handle;
    },
    show(id, title, build) {
      if (built?.id === id) {
        built.build = build;
        built.title = title;
        return renderBuilt();
      }
      closeBuilt();
      let panelFrame = builtFrames.get(id);
      if (!panelFrame) {
        panelFrame = frame(id, () => built?.title ?? title, () => {
          if (built?.id === id) closeBuilt();
        });
        builtFrames.set(id, panelFrame);
        // Closes this panel only if it is the one showing.
        closers.set(id, () => {
          if (built?.id === id) closeBuilt();
        });
      }
      built = { id, title, build, frame: panelFrame };
      panelFrame.label();
      panelFrame.root.hidden = false;
      opened(id);
      renderBuilt();
    },
    refresh: renderBuilt,
    close() {
      if (openId) closers.get(openId)?.();
    },
    get openId() {
      return openId;
    },
  };
}
