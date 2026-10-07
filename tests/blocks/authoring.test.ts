import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { compileBlock } from '../../src/blocks/sandbox/compile';
import { sampleSource } from '../../blocks-gallery/sample';
it('both documented authoring examples and the gallery sample pass the real validator', () => {
  const guide = readFileSync(
    new URL('../../docs/CODE-LAYER.md', import.meta.url),
    'utf8',
  );
  const examples = [...guide.matchAll(/```js\n([\s\S]*?)\n```/g)].map(
    (match) => match[1]!,
  );
  expect(examples).toHaveLength(2);
  for (const source of [...examples, sampleSource]) {
    const result = compileBlock(source);
    expect(result.ok, result.ok ? '' : result.error).toBe(true);
  }
});
