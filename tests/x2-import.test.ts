import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createProject, EditorEngine } from '../src/core';
import { classifyCode } from '../src/code-layer/classify';
import { FakeRuntime } from '../src/code-layer/fake-runtime';
import { tierACommands } from '../src/code-layer/tier-a';

const read = (path: string) => readFileSync(path, 'utf8');
const spec = (name: string) => read(`tests/ai-spec/fixtures/${name}.spec.json`);

describe('X2 classification', () => {
  it('[CODE-004] A, then B, then C, else plain errors with a line', async () => {
    const runtime = new FakeRuntime();
    const a = await classifyCode(spec('lower-third'), runtime);
    expect(a.tier).toBe('A');
    if (a.tier === 'A') expect(a.scenes).toBe(1);
    const b = await classifyCode(
      read('tests/fixtures/code/pulse-block.js'),
      runtime,
    );
    expect(b.tier).toBe('B');
    if (b.tier === 'B') {
      expect(b.meta.duration).toBe(2);
      expect(b.meta.params.map((p) => p.name)).toEqual(['color', 'radius']);
    }
    const c = await classifyCode(
      read('tests/fixtures/code/orbit-free.js'),
      runtime,
    );
    expect(c.tier).toBe('C');
    if (c.tier === 'C') expect(c.meta.seekable).toBe(false);
    // Free code without a runtime is explained, not run.
    const none = await classifyCode(
      read('tests/fixtures/code/orbit-free.js'),
      null,
    );
    expect(none.tier).toBeNull();
    if (none.tier === null)
      expect(none.issues[0]!.what).toMatch(/runtime is not available/);
    // Broken JSON names its line.
    const json = await classifyCode(
      '{\n  "version": 1,\n  "id": oops\n}',
      runtime,
    );
    expect(json.tier).toBeNull();
    if (json.tier === null) {
      expect(json.issues[0]!.line).toBe(3);
      expect(json.issues[0]!.what).toMatch(/JSON is not valid/);
      expect(json.issues[0]!.fix).toBeTruthy();
    }
    // A spec error names the path and the line of its key.
    const bad = JSON.parse(spec('lower-third'));
    bad.canvas.fps = 7;
    const invalid = await classifyCode(JSON.stringify(bad, null, 2), runtime);
    expect(invalid.tier).toBeNull();
    if (invalid.tier === null) {
      expect(invalid.issues[0]!.what).toMatch(/\/canvas\/fps/);
      expect(invalid.issues[0]!.line).toBeGreaterThan(1);
    }
    // Free code that throws reports the error.
    const thrown = await classifyCode(
      'export default {\n meta: {id: "x", duration: 500},\n renderFrame() {} }',
      runtime,
    );
    expect(thrown.tier).toBeNull();
    if (thrown.tier === null)
      expect(thrown.issues[0]!.what).toMatch(/between 0 and 120/);
    // 1 MB and empty sources are refused.
    const big = await classifyCode('x'.repeat(1_048_577), runtime);
    expect(big.tier === null && big.issues[0]!.what).toMatch(
      /larger than 1 MB/,
    );
    const empty = await classifyCode('  ', runtime);
    expect(empty.tier === null && empty.issues[0]!.what).toMatch(/no code/);
    // An .html file's inline script is the code.
    const html = await classifyCode(
      `<!doctype html><script>${read('tests/fixtures/code/orbit-free.js')}</script>`,
      runtime,
      'orbit.html',
    );
    expect(html.tier).toBe('C');
  });
});

describe('X2 Tier A through the Command Bus', () => {
  it('[CODE-004] a spec becomes new scenes after the open one in one undo step, repeatable', async () => {
    const engine = new EditorEngine(createProject('A'));
    const raw = JSON.parse(spec('lower-third'));
    const result = await tierACommands(raw, {
      project: engine.state,
      current: engine.state.compositions[0]!,
      mode: 'new',
      suffix: 'one',
    });
    expect(result.notBuilt).toEqual([]);
    engine.commands.transaction('Import code animation', result.commands);
    expect(engine.state.compositions).toHaveLength(2);
    const scene = engine.state.compositions[1]!;
    expect(scene.id).toBe(result.compositionIds[0]);
    expect(scene.layers.map((l) => l.type).sort()).toEqual([
      'shape',
      'shape',
      'text',
      'text',
    ]);
    // A second import gets fresh ids.
    const again = await tierACommands(raw, {
      project: engine.state,
      current: engine.state.compositions[0]!,
      mode: 'new',
    });
    engine.commands.transaction('Import code animation', again.commands);
    expect(engine.state.compositions).toHaveLength(3);
    engine.undo();
    engine.undo();
    expect(engine.state.compositions).toHaveLength(1);
  });

  it('[CODE-004] into the open scene; code-block items become Tier B code layers', async () => {
    const engine = new EditorEngine(createProject('A'));
    const result = await tierACommands(JSON.parse(spec('kinetic-quote')), {
      project: engine.state,
      current: engine.state.compositions[0]!,
      mode: 'current',
      overrides: { quote: 'HELLO' },
    });
    engine.commands.transaction('Import code animation', result.commands);
    const scene = engine.state.compositions[0]!;
    const code = scene.layers.filter((layer) => layer.code);
    expect(code).toHaveLength(2);
    type Code = {
      type: string;
      code: {
        tier: string;
        source: string;
        params: Record<string, unknown>;
        meta: Record<string, unknown>;
      };
    };
    const words = code.find(
      (layer) => layer.name === 'words',
    ) as unknown as Code;
    expect(words.type).toBe('video');
    expect(words.code.tier).toBe('B');
    expect(words.code.source).toBe('@block:kinetic-letters');
    expect(words.code.params.text).toBe('HELLO');
    expect(words.code.meta.seed).toBe(7);
    const dot = code.find((layer) => layer.name === 'accent')!;
    expect(dot.code!.source).toMatch(/quote-dot/);
    // Their clips are on visual lanes.
    for (const layer of code) {
      const track = scene.tracks.find((t) =>
        t.clips.some((clip) => clip.layerId === layer.id),
      )!;
      expect(track.type).toBe('video');
    }
  });

  it('[CODE-004] media slots without files are named, not silently dropped', async () => {
    const engine = new EditorEngine(createProject('A'));
    const result = await tierACommands(JSON.parse(spec('product-ad')), {
      project: engine.state,
      current: engine.state.compositions[0]!,
      mode: 'new',
    });
    expect(result.notBuilt.length).toBeGreaterThan(0);
    expect(result.notBuilt.join('\n')).toMatch(/asset|slot|absent/i);
    engine.commands.transaction('Import code animation', result.commands);
    expect(engine.state.compositions).toHaveLength(2);
  });
});
