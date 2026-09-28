// W2-F1 canvas right-click menu, built from the selection's capabilities
// (selection-context.ts) and rendered by the shared menu (context-menu.ts).
// CV-020 layout: edit actions, clip actions, Group/Ungroup, Layer and Align
// submenus, then Copy style and Paste style.
import { BOOLEAN_OPS, canCombine, combineShapes } from './shapes';
import { clipTimeEffects, type EditorEngine } from '../core';
import { formatNumber, t } from '../i18n';
import {
  ALIGN_EDGES,
  alignSelection,
  canDistribute,
  distributeSelection,
} from './align';
import { ARRANGE_ACTIONS, arrangeSelection, canArrange } from './arrange';
import type { MenuEntry } from './context-menu';
import {
  contextActions,
  hasClipboard,
  performEdit,
  selectedClips,
  setClipSpeed,
  SPEED_PRESETS,
  type EditAction,
} from './editing';
import type { EditorSession } from './session';
import { describeSelection } from './selection-context';
import {
  canCopyStyle,
  copyStyle,
  hasStyle,
  pasteStyle,
} from './style-clipboard';
import { ungroupBlocker } from './ungroup';

const LABEL_KEYS: Partial<Record<EditAction, string>> = {
  split: 'command.split',
  duplicate: 'command.duplicate',
  delete: 'command.delete',
  'toggle-enabled': 'command.toggleEnabled',
  cut: 'command.cut',
  copy: 'command.copy',
  paste: 'command.paste',
  link: 'command.link',
  unlink: 'command.unlink',
  'detach-audio': 'command.detach-audio',
  group: 'command.group',
  ungroup: 'command.ungroup',
};
export const ARRANGE_KEYS = {
  front: 'command.bringToFront',
  forward: 'command.bringForward',
  backward: 'command.sendBackward',
  back: 'command.sendToBack',
} as const;
export const ARRANGE_SHORTCUTS = {
  front: '',
  forward: 'Ctrl+]',
  backward: 'Ctrl+[',
  back: '',
} as const;

/** Entries for a right-click on the canvas: `layer` false means empty canvas. */
export function canvasMenuEntries(
  engine: EditorEngine,
  session: EditorSession,
  layer: boolean,
): MenuEntry[] {
  if (!layer)
    return hasClipboard()
      ? [
          {
            id: 'paste',
            label: t('command.paste'),
            run: () => performEdit(engine, session, 'paste'),
          },
        ]
      : [];
  const source = session.source;
  const available = contextActions(
    source,
    session.selectedIds,
    session.currentTime,
  ).filter((action) => action !== 'marker' && action !== 'delete-marker');
  const clips = selectedClips(source, session.selectedIds);
  const entries: MenuEntry[] = [];
  const edit = (action: EditAction) =>
    entries.push({
      id: action,
      label: t(LABEL_KEYS[action] ?? `command.${action}`),
      run: () => performEdit(engine, session, action),
    });
  for (const action of available) {
    if (action === 'speed')
      entries.push({
        id: 'speed',
        label: t('command.speed'),
        submenu: () => {
          const current = selectedClips(session.source, session.selectedIds)[0]
            ?.clip.speed;
          return SPEED_PRESETS.map((speed) => ({
            id: 'speed-preset',
            label: t('clip.speedValue', { speed: formatNumber(speed) }),
            role: 'menuitemradio' as const,
            checked: current === speed,
            data: { speed: String(speed) },
            run: () => setClipSpeed(engine, session, speed),
          }));
        },
      });
    else if (action === 'reverse' || action === 'freeze')
      entries.push({
        id: action,
        label: t(action === 'reverse' ? 'command.reverse' : 'command.freeze'),
        role: 'menuitemcheckbox',
        checked:
          clips.length > 0 &&
          clips.every(({ clip }) =>
            action === 'reverse'
              ? clipTimeEffects(clip).reversed
              : clipTimeEffects(clip).freezeFrame !== null,
          ),
        run: () => performEdit(engine, session, action),
      });
    else if (action !== 'ungroup') edit(action);
  }
  // Ungroup shows for groups even when it cannot run, with the reason.
  const selection = describeSelection(source, session.selectedIds);
  if (selection.every('group')) {
    const reason = ungroupBlocker(source, session.selectedIds);
    entries.push({
      id: 'ungroup',
      label: t('command.ungroup'),
      shortcut: 'Ctrl+Shift+G',
      ...(reason
        ? { reason }
        : { run: () => performEdit(engine, session, 'ungroup') }),
    });
  }
  entries.push(
    {
      id: 'arrange',
      label: t('command.arrange'),
      divider: true,
      submenu: () =>
        ARRANGE_ACTIONS.map((action) => ({
          id: `arrange-${action}`,
          label: t(ARRANGE_KEYS[action]),
          ...(ARRANGE_SHORTCUTS[action]
            ? { shortcut: ARRANGE_SHORTCUTS[action] }
            : {}),
          ...(canArrange(session, action)
            ? { run: () => arrangeSelection(engine, session, action) }
            : {}),
        })),
    },
    {
      id: 'align',
      label: t('command.align'),
      submenu: () => [
        ...ALIGN_EDGES.map((edge) => ({
          id: `align-${edge}`,
          label: t(`command.align${edge[0]!.toUpperCase()}${edge.slice(1)}`),
          run: () => alignSelection(engine, session, edge),
        })),
        ...(['horizontal', 'vertical'] as const).map((axis) => ({
          id: `distribute-${axis}`,
          label: t(
            `command.distribute${axis[0]!.toUpperCase()}${axis.slice(1)}`,
          ),
          divider: axis === 'horizontal',
          ...(canDistribute(session)
            ? { run: () => distributeSelection(engine, session, axis) }
            : {}),
        })),
        {
          id: 'align-to-canvas',
          label: t('command.alignToCanvas'),
          role: 'menuitemcheckbox' as const,
          checked: session.alignToCanvas,
          divider: true,
          toggle: () => session.setAlignToCanvas(!session.alignToCanvas),
        },
      ],
    },
    // SHP-015: two or more closed shapes combine into one.
    ...(canCombine(source, session.selectedIds)
      ? [
          {
            id: 'combine',
            label: t('command.combine'),
            submenu: () =>
              BOOLEAN_OPS.map((op) => ({
                id: `combine-${op}`,
                label: t(`command.${op}`),
                run: () => combineShapes(engine, session, op),
              })),
          },
        ]
      : []),
    {
      id: 'copy-style',
      label: t('command.copyStyle'),
      divider: true,
      ...(canCopyStyle(session) ? { run: () => copyStyle(session) } : {}),
    },
    {
      id: 'paste-style',
      label: t('command.pasteStyle'),
      ...(hasStyle() ? { run: () => pasteStyle(engine, session) } : {}),
    },
    // Lock and Hide are CV-024 and LYR-006, not built yet.
    {
      id: 'lock',
      label: t('command.lock'),
      divider: true,
      reason: t('library.later'),
    },
    { id: 'hide', label: t('command.hide'), reason: t('library.later') },
  );
  return entries;
}
