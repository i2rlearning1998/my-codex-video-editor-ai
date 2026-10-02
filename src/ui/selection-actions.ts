// W2-F1 (CV-040): the small action cluster above the selection box. Its
// buttons come from the same capability rules as the right-click menu
// (contextActions and the Ungroup blocker), so it never offers an action the
// selection cannot take. "More" opens the full right-click menu.
import type { EditorEngine, Point2 } from '../core';
import { t } from '../i18n';
import { contextActions, performEdit, type EditAction } from './editing';
import { iconSvg } from './icons';
import { describeSelection } from './selection-context';
import type { EditorSession } from './session';
import { ungroupBlocker } from './ungroup';

/** The selection box in stage (CSS pixel) coordinates. */
export interface StageBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const QUICK: readonly {
  action: EditAction;
  icon: string;
  key: string;
  shortcut: string;
}[] = [
  {
    action: 'group',
    icon: 'groupSelection',
    key: 'command.group',
    shortcut: 'Ctrl+G',
  },
  {
    action: 'ungroup',
    icon: 'ungroup',
    key: 'command.ungroup',
    shortcut: 'Ctrl+Shift+G',
  },
  {
    action: 'duplicate',
    icon: 'duplicate',
    key: 'command.duplicate',
    shortcut: 'Ctrl+D',
  },
  {
    action: 'delete',
    icon: 'delete',
    key: 'command.delete',
    shortcut: 'Delete',
  },
];

export function mountSelectionActions(
  cluster: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  options: {
    openMenu: (point: Point2) => void;
    /** W2-F3: toggles the Position panel. */
    position?: () => void;
    report: (error: unknown) => void;
  },
) {
  cluster.setAttribute('role', 'toolbar');
  cluster.setAttribute('aria-label', t('selectionActions.label'));
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      options.report(error);
    }
  };
  const button = (id: string, icon: string, label: string) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'selection-action';
    item.dataset.action = id;
    item.innerHTML = iconSvg(icon, 16);
    item.setAttribute('aria-label', label);
    item.title = label;
    return item;
  };
  let identity = '';
  let rendered: unknown = null;
  /** Shows the cluster above `box`, or hides it when there is nothing to act on. */
  const update = (
    box: StageBox | null,
    stage: { width: number; height?: number },
  ) => {
    const ids = session.selectedIds;
    if (!box || !ids.length) {
      cluster.hidden = true;
      identity = '';
      return;
    }
    const source = session.source;
    const available = contextActions(source, ids, session.currentTime);
    const groups = describeSelection(source, ids).every('group');
    const key = JSON.stringify([ids, available, groups]);
    if (key !== identity || rendered !== engine.state) {
      identity = key;
      rendered = engine.state;
      const items = QUICK.flatMap(({ action, icon, key, shortcut }) => {
        const offered =
          action === 'ungroup' ? groups : available.includes(action);
        if (!offered) return [];
        const label = `${t(key)} (${shortcut})`;
        const item = button(action, icon, label);
        const reason =
          action === 'ungroup' ? ungroupBlocker(source, ids) : null;
        if (reason) {
          item.disabled = true;
          item.title = reason;
        } else
          item.onclick = () =>
            safely(() => performEdit(engine, session, action));
        return [item];
      });
      const position = options.position;
      const arrange = position
        ? [button('position', 'layers', t('toolbar.position'))]
        : [];
      if (arrange[0] && position) {
        arrange[0].setAttribute('aria-haspopup', 'dialog');
        arrange[0].onclick = () => safely(position);
      }
      const more = button('more', 'more', t('selectionActions.more'));
      more.setAttribute('aria-haspopup', 'menu');
      more.onclick = (event) => {
        event.stopPropagation();
        const bounds = more.getBoundingClientRect();
        const origin = cluster.offsetParent?.getBoundingClientRect();
        options.openMenu([
          bounds.left - (origin?.left ?? 0),
          bounds.bottom - (origin?.top ?? 0) + 4,
        ]);
      };
      cluster.replaceChildren(...items, ...arrange, more);
    }
    cluster.hidden = false;
    // H1.2: the cluster never covers the box or any of its handles. The box
    // passed in already includes the rotation handle; handles reach 12 px past
    // it. Try above (right-aligned), right, left and below, in that order, and
    // take the first that fits in the stage.
    const width = cluster.offsetWidth,
      height = cluster.offsetHeight;
    const gap = 16;
    const stageHeight = stage.height ?? Infinity;
    const clampX = (x: number) => Math.max(0, Math.min(stage.width - width, x));
    const candidates: [number, number][] = [
      [clampX(box.right - width), box.top - height - gap],
      [box.right + gap, Math.max(0, box.top)],
      [box.left - gap - width, Math.max(0, box.top)],
      [clampX(box.right - width), box.bottom + gap],
    ];
    const fits = ([x, y]: [number, number]) =>
      x >= 0 &&
      y >= 0 &&
      x + width <= stage.width &&
      y + height <= stageHeight &&
      (x + width <= box.left - 12 ||
        x >= box.right + 12 ||
        y + height <= box.top - 12 ||
        y >= box.bottom + 12);
    const [left, top] = candidates.find(fits) ?? candidates[0]!;
    cluster.style.left = `${left}px`;
    cluster.style.top = `${top}px`;
  };
  return { update };
}
