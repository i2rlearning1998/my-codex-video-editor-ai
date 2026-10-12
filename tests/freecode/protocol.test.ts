import { expect, it } from 'vitest';
import { assertFrame, isReply } from '../../src/freecode/protocol';
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
