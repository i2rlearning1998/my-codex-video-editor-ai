import { describe, expect, it } from 'vitest';
import { adoptFreeLayers, type Project } from '../src/core';
import { preflight } from '../src/export/preflight';
import { createExampleProject } from '../src/ui/example';

const base = (): Project => adoptFreeLayers(createExampleProject()).project;
const run = (project: Project) =>
  preflight(project.compositions as never, project.assets as never);

describe('[QA-001] preflight checks', () => {
  it('finds nothing wrong in the example project except what it really has', () => {
    const codes = run(base()).map((i) => i.code);
    expect(codes).not.toContain('empty-scene');
    expect(codes).not.toContain('outside-canvas');
  });

  it('reports a scene without clips', () => {
    const project = structuredClone(base()) as Project;
    project.compositions[0]!.tracks = [];
    expect(run(project).map((i) => i.code)).toEqual(['empty-scene']);
  });

  it('reports a layer wholly outside the canvas, naming it', () => {
    const project = structuredClone(base()) as Project;
    const scene = project.compositions[0]!;
    const layer = scene.layers.find(
      (l) => l.type !== 'group' && l.type !== 'audio',
    )!;
    (layer.transform.position as { value: unknown }).value = [
      scene.width + 5000,
      0,
    ];
    const issue = run(project).find((i) => i.layerId === layer.id);
    expect(issue?.code).toBe('outside-canvas');
    expect(issue?.layerName).toBe(layer.name);
  });
});
