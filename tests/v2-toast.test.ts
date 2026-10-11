import { expect, test } from 'vitest';
import { plainMessage } from '../src/ui/components/toast';

// V2 (B6): a toast is never raw JSON.
test('[TL-100] toasts turn validation JSON into a plain sentence', () => {
  expect(
    plainMessage(
      '[{"code":"too_small","message":"Clips cannot start before 0 s"}]',
    ),
  ).toBe('Clips cannot start before 0 s');
  expect(plainMessage('{"oops":1}')).not.toMatch(/^[[{]/);
  expect(plainMessage('[not json')).not.toMatch(/^[[{]/);
  expect(plainMessage('Track is locked')).toBe('Track is locked');
});
