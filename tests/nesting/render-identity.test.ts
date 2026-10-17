// The nesting render path must leave every project without nesting exactly
// as it was. The hashes in the snapshot were recorded with the render
// adapter before the nesting change (commit 79dcef4) and must not change.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compositionAt, deserializeProject, freeze } from '../../src/core';
import { deriveRenderItems } from '../../src/render/adapter';

const dir = 'tests/fixtures/projects';
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .sort();

function digest(name: string): string[] {
  const project = freeze(
    deserializeProject(readFileSync(`${dir}/${name}`, 'utf8')),
  );
  const out: string[] = [];
  for (const composition of project.compositions)
    for (const time of [0, 0.5, 1, 2.5, 4, 7.25])
      for (const animate of [false, true]) {
        const { items, warnings } = deriveRenderItems({
          composition: compositionAt(composition, time),
          assets: project.assets,
          background: composition.backgroundColor,
          currentTime: time,
          animate,
        });
        out.push(
          createHash('sha256')
            .update(JSON.stringify({ items, warnings }))
            .digest('hex')
            .slice(0, 16),
        );
      }
  return out;
}

describe('[NEST] render identity for projects without nesting', () => {
  it.each(files)('%s derives the same render items', (name) => {
    expect(digest(name)).toMatchSnapshot();
  });
});
