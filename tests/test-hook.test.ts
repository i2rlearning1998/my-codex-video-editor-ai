import { expect, test } from 'vitest';
import { EditorEngine, createLayer, createProject } from '../src/core';
import { EditorSession } from '../src/ui/session';
import { createTestHook } from '../src/dev/test-hook';

test('[DEV-005] hook snapshots are deeply frozen and cannot mutate engine or session', () => {
  const engine = new EditorEngine(createProject('Hook test'));
  const session = new EditorSession(engine);
  const errors = [{ message: 'probe' }];
  const hook = createTestHook(engine, session, () => errors);
  engine.commands.execute({
    type: 'CREATE_LAYER',
    compositionId: session.source.composition.id,
    parentId: null,
    layer: createLayer('test-layer', 'shape', 'Test'),
  });
  const project = hook.getProject();
  const current = hook.getSession();
  const history = hook.getHistory();
  expect(Object.isFrozen(hook)).toBe(true);
  expect(
    Object.isFrozen(project.compositions[0]!.layers[0]!.transform.position),
  ).toBe(true);
  expect(Reflect.set(project.metadata, 'name', 'Mutated')).toBe(false);
  expect(() => (current.selectedIds as string[]).push('test-layer')).toThrow();
  expect(() => history.labels.push('Fake')).toThrow();
  expect(
    Reflect.set(hook.getConsoleErrors()[0] as object, 'message', 'Mutated'),
  ).toBe(false);
  expect(engine.state.metadata.name).toBe('Hook test');
  expect(session.selectedIds).toEqual([]);
  expect(engine.history.undo).toHaveLength(1);
  expect(errors[0]!.message).toBe('probe');
  expect(project).not.toBe(engine.state);
  expect(Object.keys(hook).sort()).toEqual([
    'getConsoleErrors',
    'getHistory',
    'getProject',
    'getSession',
    'version',
  ]);
  session.dispose();
});
