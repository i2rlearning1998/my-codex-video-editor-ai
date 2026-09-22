import type { EditorEngine } from '../core';
import type { EditorSession } from '../ui/session';
import { contextActions, performEdit, type EditAction } from '../ui/editing';

export interface CommandContext {
  engine: EditorEngine;
  session: EditorSession;
  save?: () => void;
  openPalette?: () => void;
  openShortcuts?: () => void;
  togglePlayback: () => void;
}
export interface RegisteredCommand {
  id: string;
  labelKey: string;
  shortcut: string;
  isEnabled: (context: CommandContext) => boolean;
  run: (context: CommandContext) => void;
}
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
