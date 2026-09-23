import type { EditorEngine } from '../core';
import type { EditorSession } from '../ui/session';
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
const edit = (id: EditAction, shortcut: string): RegisteredCommand => ({
  id,
  labelKey: `command.${id}`,
  shortcut,
  isEnabled: ({ session }) =>
    contextActions(
      session.source,
      session.selectedIds,
      session.currentTime,
    ).includes(id),
  run: ({ engine, session }) => performEdit(engine, session, id),
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
  edit('toggle-enabled', ''),
  edit('cut', 'Ctrl+X'),
  edit('copy', 'Ctrl+C'),
  edit('paste', 'Ctrl+V'),
  edit('link', ''),
  edit('unlink', ''),
  edit('detach-audio', ''),
  edit('reverse', ''),
  edit('freeze', ''),
  {
    id: 'speed-slower',
    labelKey: 'command.speedSlower',
    shortcut: '',
    isEnabled: hasClips,
    run: ({ engine, session }) => stepClipSpeed(engine, session, -1),
  },
  {
    id: 'speed-faster',
    labelKey: 'command.speedFaster',
    shortcut: '',
    isEnabled: hasClips,
    run: ({ engine, session }) => stepClipSpeed(engine, session, 1),
  },
  {
    id: 'speed-normal',
    labelKey: 'command.speedNormal',
    shortcut: '',
    isEnabled: hasClips,
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
