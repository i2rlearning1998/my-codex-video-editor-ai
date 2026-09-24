import { test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { EditorEngine, deserializeProject, type Command } from '../src/core';
import { EditorSession } from '../src/ui/session';
import { commands, runCommand } from '../src/commands/registry';
import { clearClipboard, hasClipboard } from '../src/ui/editing';
import { hasStyle } from '../src/ui/style-clipboard';
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
    // Clip time/keyboard commands need a clip with room to act on: layer-b
    // (3..5 on Video 1) can move earlier; layer-c (alone on Video 2) can slow
    // down and move up. Other commands keep the first layer.
    const layerFor: Record<string, string> = {
      'speed-slower': 'layer-c',
      'speed-normal': 'layer-c',
      'clip-nudge-left': 'layer-b',
      'clip-track-up': 'layer-c',
    };
    clearClipboard();
    session.selectMany(
      ['group', 'link', 'unlink'].includes(command.id)
        ? ids.slice(0, 2)
        : command.id.startsWith('distribute-')
          ? ids
          : [layerFor[command.id] ?? ids[0]!],
    );
    session.setCurrentTime(1);
    if (command.id === 'marker') session.select(null);
    const context = {
      engine,
      session,
      save: vi.fn(),
      openPalette: vi.fn(),
      newProject: vi.fn(),
      openShortcuts: vi.fn(),
      togglePlayback: () => session.setPlaying(!session.playing),
    };
    if (command.id === 'undo' || command.id === 'redo')
      runCommand('duplicate', context);
    if (command.id === 'redo') engine.undo();
    if (command.id === 'speed-normal') runCommand('speed-faster', context);
    if (command.id === 'paste') runCommand('copy', context);
    if (command.id === 'unlink') runCommand('link', context);
    if (command.id === 'paste-style') {
      // Copy a half-opacity style from layer 2, undo that edit, paste on layer 1.
      session.select(ids[1]!);
      engine.commands.transaction('Setup', [
        {
          type: 'SET_PROPERTY',
          compositionId: engine.state.compositions[0]!.id,
          layerId: ids[1]!,
          target: { kind: 'transform', key: 'opacity' },
          property: {
            ...(JSON.parse(
              JSON.stringify(
                engine.state.compositions[0]!.layers[1]!.transform.opacity,
              ),
            ) as object),
            value: 0.5,
          },
        } as unknown as Command,
      ]);
      runCommand('copy-style', context);
      engine.undo();
      session.select(ids[0]!);
    }
    for (const locale of ['en', 'hi'] as const) {
      setLanguage(locale);
      expect(t(command.labelKey)).not.toBe(command.labelKey);
    }
    expect(command.isEnabled(context), command.id).toBe(true);
    expect(runCommand(command.id, context), command.id).toBe(true);
    if (command.id === 'new-project')
      expect(context.newProject).toHaveBeenCalledOnce();
    else if (command.id === 'palette')
      expect(context.openPalette).toHaveBeenCalledOnce();
    else if (command.id === 'shortcuts')
      expect(context.openShortcuts).toHaveBeenCalledOnce();
    else if (command.id === 'save') expect(context.save).toHaveBeenCalledOnce();
    else if (command.id === 'play') expect(session.playing).toBe(true);
    else if (command.id === 'select-all')
      expect(session.selectedIds).toEqual(ids);
    else if (command.id === 'undo') expect(engine.canRedo).toBe(true);
    else if (command.id === 'cut-previous') expect(session.currentTime).toBe(0);
    else if (command.id === 'copy') expect(hasClipboard()).toBe(true);
    else if (command.id === 'copy-style') expect(hasStyle()).toBe(true);
    else if (command.id === 'align-to-canvas')
      expect(session.alignToCanvas).toBe(true);
    else if (command.id === 'cut-next') expect(session.currentTime).toBe(2);
    else expect(engine.canUndo, command.id).toBe(true);
    session.dispose();
  }
  setLanguage('en');
});
