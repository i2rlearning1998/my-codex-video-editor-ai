import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EditorEngine,
  createComposition,
  deserializeProject,
} from '../src/core';
import { EditorSession } from '../src/ui/session';
import { sceneLengthCommands } from '../src/ui/scene-length';

const nle = () =>
  new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/nle-example.json', 'utf8'),
    ),
  );

describe('[CV-048] scene commands and scene length (G3, G5)', () => {
  it('sets the project background and a scene name as undoable commands', () => {
    const engine = nle();
    const id = engine.state.compositions[0]!.id;
    engine.commands.transaction('Set background', [
      { type: 'SET_PROJECT_BACKGROUND', color: '#223344' },
    ]);
    engine.commands.transaction('Rename scene', [
      { type: 'SET_COMPOSITION', compositionId: id, name: 'Intro' },
    ]);
    expect(engine.state.settings.backgroundColor).toBe('#223344');
    expect(engine.state.compositions[0]!.name).toBe('Intro');
    engine.undo();
    engine.undo();
    expect(engine.state.settings.backgroundColor).toBe('#f0eee7');
    expect(() =>
      engine.commands.transaction('Bad', [
        { type: 'SET_PROJECT_BACKGROUND', color: 'red' } as never,
      ]),
    ).toThrow();
  });
  it('moves and deletes scenes, and keeps at least one', () => {
    const engine = nle();
    const first = engine.state.compositions[0]!.id;
    const second = createComposition({ id: 'scene-2', name: 'Two' });
    engine.commands.transaction('Add scene', [
      { type: 'CREATE_COMPOSITION', composition: second },
    ]);
    engine.commands.transaction('Move scene', [
      { type: 'MOVE_COMPOSITION', compositionId: 'scene-2', index: 0 },
    ]);
    expect(engine.state.compositions.map((item) => item.id)).toEqual([
      'scene-2',
      first,
    ]);
    expect(() =>
      engine.commands.transaction('Move scene', [
        { type: 'MOVE_COMPOSITION', compositionId: 'scene-2', index: 2 },
      ]),
    ).toThrow(/out of range/);
    engine.commands.transaction('Delete scene', [
      { type: 'DELETE_COMPOSITION', compositionId: 'scene-2' },
    ]);
    expect(() =>
      engine.commands.transaction('Delete scene', [
        { type: 'DELETE_COMPOSITION', compositionId: first },
      ]),
    ).toThrow(/at least one scene/);
  });
  it('lengthens a scene by extending the clips that end with it, within their media', () => {
    // Clips: a 0-2 s, b 3-5 s (video source 1-3 of 6 s), c 1-4 s.
    const engine = nle();
    const session = new EditorSession(engine);
    const commands = sceneLengthCommands(session.source, 7);
    expect(commands).toHaveLength(1);
    engine.commands.transaction('Set scene length', commands);
    expect(engine.state.compositions[0]!.duration).toBeCloseTo(7, 9);
    // The media only has 3 s left after clip b's source out: at most 8 s.
    const capped = sceneLengthCommands(session.source, 20);
    engine.commands.transaction('Set scene length', capped);
    expect(engine.state.compositions[0]!.duration).toBeCloseTo(8, 9);
    session.dispose();
  });
  it('shortens a scene by trimming clips past the new end, and refuses to cut one away', () => {
    const engine = nle();
    const session = new EditorSession(engine);
    engine.commands.transaction(
      'Set scene length',
      sceneLengthCommands(session.source, 3.5),
    );
    expect(engine.state.compositions[0]!.duration).toBeCloseTo(3.5, 9);
    expect(() => sceneLengthCommands(session.source, 2)).toThrow(/starts at 3/);
    expect(() => sceneLengthCommands(session.source, 0)).toThrow(RangeError);
    expect(sceneLengthCommands(session.source, 3.5)).toEqual([]);
    session.dispose();
  });
});
