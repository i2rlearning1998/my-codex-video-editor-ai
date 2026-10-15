import { expect, it } from 'vitest';
import {
  evaluateExpression,
  parseExpression,
} from '../../src/creator-pack/expression';
import { validatePreset, generatePreset } from '../../src/creator-pack/preset';
import { controlsSchema } from '../../src/creator-pack/controls';
import { resolveRecipe } from '../../src/creator-pack/recipe';
import { checkPolicy, checkFxCode } from '../../src/creator-pack/policy';
import { checkComposition } from '../../src/creator-pack/composition';
const amount = {
  name: 'amount',
  label: { en: 'Distance', hi: 'दूरी' },
  type: 'number',
  min: 0,
  max: 1,
  step: 0.1,
  default: 0.5,
};
const preset = {
  appliesTo: ['any'],
  controls: [amount],
  tracks: [
    {
      property: 'position.x',
      keys: [
        { t: 0, v: 0 },
        { t: 1, v: '$amount*W' },
      ],
    },
  ],
};
it.each([
  ['1+2*3', 7],
  ['-(2+3)/2', -2.5],
  ['sin(PI/2)+cos(0)', 2],
  ['clamp(4,0,1)+lerp(2,4,.5)', 4],
  ['min(3,2)+max(1,4)+abs(-2)+round(1.6)', 10],
])('evaluates %s', (source, result) =>
  expect(evaluateExpression(source)).toBeCloseTo(result),
);
it.each([
  'window.x',
  'eval(1)',
  '1;2',
  'pow(2,3)',
  'sin(1,2)',
  'NaN',
  '1/0',
  '0/0',
  '1e309',
  '1e308*2',
  'constructor()',
  '$missing',
  '1e-',
])('rejects unsafe/nonfinite expression %s', (s) =>
  expect(() => evaluateExpression(s)).toThrow(),
);
it('bounds nesting and handles numeric control/context references', () => {
  expect(() => parseExpression('('.repeat(65) + '1' + ')'.repeat(65))).toThrow(
    'nesting',
  );
  expect(
    evaluateExpression('$d*w+H', { d: 2 }, { W: 100, H: 50, w: 10, h: 5 }),
  ).toBe(70);
});
it('generates deterministic ordinary tracks with timing/easing controls', () => {
  validatePreset(preset);
  expect(
    generatePreset(
      preset,
      { amount: 1, duration: 2, delay: 0.5, easing: 'ease-out' },
      { W: 100, H: 100, w: 50, h: 50 },
    ),
  ).toEqual([
    {
      property: 'position.x',
      keys: [
        { t: 0.5, v: 0, ease: 'ease-out' },
        { t: 2.5, v: 100, ease: 'ease-out' },
      ],
    },
  ]);
  expect(() => generatePreset(preset, { amount: 2 })).toThrow();
});
it('rejects unused, invalid default and min/max control expressions', () => {
  expect(() =>
    validatePreset({
      ...preset,
      controls: [amount, { ...amount, name: 'dead' }],
    }),
  ).toThrow('Unused');
  expect(() =>
    validatePreset({
      ...preset,
      tracks: [{ property: 'x', keys: [{ t: 0, v: '1/$amount' }] }],
    }),
  ).toThrow('extreme');
  expect(() =>
    validatePreset({
      ...preset,
      tracks: [{ property: 'x', keys: [{ t: 0, v: '1/($amount-1)' }] }],
    }),
  ).toThrow('extreme');
});
it('resolves exact catalog ids and control-driven params including transition from', () => {
  const recipe = {
    mode: 'recipe',
    steps: [{ fx: 'effect.glow', params: { amount: { $param: 'amount' } } }],
  };
  expect(
    resolveRecipe(recipe, ['effect.glow'], controlsSchema.parse([amount])),
  ).toEqual([{ fx: 'effect.glow', params: { amount: 0.5 } }]);
  expect(() =>
    resolveRecipe(recipe, [], controlsSchema.parse([amount])),
  ).toThrow('Unknown fx');
  expect(() => resolveRecipe(recipe, ['effect.glow'])).toThrow('control');
  expect(
    resolveRecipe({ mode: 'recipe', from: 'crossfade' }, ['crossfade']),
  ).toEqual([{ fx: 'crossfade', params: {} }]);
});
it.each([
  'fetch("x")',
  'new WebSocket("x")',
  'while(true){}',
  'for(;;){}',
  'import("x")',
])('rejects static code hazards %s', (source) =>
  expect(checkPolicy({ source }).errors.length).toBeGreaterThan(0),
);
it('warns missing Hindi and does not execute source', () => {
  expect(
    checkPolicy({ name: { en: 'Name' }, source: 'throw Error("never run")' }),
  ).toMatchObject({ errors: [], needsRuntimeCheck: true });
  expect(checkPolicy({ name: { en: 'Name' } }).warnings).toHaveLength(1);
  expect(
    checkPolicy({ image: 'https://example.com/a.png' }).errors,
  ).toHaveLength(1);
  expect(
    checkPolicy({ image: 'data:image/png;base64,AA==' }).errors,
  ).toHaveLength(0);
  expect(() => checkFxCode('export default {}')).toThrow('apply');
});
it('validates native composition and same-pack/supplied references without dispatch', () => {
  const spec = {
    version: 1,
    id: 'tiny',
    title: 'Tiny',
    canvas: { width: 1280, height: 720, fps: 30 },
    scenes: [
      {
        id: 'one',
        name: 'One',
        duration: 2,
        items: [{ library: 'demo/shape' }],
      },
    ],
  };
  expect(checkComposition(spec, ['demo/shape'])[0]).toContain(
    'expansion skipped',
  );
  expect(() => checkComposition(spec, [])).toThrow('Unknown library');
  expect(() =>
    checkComposition({ ...spec, canvas: { width: 0, height: 720, fps: 30 } }, [
      'demo/shape',
    ]),
  ).toThrow();
  expect(spec.scenes[0]!.items[0]).toEqual({ library: 'demo/shape' });
});
it.each([
  { type: 'color', default: '#aabbcc' },
  { type: 'text', default: 'Title', maxLength: 40 },
  { type: 'bool', default: true },
  { type: 'select', default: 'one', options: ['one', 'two'] },
  { type: 'angle', min: -180, max: 180, step: 1, default: 90 },
  { type: 'point', default: { x: 0.5, y: 0.25 } },
  { type: 'range', min: 0, max: 10, step: 1, default: [2, 8] },
  { type: 'easing', default: 'ease-in-out' },
  { type: 'media', default: 'photo', kind: 'image' },
])('accepts control vocabulary $type', (fields) =>
  expect(
    controlsSchema.safeParse([
      { name: 'value', label: { en: 'Value', hi: 'मान' }, ...fields },
    ]).success,
  ).toBe(true),
);
it.each([
  { type: 'color', default: 'red' },
  { type: 'text', default: 'long', maxLength: 2 },
  { type: 'bool', default: 1 },
  { type: 'select', default: 'gone', options: ['one'] },
  { type: 'select', default: 'one', options: ['one', 'one'] },
  { type: 'angle', min: 0, max: 90, step: 1, default: 100 },
  { type: 'point', default: { x: 2, y: 0.5 } },
  { type: 'range', min: 0, max: 10, step: 1, default: [8, 2] },
  { type: 'easing', default: 'bounce' },
  { type: 'media', default: 'https://example.com' },
])('rejects invalid control $type', (fields) =>
  expect(
    controlsSchema.safeParse([
      { name: 'value', label: { en: 'Value', hi: 'मान' }, ...fields },
    ]).success,
  ).toBe(false),
);
