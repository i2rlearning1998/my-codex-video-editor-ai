import { test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EditorEngine, deserializeProject } from '../src/core';
import { EditorSession } from '../src/ui/session';
import { commands, runCommand } from '../src/commands/registry';
import { t, setLanguage } from '../src/i18n';
test('[KEY-001] every registered action has translated labels, enablement and an executable handler', () => {
  expect(new Set(commands.map((command) => command.id)).size).toBe(
    commands.length,
  );
  for (const command of commands) {
    const engine = new EditorEngine(
      deserializeProject(
        readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
      ),
    );
    const session = new EditorSession(engine);
    const ids = engine.state.compositions[0]!.layers.map((layer) => layer.id);
    session.selectMany(
      command.id === 'group' ? ids.slice(0, 2) : ids.slice(0, 1),
    );
    session.setCurrentTime(1);
    if (command.id === 'marker') session.select(null);
    const context = {
      engine,
      session,
      save: vi.fn(),
      openPalette: vi.fn(),
      openShortcuts: vi.fn(),
      togglePlayback: () => session.setPlaying(!session.playing),
    };
    if (command.id === 'undo' || command.id === 'redo')
      runCommand('duplicate', context);
    if (command.id === 'redo') engine.undo();
    for (const locale of ['en', 'hi'] as const) {
      setLanguage(locale);
      expect(t(command.labelKey)).not.toBe(command.labelKey);
    }
    expect(command.isEnabled(context), command.id).toBe(true);
    expect(runCommand(command.id, context), command.id).toBe(true);
    if (command.id === 'palette')
      expect(context.openPalette).toHaveBeenCalledOnce();
    else if (command.id === 'shortcuts')
      expect(context.openShortcuts).toHaveBeenCalledOnce();
    else if (command.id === 'save') expect(context.save).toHaveBeenCalledOnce();
    else if (command.id === 'play') expect(session.playing).toBe(true);
    else if (command.id === 'select-all')
      expect(session.selectedIds).toEqual(ids);
    else if (command.id === 'undo') expect(engine.canRedo).toBe(true);
    else expect(engine.canUndo, command.id).toBe(true);
    session.dispose();
  }
  setLanguage('en');
});
