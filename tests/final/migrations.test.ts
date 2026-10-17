import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deserializeProject, SCHEMA_VERSION } from '../../src/core';

// FINAL1: one linear migration chain; an old project from each earlier
// version opens at the current version.
describe('[FINAL1] migration chain', () => {
  it.each([
    ['v4-keyframes', 4],
    ['v5-scenes', 5],
    ['v6-outliner', 6],
    ['v7-rotated', 7],
    ['v8-code-layer', 8],
  ])('opens %s (schema %i)', (name, version) => {
    const text = readFileSync(`tests/fixtures/projects/${name}.json`, 'utf8');
    expect(JSON.parse(text).schemaVersion).toBe(version);
    const project = deserializeProject(text);
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(9);
  });
  it('refuses a future version', () => {
    const text = readFileSync(
      'tests/fixtures/projects/v8-code-layer.json',
      'utf8',
    );
    expect(() =>
      deserializeProject(
        text.replace('"schemaVersion": 8', '"schemaVersion": 99'),
      ),
    ).toThrow();
  });
});
