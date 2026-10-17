import { it, expect } from 'vitest';
import {
  BLEND_MODES,
  BLEND_OPTIONS,
  blendPixel,
  applyBlendMode,
  resolveBlendMode,
  setLayerBlendMode,
  type BlendWarning,
} from '../../src/blend';
import {
  EditorEngine,
  createProject,
  createLayer,
  serializeProject,
} from '../../src/core';
import { deriveRenderItems, type RenderSource } from '../../src/render/adapter';
import fixture from '../fixtures/projects/av-sync.json';
const expected = [
  128, 32, 160, 64, 64, 128, 129, 0, 65, 64, 64, 128, 64, 64, 64, 128,
];
it.each(BLEND_MODES)('small opaque grayscale fixture: %s', (mode) => {
  const value = expected[BLEND_MODES.indexOf(mode)]!;
  const actual = blendPixel([64, 64, 64, 255], [128, 128, 128, 255], mode);
  actual
    .slice(0, 3)
    .forEach((v) => expect(Math.abs(v - value)).toBeLessThanOrEqual(1));
  expect(actual[3]).toBe(255);
});
it('component modes use luminosity and saturation rather than channel formulas', () => {
  expect(blendPixel([0, 0, 255, 255], [255, 0, 0, 255], 'color')).toEqual([
    94, 0, 0, 255,
  ]);
  expect(
    blendPixel([0, 0, 255, 255], [128, 128, 128, 255], 'saturation'),
  ).toEqual([28, 28, 28, 255]);
  expect(blendPixel([0, 0, 255, 255], [255, 0, 0, 255], 'hue')).toEqual([
    94, 0, 0, 255,
  ]);
  expect(blendPixel([0, 0, 255, 255], [255, 0, 0, 255], 'luminosity')).toEqual([
    54, 54, 255, 255,
  ]);
});
it('alpha blending is source-over and transparent pixels do not darken', () => {
  expect(blendPixel([255, 0, 0, 255], [0, 255, 0, 0], 'multiply')).toEqual([
    255, 0, 0, 255,
  ]);
  expect(blendPixel([0, 0, 0, 0], [128, 64, 32, 128], 'multiply')).toEqual([
    128, 64, 32, 128,
  ]);
});
it('all modes map to Canvas operations; unsupported values warn and reset normal', () => {
  const warnings: BlendWarning[] = [],
    ctx = {
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    };
  for (const mode of BLEND_MODES) {
    applyBlendMode(ctx, mode);
    expect(ctx.globalCompositeOperation).toBe(
      mode === 'normal' ? 'source-over' : mode,
    );
  }
  expect(resolveBlendMode('bogus', (w) => warnings.push(w))).toBe('normal');
  let operation: GlobalCompositeOperation = 'source-over';
  const limited = {
    get globalCompositeOperation() {
      return operation;
    },
    set globalCompositeOperation(v: GlobalCompositeOperation) {
      if (v === 'source-over') operation = v;
    },
  };
  expect(applyBlendMode(limited, 'hue', (w) => warnings.push(w))).toBe(
    'normal',
  );
  expect(warnings.map((w) => w.code)).toEqual([
    'UNSUPPORTED_BLEND_MODE',
    'UNSUPPORTED_BLEND_MODE',
  ]);
  expect(BLEND_OPTIONS).toHaveLength(16);
});
it('group scopes isolate a blended child and setter has one undo', () => {
  const p = createProject(),
    group = createLayer('group', 'group', 'Group');
  group.children = [createLayer('a', 'shape', 'A')];
  p.compositions[0]!.layers.push(group);
  const e = new EditorEngine(p),
    before = serializeProject(e.state);
  setLayerBlendMode(e, {
    compositionId: p.compositions[0]!.id,
    layerId: 'a',
    blendMode: 'multiply',
  });
  const source = {
    composition: e.state.compositions[0],
    assets: [],
    background: '#000000',
  } as unknown as RenderSource;
  const scopes = deriveRenderItems(source).items[0]!.maskScopes!;
  expect(scopes.map((s) => [s.id, s.blendMode])).toEqual([
    ['group', undefined],
    ['a', 'multiply'],
  ]);
  e.undo();
  expect(serializeProject(e.state)).toBe(before);
});
it('old project data stays unchanged and no blend scopes are added', () => {
  const e = new EditorEngine(fixture);
  expect(JSON.parse(JSON.stringify(e.state.compositions))).toEqual(
    fixture.compositions,
  );
  expect(resolveBlendMode(undefined)).toBe('normal');
});
