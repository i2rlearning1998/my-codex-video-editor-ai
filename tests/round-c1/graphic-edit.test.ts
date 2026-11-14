// RDC1-034: "change this graphic" / "make a new one here": a model's new or
// rewritten graphic is checked (one repair), becomes ONE proposal (one undo
// step), keeps the person's controller values, and a failure is refused.
import { describe, expect, it } from 'vitest';
import { EditorEngine, createProject } from '../../src/core';
import { defaultConfig, platformConfigSchema } from '../../src/platform-config';
import { GRAPHIC_ASK, graphicEdit } from '../../src/ai-mode/graphic-edit';
import { BAR_RISE } from './v4-fixtures';

const c = platformConfigSchema.parse(defaultConfig());
const fresh = () => {
  const engine = new EditorEngine(createProject('Test'));
  return engine;
};
const answer = (source: string) =>
  JSON.stringify({
    def: { id: 'bar-rise', tier: 'B', source, summary: 'Bars.' },
  });
describe('[RDC1-034] graphics in AI mode', () => {
  it('[RDC1-034] the asks are recognised in English and Hindi', () => {
    for (const t of [
      'make a new graphic here',
      'Redraw this',
      "change this graphic's look",
      'यहाँ नया ग्राफ़िक बनाओ',
    ])
      expect(GRAPHIC_ASK.test(t), t).toBe(true);
    for (const t of ['make it faster', 'blue please', 'remove it'])
      expect(GRAPHIC_ASK.test(t), t).toBe(false);
  });
  it('[RDC1-034] a new graphic is one transaction (one undo step); undo then redo bring it back', async () => {
    const engine = fresh();
    const scene = engine.state.compositions[0]!;
    const asks: string[] = [];
    const r = await graphicEdit({
      config: c,
      scene: scene as never,
      layer: null,
      text: 'make a new graphic here',
      time: 0,
      ask: async (_s, u) => (
        asks.push(u),
        asks.length === 1 ? 'not json' : answer(BAR_RISE)
      ),
      ids: { layer: 'g1', clip: 'c1', track: 't1' },
    });
    expect(r.ok).toBe(true);
    expect(asks).toHaveLength(2); // one repair
    if (!r.ok) return;
    const before = engine.history.undo.length;
    engine.commands.transaction(r.label, [...r.commands]);
    expect(engine.history.undo.length).toBe(before + 1);
    expect(
      engine.state.compositions[0]!.layers.find((l) => l.id === 'g1')!.code!
        .tier,
    ).toBe('B');
    engine.undo();
    expect(
      engine.state.compositions[0]!.layers.some((l) => l.id === 'g1'),
    ).toBe(false);
    engine.redo();
    expect(
      engine.state.compositions[0]!.layers.some((l) => l.id === 'g1'),
    ).toBe(true);
  });
  it('[RDC1-034] changing a graphic keeps the controller values the person set (same controllers)', async () => {
    const engine = fresh();
    const made = await graphicEdit({
      config: c,
      scene: engine.state.compositions[0] as never,
      layer: null,
      text: 'new graphic',
      time: 0,
      ask: async () => answer(BAR_RISE),
      ids: { layer: 'g1', clip: 'c1', track: 't1' },
    });
    if (!made.ok) throw new Error('not made');
    engine.commands.transaction(made.label, [...made.commands]);
    const layer = engine.state.compositions[0]!.layers.find(
      (l) => l.id === 'g1',
    )!;
    const edited = JSON.parse(JSON.stringify(layer)) as {
      code: { params: Record<string, unknown> };
    };
    edited.code.params.bars = 9;
    const changed = await graphicEdit({
      config: c,
      scene: engine.state.compositions[0] as never,
      layer: edited as never,
      text: "change this graphic's look to wider bars",
      time: 0,
      ask: async () => answer(BAR_RISE.replace('w * 0.8', 'w * 0.95')),
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    const cmd = changed.commands[0] as unknown as {
      type: string;
      code: { params: Record<string, unknown>; source: string };
    };
    expect(cmd.type).toBe('SET_LAYER_CODE');
    expect(cmd.code.params.bars).toBe(9);
    expect(cmd.code.source).toContain('w * 0.95');
  });
  it('[RDC1-034] a graphic that keeps failing the checks is refused', async () => {
    const r = await graphicEdit({
      config: c,
      scene: fresh().state.compositions[0] as never,
      layer: null,
      text: 'new graphic',
      time: 0,
      ask: async () => answer('({ id: "bar-rise", render() { fetch("x") } })'),
    });
    expect(r.ok).toBe(false);
  });
});
