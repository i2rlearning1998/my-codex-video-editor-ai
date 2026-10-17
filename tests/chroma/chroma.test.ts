import { it, expect, vi } from 'vitest';
import { applyChromaCpu, baseChroma } from '../../src/chroma/cpu';
import {
  sampleColorAt,
  chromaSchema,
  type PixelFrame,
} from '../../src/chroma/types';
import { createChromaProcessor } from '../../src/chroma/process';
import { setChromaKey } from '../../src/chroma/commands';
import {
  EditorEngine,
  createProject,
  createLayer,
  serializeProject,
} from '../../src/core';
import fixture from '../fixtures/projects/av-sync.json';
const frame: PixelFrame = {
  width: 3,
  height: 1,
  data: new Uint8ClampedArray([0, 255, 0, 255, 255, 0, 0, 255, 0, 0, 255, 128]),
};
it('green-screen fixture preserves foreground and source alpha without mutation', () => {
  const output = applyChromaCpu(frame, {
    color: '#00ff00',
    similarity: 0,
    smoothness: 0,
    spill: 0,
  });
  expect([...output.data]).toEqual([
    0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 128,
  ]);
  expect(frame.data[3]).toBe(255);
});
it('inversion, tolerance extremes and spill suppression', () => {
  const inverse = applyChromaCpu(frame, {
    color: '#00ff00',
    invert: true,
    spill: 1,
  });
  expect([...inverse.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
  expect(inverse.data[7]).toBe(0);
  expect(
    applyChromaCpu(frame, {
      color: '#00ff00',
      similarity: 1,
      smoothness: 0,
    }).data.filter((_, i) => i % 4 === 3),
  ).toEqual(new Uint8ClampedArray([0, 0, 0]));
});
it('smooth edges interpolate and feather/shrink process alpha only', () => {
  const soft = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([0, 128, 0, 255]),
  };
  const a = applyChromaCpu(soft, {
    color: '#00ff00',
    similarity: 0,
    smoothness: 1,
    spill: 0,
  }).data[3]!;
  expect(a).toBeGreaterThan(0);
  expect(a).toBeLessThan(255);
  const result = applyChromaCpu(frame, {
    color: '#00ff00',
    similarity: 0,
    smoothness: 0,
    spill: 0,
    feather: 1,
  });
  expect(result.data[3]).toBe(85);
  expect(result.data[7]).toBe(128);
  const shrunk = applyChromaCpu(frame, { color: '#00ff00', shrink: 1 });
  expect(shrunk.data[3]).toBe(0);
  expect(shrunk.data[7]).toBe(0);
});
it('eyedropper validates bounds and config rejects invalid parameters', () => {
  expect(sampleColorAt(frame, 0, 0)).toBe('#00ff00');
  expect(() => sampleColorAt(frame, 3, 0)).toThrow();
  expect(() => sampleColorAt(frame, 0.5, 0)).toThrow();
  expect(chromaSchema.safeParse({ color: 'bad' }).success).toBe(false);
  expect(
    chromaSchema.safeParse({ color: '#00ff00', similarity: NaN }).success,
  ).toBe(false);
  expect(chromaSchema.safeParse({ color: '#00ff00', feather: 9 }).success).toBe(
    false,
  );
});
it('fake GPU selection shares edge pass; unavailable/context-loss falls back to CPU', () => {
  const process = vi.fn(baseChroma),
    dispose = vi.fn(),
    p = createChromaProcessor(() => ({ process, dispose })),
    config = { color: '#00ff00', feather: 1 };
  const result = p.process(frame, config);
  expect(result.backend).toBe('webgl');
  expect(result.frame).toEqual(applyChromaCpu(frame, config));
  process.mockImplementationOnce(() => {
    throw new Error('lost');
  });
  expect(p.process(frame, config).backend).toBe('cpu');
  expect(dispose).toHaveBeenCalledOnce();
  const cpu = createChromaProcessor(() => null);
  expect(cpu.process(frame, config)).toMatchObject({
    backend: 'cpu',
    warning: 'GPU_FALLBACK',
  });
});
it('explicit CPU avoids GL initialization and is deterministic', () => {
  const make = vi.fn(() => null),
    p = createChromaProcessor(make),
    config = { color: '#00ff00' };
  expect(p.process(frame, config, 'cpu').frame).toEqual(
    p.process(frame, config, 'cpu').frame,
  );
  expect(make).not.toHaveBeenCalled();
});
it('setter validates type and undo; old projects unchanged', () => {
  const old = new EditorEngine(fixture);
  expect(JSON.parse(JSON.stringify(old.state.compositions))).toEqual(
    fixture.compositions,
  );
  const p = createProject(),
    layer = createLayer('video', 'video', 'Video');
  p.compositions[0]!.layers.push(layer);
  const e = new EditorEngine(p),
    before = serializeProject(e.state);
  setChromaKey(e, {
    compositionId: p.compositions[0]!.id,
    layerId: layer.id,
    chromaKey: { color: '#00ff00' },
  });
  expect(e.state.compositions[0]!.layers[0]!.chromaKey?.color).toBe('#00ff00');
  e.undo();
  expect(serializeProject(e.state)).toBe(before);
});
