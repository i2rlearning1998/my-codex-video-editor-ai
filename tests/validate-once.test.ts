// FIX6-009: a scene that was already validated is not parsed again, but a
// changed or broken scene is still checked.
import { describe, expect, it } from 'vitest';
import { createLayer, createProject, validateProject } from '../src/core/model';

describe('[FIX6-009] validating a project twice', () => {
  it('gives the same project, and still rejects an edit that breaks a scene', () => {
    const project = createProject();
    const first = validateProject(structuredClone(project));
    const second = validateProject(structuredClone(first));
    expect(second).toEqual(first);
    const broken = structuredClone(second);
    const layer = createLayer('x', 'text', 'X');
    layer.assetId = 'missing-asset';
    broken.compositions[0]!.layers.push(layer);
    expect(() => validateProject(broken)).toThrow();
    // A frozen (state) project validates too.
    expect(() =>
      validateProject(Object.freeze(structuredClone(second))),
    ).not.toThrow();
  });
});
