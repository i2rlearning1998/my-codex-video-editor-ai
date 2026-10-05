import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
it('FX compiled ES library runs with identical bytes in Node main and Worker', () => {
  const result = JSON.parse(
    execFileSync(process.execPath, ['fx-gallery/scripts/fx-runtime.mjs'], {
      encoding: 'utf8',
      timeout: 25000,
    }),
  );
  expect(result.items).toBe(101);
  expect(result.parity).toContain('identical bytes');
}, 30000);
