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
import { CANVAS_PRESETS } from './canvas-size';
import {
  canSetBackground,
  resizeCanvasToSelection,
  selectionLocked,
  setAsBackground,
  setLocked,
} from './layer-actions';

/** H3: what the canvas menu reaches outside the Command Bus. */
export interface CanvasMenuHooks {
  /** Shows the selected element's clip on the timeline. */
  readonly showTiming?: () => void;
  /** Opens the Alternative text editor. */
  readonly altText?: () => void;
  /** Saves the selection as a PNG. */
  readonly download?: () => void;
  /** Shows the element's details. */
  readonly info?: () => void;
  /** A new canvas size for every scene (with Undo in a toast). */
  readonly canvasSize?: (width: number, height: number) => void;
  /** Opens the toolbar's canvas size popover (Custom). */
  readonly customSize?: () => void;
  /** Adds a blank scene, or a copy of this one, after it. */
  readonly addScene?: (copy: boolean) => void;
  /** Deletes this scene (not the last). */
  readonly deleteScene?: () => void;
  /** I2: saves this scene to My Templates (in this browser). */
  readonly saveAsTemplate?: () => void;
}
const planned = (wave: number | string, id: string) =>
  t('toolbar.later', { wave: String(wave), id });

const ICONS: Partial<Record<EditAction, string>> = {
  split: 'split',
  duplicate: 'duplicate',
  delete: 'delete',
  cut: 'cut',
  copy: 'copy',
  paste: 'paste',
  'detach-audio': 'audioFile',
  group: 'group',
  ungroup: 'ungroup',
  speed: 'speed',
  reverse: 'reverse',
  freeze: 'freeze',
};
const SHORTCUTS: Partial<Record<EditAction, string>> = {
  split: 'S',
  duplicate: 'Ctrl+D',
  delete: 'Delete',
  cut: 'Ctrl+X',
  copy: 'Ctrl+C',
  paste: 'Ctrl+V',
  group: 'Ctrl+G',
};

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

/**
 * G1.3 (CV-043): actions about the clip on the timeline, not the object on
 * the canvas. They stay in the timeline's clip menu.
 */
const TIMELINE_ONLY: ReadonlySet<EditAction> = new Set([
  'marker',
  'delete-marker',
  'toggle-enabled',
  'link',
  'unlink',
]);

/** Entries for a right-click on the canvas: `layer` false means empty canvas. */
export function canvasMenuEntries(
  engine: EditorEngine,
  session: EditorSession,
  layer: boolean,
  hooks: CanvasMenuHooks = {},
): MenuEntry[] {
  if (!layer) return sceneMenuEntries(engine, session, hooks);
  const source = session.source;
  const available = contextActions(
    source,
    session.selectedIds,
    session.currentTime,
  ).filter((action) => !TIMELINE_ONLY.has(action));
  const clips = selectedClips(source, session.selectedIds);
  const entries: MenuEntry[] = [];
  const edit = (action: EditAction) =>
    entries.push({
      id: action,
      label: t(LABEL_KEYS[action] ?? `command.${action}`),
      ...(ICONS[action] ? { icon: ICONS[action] } : {}),
      ...(SHORTCUTS[action] ? { shortcut: SHORTCUTS[action] } : {}),
      run: () => performEdit(engine, session, action),
    });
  for (const action of available) {
    if (action === 'speed')
      entries.push({
        id: 'speed',
        label: t('command.speed'),
        icon: 'speed',
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
        icon: action,
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
      icon: 'ungroup',
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
      icon: 'layers',
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
      icon: 'alignLeft',
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
            icon: 'combine',
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
      icon: 'brush',
      shortcut: 'Ctrl+Alt+C',
      divider: true,
      ...(canCopyStyle(session) ? { run: () => copyStyle(session) } : {}),
    },
    {
      id: 'paste-style',
      label: t('command.pasteStyle'),
      icon: 'paste',
      shortcut: 'Ctrl+Alt+V',
      ...(hasStyle() ? { run: () => pasteStyle(engine, session) } : {}),
    },
  );
  // H3 (CV-051): Lock; Hide stays planned (LYR-006).
  const locked = selectionLocked(session);
  entries.push(
    {
      id: locked ? 'unlock' : 'lock',
      label: t(locked ? 'command.unlock' : 'command.lock'),
      icon: locked ? 'unlock' : 'lock',
      divider: true,
      run: () => setLocked(engine, session, !locked),
    },
    {
      id: 'hide',
      label: t('command.hide'),
      icon: 'eyeOff',
      reason: planned(2, 'LYR-006'),
    },
  );
  const one = session.selectedIds.length === 1;
  if (one && hooks.showTiming)
    entries.push({
      id: 'show-timing',
      label: t('command.showTiming'),
      icon: 'timing',
      run: hooks.showTiming,
    });
  if (one && hooks.altText)
    entries.push({
      id: 'alt-text',
      label: t('command.altText'),
      icon: 'text',
      run: hooks.altText,
    });
  if (canSetBackground(session))
    entries.push({
      id: 'set-background',
      label: t('command.setBackground'),
      icon: 'image',
      run: () => setAsBackground(engine, session),
    });
  entries.push({
    id: 'resize-to-selection',
    label: t('command.resizeToSelection'),
    icon: 'crop',
    run: () => resizeCanvasToSelection(engine, session),
  });
  if (hooks.download)
    entries.push({
      id: 'download-selection',
      label: t('command.downloadSelection'),
      icon: 'download',
      divider: true,
      run: hooks.download,
    });
  if (one && hooks.info)
    entries.push({
      id: 'info',
      label: t('command.info'),
      icon: 'info',
      run: hooks.info,
    });
  entries.push({
    id: 'comment',
    label: t('command.comment'),
    icon: 'comment',
    reason: planned(8, 'ADV-008'),
  });
  return entries;
}

/** H3: a right-click on the empty canvas: paste, scenes, size and guides. */
function sceneMenuEntries(
  engine: EditorEngine,
  session: EditorSession,
  hooks: CanvasMenuHooks,
): MenuEntry[] {
  const { width, height } = session.source.composition;
  const scenes = engine.state.compositions.length;
  return [
    {
      id: 'paste',
      label: t('command.paste'),
      icon: 'paste',
      shortcut: 'Ctrl+V',
      ...(hasClipboard()
        ? { run: () => performEdit(engine, session, 'paste') }
        : {}),
    },
    ...(hooks.addScene
      ? [
          {
            id: 'add-scene',
            label: t('command.addScene'),
            icon: 'plus',
            divider: true,
            run: () => hooks.addScene!(false),
          },
          {
            id: 'duplicate-scene',
            label: t('command.duplicateScene'),
            icon: 'duplicate',
            run: () => hooks.addScene!(true),
          },
        ]
      : []),
    ...(hooks.deleteScene
      ? [
          {
            id: 'delete-scene',
            label: t('command.deleteScene'),
            icon: 'delete',
            ...(scenes > 1
              ? { run: hooks.deleteScene }
              : { reason: t('scenes.lastScene') }),
          },
        ]
      : []),
    ...(hooks.saveAsTemplate
      ? [
          {
            id: 'save-as-template',
            label: t('myTemplates.save'),
            icon: 'templates',
            run: hooks.saveAsTemplate,
          },
        ]
      : []),
    ...(hooks.canvasSize
      ? [
          {
            id: 'canvas-size',
            label: t('canvasSize.title'),
            icon: 'crop',
            divider: true,
            submenu: () => [
              ...CANVAS_PRESETS.map((preset) => ({
                id: 'canvas-size-preset',
                label: `${preset.ratio}  ${t(`canvasSize.${preset.id}`)}`,
                role: 'menuitemradio' as const,
                checked: preset.width === width && preset.height === height,
                data: { preset: preset.id },
                run: () => hooks.canvasSize!(preset.width, preset.height),
              })),
              ...(hooks.customSize
                ? [
                    {
                      id: 'canvas-size-custom',
                      label: t('canvasSize.customMenu'),
                      divider: true,
                      run: hooks.customSize,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    {
      id: 'guides',
      label: t('command.guides'),
      icon: 'layers',
      submenu: () => [
        {
          id: 'guides-off',
          label: t('guides.off'),
          role: 'menuitemradio' as const,
          checked: true,
          run: () => undefined,
        },
        {
          id: 'guides-grid',
          label: t('guides.grid'),
          reason: planned(2, 'CV-014'),
        },
        {
          id: 'guides-rulers',
          label: t('guides.rulers'),
          reason: planned(2, 'CV-014'),
        },
        {
          id: 'guides-safe',
          label: t('guides.safe'),
          reason: planned(2, 'CV-015'),
        },
      ],
    },
  ];
}
