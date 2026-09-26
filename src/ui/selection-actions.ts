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
  const update = (box: StageBox | null, stage: { width: number }) => {
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
    // Above the box's top-right corner, clear of the corner handle; beside a
    // narrow box so it never covers the rotation handle; below it when there
    // is no room above.
    const width = cluster.offsetWidth,
      height = cluster.offsetHeight;
    const gap = 16;
    const narrow = box.right - box.left < width + 80;
    const left = Math.max(
      0,
      Math.min(
        stage.width - width,
        narrow ? box.right + gap : box.right - width,
      ),
    );
    const top = narrow
      ? Math.max(0, box.top)
      : box.top - height - gap >= 0
        ? box.top - height - gap
        : box.bottom + gap;
    cluster.style.left = `${left}px`;
    cluster.style.top = `${top}px`;
  };
  return { update };
}
