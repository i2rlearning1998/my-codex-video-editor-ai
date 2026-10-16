import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EditorEngine, deserializeProject } from '../../src/core';
import { MemoryMediaStore } from '../../src/media/store';
import { createThemeLibrary } from '../../src/themes/library';
import {
  BUILT_IN_THEMES,
  encodeTheme,
  isManualColor,
} from '../../src/themes/themes';
const setup = () => {
  const engine = new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/h1-rotated.json', 'utf8'),
    ),
  );
  const store = new MemoryMediaStore();
  return { engine, store, library: createThemeLibrary(store) };
};
const textLayer = (e: EditorEngine) => {
  const visit = (
    layers: (typeof e.state.compositions)[number]['layers'],
  ): (typeof layers)[number] | undefined => {
    for (const layer of layers) {
      if (layer.type === 'text') return layer;
      const child = visit(layer.children);
      if (child) return child;
    }
    return undefined;
  };
  return visit(e.state.compositions[0]!.layers)!;
};
describe('[QT-019] manual theme colours', () => {
  it('keeps manual edits, overrides and clears flags, never resurrects old colours; undo restores exact state', async () => {
    const { engine, library } = setup();
    await library.applyTheme(engine, 'dark-neon');
    engine.commands.execute({
      type: 'SET_PROPERTY',
      compositionId: engine.state.compositions[0]!.id,
      layerId: textLayer(engine).id,
      target: { kind: 'property', key: 'fill' },
      property: {
        type: 'color',
        value: '#ff0000',
        animated: false,
        keyframes: [],
        constraints: [],
      },
    });
    expect(isManualColor(textLayer(engine), 'fill')).toBe(true);
    const result = await library.applyTheme(engine, 'playful-pop');
    expect(result.keptManual).toBeGreaterThan(0);
    expect(textLayer(engine).properties.fill?.value).toBe('#ff0000');
    const before = JSON.stringify(engine.state);
    const steps = engine.history.undo.length;
    const overridden = await library.applyTheme(engine, 'playful-pop', {
      overrideManual: true,
    });
    expect(overridden.overridden).toBeGreaterThan(0);
    expect(isManualColor(textLayer(engine), 'fill')).toBe(false);
    expect(engine.history.undo).toHaveLength(steps + 1);
    engine.undo();
    expect(JSON.stringify(engine.state)).toBe(before);
    engine.redo();
    await library.applyTheme(engine, 'dark-neon');
    expect(textLayer(engine).properties.fill?.value).toBe('#f8fafc');
    await library.applyTheme(engine, 'playful-pop');
    expect(textLayer(engine).properties.fill?.value).toBe('#1e1b4b');
  });
});
describe('[QT-018] library-only themes', () => {
  it('save then undo is still once; delete then undo stays gone; captures actual colours', async () => {
    const { engine, store, library } = setup();
    await library.applyTheme(engine, 'dark-neon');
    const saved = await library.saveTheme('Mine', engine.state);
    expect(saved.palette.background).toBe('#0b0b1a');
    expect(saved.palette.text).toBe(textLayer(engine).properties.fill?.value);
    engine.undo();
    expect(
      (await library.listThemes()).filter((t) => t.id === saved.id),
    ).toHaveLength(1);
    engine.redo();
    await library.deleteTheme(saved.id);
    engine.undo();
    expect(await store.keys()).toEqual([]);
  });
  it('requires trimmed unique names and serializes simultaneous saves', async () => {
    const { engine, library } = setup();
    await expect(library.saveTheme('  ', engine.state)).rejects.toMatchObject({
      code: 'NAME_REQUIRED',
    });
    const results = await Promise.allSettled([
      library.saveTheme('Mine', engine.state),
      library.saveTheme(' mine ', engine.state),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    await expect(
      library.saveTheme('Clean Light', engine.state),
    ).rejects.toMatchObject({ code: 'NAME_TAKEN' });
    const second = await library.saveTheme('Second', engine.state);
    await expect(library.renameTheme(second.id, 'mine')).rejects.toMatchObject({
      code: 'NAME_TAKEN',
    });
    await expect(library.renameTheme(second.id, '')).rejects.toMatchObject({
      code: 'NAME_REQUIRED',
    });
  });
  it('save/rename/delete five times does not mutate engine or reenter listeners', async () => {
    const { engine, library } = setup();
    const before = JSON.stringify(engine.state);
    let notifications = 0;
    engine.on('state:changed', () => {
      notifications++;
    });
    for (let i = 0; i < 5; i++) {
      const saved = await library.saveTheme(`Theme ${i}`, engine.state);
      await library.renameTheme(saved.id, `Renamed ${i}`);
      await library.deleteTheme(saved.id);
    }
    expect(notifications).toBe(0);
    expect(engine.canUndo).toBe(false);
    expect(JSON.stringify(engine.state)).toBe(before);
  });
  it('migrates markers once, preserves newer library values, strips history copies', async () => {
    const { engine, store, library } = setup();
    const theme = { ...BUILT_IN_THEMES[0]!, id: 'old-theme', name: 'Legacy' };
    engine.commands.execute({
      type: 'ADD_MARKER',
      compositionId: engine.state.compositions[0]!.id,
      marker: { id: 'legacy', time: 0, label: encodeTheme(theme) },
    });
    expect(await library.migrateThemes(engine)).toBe(1);
    await library.renameTheme(theme.id, 'New name');
    engine.undo();
    engine.redo();
    expect(
      engine.state.compositions[0]!.markers.some((m) =>
        m.label.startsWith('aive:theme '),
      ),
    ).toBe(false);
    expect(await library.migrateThemes(engine)).toBe(0);
    expect(await store.keys()).toEqual(['theme/old-theme']);
    expect(
      (await library.listThemes()).find((t) => t.id === theme.id)?.name,
    ).toBe('New name');
  });
});
