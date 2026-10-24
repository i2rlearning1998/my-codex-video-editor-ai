import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildProjectFromComposition } from '../../src/composition';

it('F2-070 builds cooperatively without changing IDs, ordering or timing and cancels before publication', async () => {
  const input: unknown = JSON.parse(
    readFileSync('tests/fixtures/compositions/documentary-mini.json', 'utf8'),
  );
  const before: unknown = JSON.parse(
    readFileSync('tests/fix5/fixtures/composition-before.json', 'utf8'),
  );
  let responded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const progress: number[] = [];
  const result = await buildProjectFromComposition(input, {
    onProgress: ({ percent }) => {
      progress.push(percent);
      timer ??= setTimeout(() => {
        responded = true;
      }, 0);
    },
  });
  expect(result).toEqual(before);
  expect(responded).toBe(true);
  expect(progress.at(-1)).toBe(100);
  expect(progress).toEqual([...progress].sort((a, b) => a - b));
  const controller = new AbortController();
  const randomUUID = crypto.randomUUID;
  await expect(
    buildProjectFromComposition(input, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(crypto.randomUUID).toBe(randomUUID);
});
