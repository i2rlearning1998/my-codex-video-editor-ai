import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const sourceRoot = new URL('../../src/ai-spec/', import.meta.url);
it('retains the exact PR21 compileBlock policy snapshot, not a substitute evaluator', () => {
  const provenance = JSON.parse(
    readFileSync(new URL('vendor/provenance.json', sourceRoot), 'utf8'),
  );
  expect(provenance.blocksCommit).toBe(
    '6a74c956f762dfa2c6bf64cb643a4f2afd3e6e97',
  );
  for (const file of provenance.files) {
    const bytes = readFileSync(new URL(file.path, sourceRoot));
    expect(createHash('sha256').update(bytes).digest('hex'), file.path).toBe(
      file.sha256,
    );
  }
});
it('keeps runtime imports inside ai-spec except existing zod and TypeScript', () => {
  const root = fileURLToPath(sourceRoot);
  function visit(folder: string) {
    for (const file of readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, file.name);
      if (file.isDirectory()) {
        visit(full);
        continue;
      }
      if (!file.name.endsWith('.ts')) continue;
      const source = readFileSync(full, 'utf8');
      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const target = match[1]!;
        if (target.startsWith('.'))
          expect(
            path.resolve(path.dirname(full), target).startsWith(root),
          ).toBe(true);
        else expect(['zod', 'typescript']).toContain(target);
      }
    }
  }
  visit(root);
});
it('publishes the six exact worked spec fixtures in the prompt pack', () => {
  const guide = readFileSync(
    new URL('../../docs/AI-SPEC.md', import.meta.url),
    'utf8',
  );
  const examples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map(
    (match) => JSON.parse(match[1]!),
  );
  expect(examples).toHaveLength(6);
  for (const example of examples) {
    const fixture = JSON.parse(
      readFileSync(
        new URL(`./fixtures/${example.id}.spec.json`, import.meta.url),
        'utf8',
      ),
    );
    expect(example).toEqual(fixture);
  }
});
