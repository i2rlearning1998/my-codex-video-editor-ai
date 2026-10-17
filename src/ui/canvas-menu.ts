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
import { SAVE_KINDS, type MineKind } from './my-library';
import { selectionRoots } from './selection-context';

/** H3: what the canvas menu reaches outside the Command Bus. */
export interface CanvasMenuHooks {
  /** Shows the selected element's clip on the timeline. */
  readonly showTiming?: () => void;
  /** Opens the Alternative text editor. */
  readonly altText?: () => void;
  /** J6: Resize canvas to selection, after a confirmation. */
  readonly resizeToSelection?: () => void;
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
  readonly saveSceneToMine?: () => void;
  /** R5: saves the selection to My Templates as one item of a kind. */
  readonly saveToMine?: (kind: MineKind) => void;
  /** P1: a code layer's own actions. */
  readonly code?: {
    readonly edit: (layerId: string) => void;
    readonly settings: (layerId: string) => void;
    readonly rerender: (layerId: string) => void;
    readonly editDuration: () => void;
    readonly exportCode: (layerId: string) => void;
    readonly duplicateCopy: (layerId: string) => void;
  };
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
  ).filter(
    (action) =>
      !TIMELINE_ONLY.has(action) &&
      !(action === 'detach-audio' && isCodeSelection(session)),
  );
  const clips = selectedClips(source, session.selectedIds);
  // S1 Part 4: at most about 14 top-level rows. The everyday edits stay on
  // top; the rest is grouped into submenus (Code animation, Clip, Arrange,
  // Align, Style, Save to My Templates, More). The commands are unchanged.
  const entries: MenuEntry[] = [];
  const selection0 = describeSelection(source, session.selectedIds);
  const codeLayer =
    selection0.items.length === 1 && selection0.items[0]!.layer.code
      ? selection0.items[0]!.id
      : null;
  const edit = (action: EditAction): MenuEntry => ({
    id: action,
    label: t(LABEL_KEYS[action] ?? `command.${action}`),
    ...(ICONS[action] ? { icon: ICONS[action] } : {}),
    ...(SHORTCUTS[action] ? { shortcut: SHORTCUTS[action] } : {}),
    run: () => performEdit(engine, session, action),
  });
  const check = (action: 'reverse' | 'freeze'): MenuEntry => ({
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
  const TOP: readonly EditAction[] = [
    'duplicate',
    'copy',
    'paste',
    'delete',
    'split',
  ];
  for (const action of TOP)
    if (available.includes(action)) entries.push(edit(action));
  if (available.includes('freeze')) entries.push(check('freeze'));
  if (available.includes('group')) entries.push(edit('group'));
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
  // P1: a code layer's own actions, in one submenu.
  if (codeLayer && hooks.code) {
    const code = hooks.code;
    entries.push({
      id: 'code-menu',
      label: t('menu.codeAnimation'),
      icon: 'code',
      divider: true,
      submenu: () => [
        {
          id: 'code-edit',
          label: t('command.codeEdit'),
          icon: 'code',
          run: () => code.edit(codeLayer),
        },
        {
          id: 'code-settings',
          label: t('command.codeSettings'),
          icon: 'adjust',
          run: () => code.settings(codeLayer),
        },
        {
          id: 'code-rerender',
          label: t('command.codeRerender'),
          icon: 'replace',
          run: () => code.rerender(codeLayer),
        },
        {
          id: 'edit-duration',
          label: t('command.editDuration'),
          icon: 'timing',
          run: () => code.editDuration(),
        },
        {
          id: 'code-export',
          label: t('command.codeExport'),
          icon: 'download',
          run: () => code.exportCode(codeLayer),
        },
        {
          id: 'code-duplicate',
          label: t('command.codeDuplicate'),
          icon: 'duplicate',
          run: () => code.duplicateCopy(codeLayer),
        },
      ],
    });
  }
  // The clip's own actions (Cut, Speed, Reverse, Detach audio, ...).
  const clipEntries: MenuEntry[] = [];
  for (const action of available) {
    if (TOP.includes(action) || ['freeze', 'group', 'ungroup'].includes(action))
      continue;
    if (action === 'speed')
      clipEntries.push({
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
    else if (action === 'reverse') clipEntries.push(check('reverse'));
    else clipEntries.push(edit(action));
  }
  if (clipEntries.length)
    entries.push({
      id: 'clip-menu',
      label: t('menu.clip'),
      icon: 'scissors',
      ...(codeLayer ? {} : { divider: true }),
      submenu: () => clipEntries,
    });
  entries.push(
    {
      id: 'arrange',
      label: t('command.arrange'),
      icon: 'layers',
      ...(clipEntries.length || codeLayer ? {} : { divider: true }),
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
      id: 'style-menu',
      label: t('menu.style'),
      icon: 'brush',
      submenu: () => [
        {
          id: 'copy-style',
          label: t('command.copyStyle'),
          icon: 'brush',
          shortcut: 'Ctrl+Alt+C',
          ...(canCopyStyle(session) ? { run: () => copyStyle(session) } : {}),
        },
        {
          id: 'paste-style',
          label: t('command.pasteStyle'),
          icon: 'paste',
          shortcut: 'Ctrl+Alt+V',
          ...(hasStyle() ? { run: () => pasteStyle(engine, session) } : {}),
        },
      ],
    },
  );
  // H3 (CV-051): Lock.
  const locked = selectionLocked(session);
  entries.push({
    id: locked ? 'unlock' : 'lock',
    label: t(locked ? 'command.unlock' : 'command.lock'),
    icon: locked ? 'unlock' : 'lock',
    divider: true,
    run: () => setLocked(engine, session, !locked),
  });
  // R5: Save to My Templates. S1: every kind that fits the selection.
  if (hooks.saveToMine) {
    const save = hooks.saveToMine;
    const roots = selectionRoots(session.source, session.selectedIds);
    const kinds: MineKind[] =
      roots.length > 1
        ? ['group', 'scene']
        : [
            ...SAVE_KINDS,
            ...(roots[0]?.type === 'group' ? (['group'] as const) : []),
            'scene',
          ];
    entries.push({
      id: 'save-to-mine',
      label: t('mine.save'),
      icon: 'folder',
      submenu: () =>
        kinds.map((kind) => ({
          id: `save-to-mine-${kind}`,
          label: t(`mine.kind.${kind}`),
          run: () => save(kind),
        })),
    });
  }
  // Everything else, in More.
  const one = session.selectedIds.length === 1;
  const more: MenuEntry[] = [
    {
      id: 'hide',
      label: t('command.hide'),
      icon: 'eyeOff',
      reason: planned(2, 'LYR-006'),
    },
  ];
  if (one && hooks.showTiming)
    more.push({
      id: 'show-timing',
      label: t('command.showTiming'),
      icon: 'timing',
      run: hooks.showTiming,
    });
  if (one && hooks.altText)
    more.push({
      id: 'alt-text',
      label: t('command.altText'),
      icon: 'text',
      run: hooks.altText,
    });
  if (canSetBackground(session) && !codeLayer)
    more.push({
      id: 'set-background',
      label: t('command.setBackground'),
      icon: 'image',
      run: () => setAsBackground(engine, session),
    });
  more.push({
    id: 'resize-to-selection',
    label: t('command.resizeToSelection'),
    icon: 'crop',
    run: () =>
      hooks.resizeToSelection
        ? hooks.resizeToSelection()
        : resizeCanvasToSelection(engine, session),
  });
  if (hooks.download)
    more.push({
      id: 'download-selection',
      label: t('command.downloadSelection'),
      icon: 'download',
      divider: true,
      run: hooks.download,
    });
  if (one && hooks.info)
    more.push({
      id: 'info',
      label: t('command.info'),
      icon: 'info',
      run: hooks.info,
    });
  more.push({
    id: 'comment',
    label: t('command.comment'),
    icon: 'comment',
    reason: planned(8, 'ADV-008'),
  });
  entries.push({
    id: 'more-menu',
    label: t('menu.more'),
    icon: 'more',
    submenu: () => more,
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
    ...(hooks.saveSceneToMine
      ? [
          {
            id: 'save-scene-to-mine',
            label: t('mine.saveScene'),
            icon: 'templates',
            run: hooks.saveSceneToMine,
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

/** P1: the selection is one code layer. */
function isCodeSelection(session: EditorSession): boolean {
  const items = describeSelection(session.source, session.selectedIds).items;
  return items.length === 1 && !!items[0]!.layer.code;
}
