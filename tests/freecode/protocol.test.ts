import { expect, it } from 'vitest';
import { assertFrame, isReply } from '../../src/freecode/protocol';
import { samples } from '../../src/freecode/samples';
import { instrument } from '../../src/freecode/instrument';
it('checks token, message shape and frame ordering', () => {
  expect(isReply({ token: 'a', id: 1, kind: 'frame' }, 'a')).toBe(true);
  for (const d of [
    null,
    {},
    { token: 'b', id: 1, kind: 'frame' },
    { token: 'a', id: 1, kind: 'error' },
  ])
    expect(isReply(d, 'a')).toBe(false);
  expect(() => assertFrame(3, 5, false, 0)).toThrow('frame 0');
  expect(() => assertFrame(3, 5, true, 0)).not.toThrow();
  expect(() => assertFrame(5, 5, true, 0)).toThrow();
});
it('instruments loop bodies and recursive expression arrows', () => {
  const code = instrument(
    'export default {init(){while(true);},renderFrame(){const f=()=>f();f();}}',
  );
  expect(code).toContain('window.__block');
  expect(code.match(/__fcGuard/g)?.length).toBeGreaterThanOrEqual(4);
});

it('[EXP-007] emits executable classic sandbox scripts for every sample', () => {
  for (const sample of samples) {
    expect(
      () =>
        new Function(
          'helpers',
          '__fcGuard',
          '__fcAllocate',
          instrument(sample.source),
        ),
      sample.id,
    ).not.toThrow();
  }
});
it('[EXP-007] installs and runs both supported module forms with guards', () => {
  for (const declaration of ['export default', 'window.__block =']) {
    const target: { __block?: { renderFrame(): number } } = {};
    let ticks = 0;
    const run = new Function(
      'window',
      '__fcGuard',
      instrument(
        `${declaration} { renderFrame() { let total = 0; for (let i = 0; i < 3; i++) total += i; return total; } }`,
      ),
    );
    run(target, () => {
      ticks++;
    });
    expect(target.__block?.renderFrame()).toBe(3);
    expect(ticks).toBeGreaterThanOrEqual(4);
  }
});
