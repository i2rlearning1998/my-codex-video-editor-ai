import { expect, it } from 'vitest';
import { importMediaFiles } from '../../src/media/import';
import { MemoryMediaStore } from '../../src/media/store';

it('[FX10-013] a file another import added while this one was being stored counts as already there, never as "Asset ID already exists"', async () => {
  const store = new MemoryMediaStore();
  const file = new File([new Uint8Array([1, 2, 3, 4, 5])], 'desert.png', {
    type: 'image/png',
  });
  const known = new Set<string>();
  let checks = 0;
  const added: string[] = [];
  const result = await importMediaFiles([file], {
    store,
    probe: async () => {
      // Meanwhile a build adds the same picture.
      return { width: 10, height: 10 } as never;
    },
    hasAsset: (id) => {
      checks++;
      // First look: not there. After probing: a parallel import added it.
      if (checks >= 2) known.add(id);
      return known.has(id);
    },
    addAsset: (asset) => {
      if (known.has(asset.id)) throw new Error('Asset ID already exists');
      added.push(asset.id);
    },
  });
  expect(result.outcomes.map((item) => item.status)).toEqual(['duplicate']);
  expect(added).toEqual([]);
});
