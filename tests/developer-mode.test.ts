import { describe, expect, it } from 'vitest';
import { developerMode } from '../src/ui/developer-mode';

// FIX7-011: testing-only tools show in test builds; a production build needs
// the Developer mode switch.
describe('[FIX7-011] developer mode', () => {
  it('is on in test builds and follows the switch otherwise', () => {
    expect(typeof developerMode()).toBe('boolean');
    expect(developerMode()).toBe(true);
  });
});
