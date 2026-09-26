import type { EditorEngine } from '../core';
import type { EditorSession } from '../ui/session';
import {
  ALIGN_EDGES,
  alignSelection,
  canDistribute,
  distributeSelection,
} from '../ui/align';
import { locateLayer } from '../render/adapter';
import { ARRANGE_ACTIONS, arrangeSelection, canArrange } from '../ui/arrange';
import { describeSelection } from '../ui/selection-context';
import { ARRANGE_KEYS, ARRANGE_SHORTCUTS } from '../ui/canvas-menu';
import { jumpToKeyframe, runKeyframeAction } from '../ui/keyframe-edit';
import { keyframeTimes } from '../ui/keyframes';
import {
  canCopyStyle,
  copyStyle,
  hasStyle,
  pasteStyle,
} from '../ui/style-clipboard';
import {
  contextActions,
  jumpToCut,
  moveClipsToAdjacentTrack,
  nudgeClips,
  performEdit,
  selectedClips,
  setClipSpeed,
  stepClipSpeed,
  trimClipToPlayhead,
  type EditAction,
} from '../ui/editing';

export interface CommandContext {
  engine: EditorEngine;
  session: EditorSession;
  save?: () => void;
  openPalette?: () => void;
  newProject?: () => void;
  openShortcuts?: () => void;
  togglePlayback: () => void;
}
export interface RegisteredCommand {
  id: string;
  labelKey: string;
  shortcut: string;
  isEnabled: (context: CommandContext) => boolean;
  run: (context: CommandContext) => void;
  /** 'timeline': dispatched by the focused timeline, not the global listener; the
   * shortcut text is shown in the sheet and palette as the documented key. */
  scope?: 'timeline';
}
const hasClips = ({ session }: CommandContext) =>
  selectedClips(session.source, session.selectedIds).length > 0;
/** Speed, reverse and freeze apply to video and audio clips only (D-073). */
const hasTimedClips = ({ session }: CommandContext) =>
  describeSelection(session.source, session.selectedIds).every('time-effects');
const timeline = (
  id: string,
  labelKey: string,
  shortcut: string,
  run: (context: CommandContext) => void,
  isEnabled: (context: CommandContext) => boolean = hasClips,
): RegisteredCommand => ({
  id,
  labelKey,
  shortcut,
  scope: 'timeline',
  isEnabled,
  run,
});
/** ANI-004: with timeline keyframes selected, these edits act on them. */
const KEYFRAME_EDITS: Partial<
  Record<EditAction, 'copy' | 'paste' | 'duplicate' | 'delete'>
> = { copy: 'copy', paste: 'paste', duplicate: 'duplicate', delete: 'delete' };
const edit = (id: EditAction, shortcut: string): RegisteredCommand => ({
  id,
  labelKey: `command.${id}`,
  shortcut,
  isEnabled: ({ session }) =>
    (!!KEYFRAME_EDITS[id] && session.selectedKeyframes.length > 0) ||
    contextActions(
      session.source,
      session.selectedIds,
      session.currentTime,
    ).includes(id),
  run: ({ engine, session }) => {
    const keyframeAction = KEYFRAME_EDITS[id];
    if (keyframeAction && session.selectedKeyframes.length)
      runKeyframeAction(engine, session, keyframeAction);
    else performEdit(engine, session, id);
  },
});
export const commands: readonly RegisteredCommand[] = Object.freeze([
  {
    id: 'new-project',
    labelKey: 'project.new',
    shortcut: '',
    isEnabled: (context) => !!context.newProject,
    run: (context) => context.newProject?.(),
  },
  {
    id: 'palette',
    labelKey: 'palette.title',
    shortcut: 'Ctrl+K',
    isEnabled: (context) => !!context.openPalette,
    run: (context) => context.openPalette?.(),
  },
  {
    id: 'shortcuts',
    labelKey: 'shortcuts.title',
    shortcut: 'Ctrl+/',
    isEnabled: (context) => !!context.openShortcuts,
    run: (context) => context.openShortcuts?.(),
  },
  {
    id: 'undo',
    labelKey: 'command.undo',
    shortcut: 'Ctrl+Z',
    isEnabled: ({ engine }) => engine.canUndo,
    run: ({ engine }) => {
      engine.undo();
    },
  },
  {
    id: 'redo',
    labelKey: 'command.redo',
    shortcut: 'Ctrl+Shift+Z / Ctrl+Y',
    isEnabled: ({ engine }) => engine.canRedo,
    run: ({ engine }) => {
      engine.redo();
    },
  },
  {
    id: 'save',
    labelKey: 'action.save',
    shortcut: 'Ctrl+S',
    isEnabled: (context) => !!context.save,
    run: (context) => context.save?.(),
  },
  edit('duplicate', 'Ctrl+D'),
  edit('delete', 'Delete / Backspace'),
  edit('split', 'S'),
  edit('marker', 'M'),
  edit('group', 'Ctrl+G'),
  edit('ungroup', 'Ctrl+Shift+G'),
  // CV-026: layer order (palette, canvas Layer submenu).
  ...ARRANGE_ACTIONS.map((action): RegisteredCommand => ({
    id: `arrange-${action}`,
    labelKey: ARRANGE_KEYS[action],
    shortcut: ARRANGE_SHORTCUTS[action],
    isEnabled: ({ session }) => canArrange(session, action),
    run: ({ engine, session }) => arrangeSelection(engine, session, action),
  })),
  edit('toggle-enabled', ''),
  edit('cut', 'Ctrl+X'),
  edit('copy', 'Ctrl+C'),
  edit('paste', 'Ctrl+V'),
  edit('link', ''),
  edit('unlink', ''),
  edit('detach-audio', ''),
  edit('reverse', ''),
  edit('freeze', ''),
  // CV-025: align and distribute (palette, canvas Align submenu).
  ...ALIGN_EDGES.map((edge): RegisteredCommand => ({
    id: `align-${edge}`,
    labelKey: `command.align${edge[0]!.toUpperCase()}${edge.slice(1)}`,
    shortcut: '',
    isEnabled: ({ session }) => session.selectedIds.length > 0,
    run: ({ engine, session }) => alignSelection(engine, session, edge),
  })),
  ...(['horizontal', 'vertical'] as const).map((axis): RegisteredCommand => ({
    id: `distribute-${axis}`,
    labelKey: `command.distribute${axis[0]!.toUpperCase()}${axis.slice(1)}`,
    shortcut: '',
    isEnabled: ({ session }) => canDistribute(session),
    run: ({ engine, session }) => distributeSelection(engine, session, axis),
  })),
  // ANI-005: previous and next keyframe of the selected layer.
  ...([-1, 1] as const).map((direction): RegisteredCommand => ({
    id: direction < 0 ? 'keyframe-previous' : 'keyframe-next',
    labelKey:
      direction < 0 ? 'command.keyframePrevious' : 'command.keyframeNext',
    shortcut: direction < 0 ? ',' : '.',
    isEnabled: ({ session }) => {
      const layer = session.selectedId
        ? locateLayer(session.source.composition.layers, session.selectedId)
            ?.layer
        : undefined;
      return !!layer && keyframeTimes(layer).length > 0;
    },
    run: ({ session }) => {
      jumpToKeyframe(session, direction);
    },
  })),
  // CV-039: Copy style / Paste style (palette and canvas menu).
  {
    id: 'copy-style',
    labelKey: 'command.copyStyle',
    shortcut: '',
    isEnabled: ({ session }) => canCopyStyle(session),
    run: ({ session }) => copyStyle(session),
  },
  {
    id: 'paste-style',
    labelKey: 'command.pasteStyle',
    shortcut: '',
    isEnabled: ({ session }) => hasStyle() && session.selectedIds.length > 0,
    run: ({ engine, session }) => pasteStyle(engine, session),
  },
  {
    id: 'align-to-canvas',
    labelKey: 'command.alignToCanvas',
    shortcut: '',
    isEnabled: () => true,
    run: ({ session }) => session.setAlignToCanvas(!session.alignToCanvas),
  },
  {
    id: 'speed-slower',
    labelKey: 'command.speedSlower',
    shortcut: '',
    isEnabled: hasTimedClips,
    run: ({ engine, session }) => stepClipSpeed(engine, session, -1),
  },
  {
    id: 'speed-faster',
    labelKey: 'command.speedFaster',
    shortcut: '',
    isEnabled: hasTimedClips,
    run: ({ engine, session }) => stepClipSpeed(engine, session, 1),
  },
  {
    id: 'speed-normal',
    labelKey: 'command.speedNormal',
    shortcut: '',
    isEnabled: hasTimedClips,
    run: ({ engine, session }) => setClipSpeed(engine, session, 1),
  },
  timeline('clip-nudge-left', 'command.nudgeLeft', 'Alt+←', (c) =>
    nudgeClips(c.engine, c.session, -1),
  ),
  timeline('clip-nudge-right', 'command.nudgeRight', 'Alt+→', (c) =>
    nudgeClips(c.engine, c.session, 1),
  ),
  timeline('clip-track-up', 'command.clipTrackUp', 'Alt+↑', (c) =>
    moveClipsToAdjacentTrack(c.engine, c.session, -1),
  ),
  timeline('clip-track-down', 'command.clipTrackDown', 'Alt+↓', (c) =>
    moveClipsToAdjacentTrack(c.engine, c.session, 1),
  ),
  timeline('trim-start', 'command.trimStart', '[', (c) =>
    trimClipToPlayhead(c.engine, c.session, 'left'),
  ),
  timeline('trim-end', 'command.trimEnd', ']', (c) =>
    trimClipToPlayhead(c.engine, c.session, 'right'),
  ),
  timeline(
    'cut-previous',
    'command.cutPrevious',
    '↑',
    (c) => jumpToCut(c.session, -1),
    () => true,
  ),
  timeline(
    'cut-next',
    'command.cutNext',
    '↓',
    (c) => jumpToCut(c.session, 1),
    () => true,
  ),
  {
    id: 'select-all',
    labelKey: 'command.selectAll',
    shortcut: 'Ctrl+A',
    isEnabled: () => true,
    run: ({ session }) =>
      session.selectMany(
        session.source.composition.layers.map((layer) => layer.id),
      ),
  },
  {
    id: 'play',
    labelKey: 'command.play',
    shortcut: 'Space',
    isEnabled: () => true,
    run: (context) => context.togglePlayback(),
  },
]);
export function runCommand(id: string, context: CommandContext): boolean {
  const command = commands.find((item) => item.id === id);
  if (!command?.isEnabled(context)) return false;
  command.run(context);
  return true;
}
