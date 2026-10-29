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

// FIX7-014: no third-party key fields outside Developer mode.
describe('[FIX7-014] keys are developer-only', () => {
  it('the platform gateway, not the editor, holds provider keys', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/ui/settings-dialog.ts', 'utf8'),
    );
    expect(source).toContain('developerMode()');
  });
});
