import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  EditorEngine,
  createProject,
  createComposition,
  createLayer,
  number,
  vector2,
  validateProject,
  serializeProject,
  deserializeProject,
  MigrationRegistry,
  FutureSchemaError,
  CapabilityRegistry,
  type Asset,
  type Command,
  type Capability,
  type Project,
} from '../src/core';

function setup(options = {}) {
  const engine = new EditorEngine(createProject('Test project'), options);
  const compositionId = engine.state.compositions[0]!.id;
  const add = (id = 'layer-1', type: 'text' | 'group' = 'text'): Command => ({
    type: 'CREATE_LAYER',
    compositionId,
    parentId: null,
    layer: createLayer(id, type, id),
  });
  const property = (value: number): Command => ({
    type: 'SET_PROPERTY',
    compositionId,
    layerId: 'layer-1',
    target: { kind: 'transform', key: 'opacity' },
    property: number(value),
  });
  return { engine, compositionId, add, property };
}
const asset: Asset = {
  id: 'asset-1',
  name: 'Still',
  type: 'image',
  source: { kind: 'local', reference: 'media/still.png' },
  metadata: {},
  width: 100,
  height: 100,
};

describe('models and project validation', () => {
  it('creates a versioned project and valid composition', () => {
    const project = createProject('Example', '2026-01-01T00:00:00.000Z');
    expect(project.schemaVersion).toBe(5);
    expect(project.metadata.name).toBe('Example');
    expect(project.compositions[0]).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 10,
      layers: [],
      markers: [],
      audioTracks: [],
    });
    expect(validateProject(project)).toEqual(project);
  });
  it('validates composition dimensions, duration and markers', () => {
    expect(() => createComposition({ fps: 0 })).toThrow();
    expect(() => createComposition({ width: -1 })).toThrow();
    expect(() =>
      createComposition({ duration: Number.POSITIVE_INFINITY }),
    ).toThrow();
    const project = createProject();
    project.compositions[0]!.markers.push({
      id: 'marker',
      time: 11,
      label: 'Outside',
    });
    expect(validateProject(project).compositions[0]!.duration).toBe(11);
  });
  it('rejects unknown fields and duplicate identifiers across compositions', () => {
    const project = createProject();
    project.compositions[0]!.layers.push(createLayer('same', 'text', 'A'));
    const second = createComposition();
    second.layers.push(createLayer('same', 'text', 'B'));
    project.compositions.push(second);
    expect(() => validateProject(project)).toThrow(/Duplicate ID/);
    expect(() =>
      validateProject({ ...createProject(), hiddenState: {} }),
    ).toThrow();
  });
  it('rejects missing assets, illegal children and non-JSON data', () => {
    const project = createProject();
    const layer = createLayer('layer', 'image', 'Still');
    layer.assetId = 'missing';
    project.compositions[0]!.layers.push(layer);
    expect(() => validateProject(project)).toThrow(/asset/);
    layer.assetId = null;
    layer.children.push(createLayer('child', 'text', 'Child'));
    expect(() => validateProject(project)).toThrow(/Only groups/);
    expect(() =>
      validateProject({ ...createProject(), extra: undefined }),
    ).toThrow(/JSON/);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => validateProject(cycle)).toThrow(/acyclic/);
    expect(() =>
      validateProject({ ...createProject(), extra: new Date() }),
    ).toThrow(/plain JSON/);
  });
});

describe('commands, immutable state and scene hierarchy', () => {
  it('creates layers and compositions through the bus', () => {
    const { engine, add } = setup();
    engine.commands.execute(add());
    engine.commands.execute({
      type: 'CREATE_COMPOSITION',
      composition: createComposition({ name: 'Second' }),
    });
    expect(engine.state.compositions).toHaveLength(2);
    expect(engine.state.compositions[0]!.layers[0]!.id).toBe('layer-1');
    expect(engine.history.undo).toHaveLength(2);
  });
  it('keeps caller-owned input and exposed state separate', () => {
    const { engine, add } = setup();
    const command = add();
    engine.commands.execute(command);
    if (command.type === 'CREATE_LAYER')
      command.layer.name = 'Changed outside engine';
    expect(engine.state.compositions[0]!.layers[0]!.name).toBe('layer-1');
    expect(() => {
      (engine.state as unknown as Project).metadata.name = 'Mutated';
    }).toThrow();
    expect(() => {
      (engine.history.undo as unknown[]).pop();
    }).toThrow();
  });
  it('deletes a group subtree and restores it with undo', () => {
    const { engine, add, compositionId } = setup();
    engine.commands.execute(add('group', 'group'));
    engine.commands.execute({ ...add(), parentId: 'group' } as Command);
    const before = engine.state;
    engine.commands.execute({
      type: 'DELETE_LAYER',
      compositionId,
      layerId: 'group',
    });
    expect(engine.state.compositions[0]!.layers).toEqual([]);
    engine.undo();
    expect(engine.state).toEqual(before);
  });
  it('updates typed custom and transform properties', () => {
    const { engine, add, property, compositionId } = setup();
    engine.commands.execute(add());
    engine.commands.execute(property(0.5));
    engine.commands.execute({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: 'layer-1',
      target: { kind: 'property', key: 'size' },
      property: number(24),
    });
    expect(
      engine.state.compositions[0]!.layers[0]!.transform.opacity.value,
    ).toBe(0.5);
    expect(
      engine.state.compositions[0]!.layers[0]!.properties.size?.value,
    ).toBe(24);
    const before = engine.state;
    expect(() => engine.commands.execute(property(2))).toThrow();
    expect(() =>
      engine.commands.execute({
        ...property(0),
        property: vector2(0, 0),
      } as Command),
    ).toThrow(/type/);
    expect(engine.state).toBe(before);
  });
  it('moves across parents and uses post-removal insertion indexes', () => {
    const { engine, add, compositionId } = setup();
    engine.commands.transaction('Setup', [
      add('a'),
      add('b'),
      add('g', 'group'),
    ]);
    engine.commands.execute({
      type: 'MOVE_LAYER',
      compositionId,
      layerId: 'a',
      parentId: null,
      index: 1,
    });
    expect(
      engine.state.compositions[0]!.layers.map((layer) => layer.id),
    ).toEqual(['b', 'a', 'g']);
    engine.commands.execute({
      type: 'MOVE_LAYER',
      compositionId,
      layerId: 'a',
      parentId: 'g',
    });
    expect(engine.state.compositions[0]!.layers[1]!.children[0]!.id).toBe('a');
    const before = engine.state;
    expect(() =>
      engine.commands.execute({
        type: 'MOVE_LAYER',
        compositionId,
        layerId: 'b',
        parentId: null,
        index: 99,
      }),
    ).toThrow();
    expect(engine.state).toBe(before);
  });
  it('rejects cyclic moves and non-group parents', () => {
    const { engine, add, compositionId } = setup();
    engine.commands.transaction('Setup', [
      add('outer', 'group'),
      { ...add('inner', 'group'), parentId: 'outer' } as Command,
      add('text'),
    ]);
    expect(() =>
      engine.commands.execute({
        type: 'MOVE_LAYER',
        compositionId,
        layerId: 'outer',
        parentId: 'inner',
      }),
    ).toThrow(/descendants/);
    expect(() =>
      engine.commands.execute({
        type: 'MOVE_LAYER',
        compositionId,
        layerId: 'outer',
        parentId: 'outer',
      }),
    ).toThrow();
    expect(() =>
      engine.commands.execute({
        type: 'MOVE_LAYER',
        compositionId,
        layerId: 'inner',
        parentId: 'text',
      }),
    ).toThrow(/group/);
  });
  it('groups in scene order and ungroups at the original group position', () => {
    const { engine, add, compositionId } = setup();
    engine.commands.transaction('Setup', [add('a'), add('b'), add('c')]);
    engine.commands.execute({
      type: 'GROUP',
      compositionId,
      layerIds: ['c', 'a'],
      groupId: 'g',
      name: 'Group',
    });
    expect(
      engine.state.compositions[0]!.layers[0]!.children.map(
        (layer) => layer.id,
      ),
    ).toEqual(['a', 'c']);
    engine.commands.execute({ type: 'UNGROUP', compositionId, groupId: 'g' });
    expect(
      engine.state.compositions[0]!.layers.map((layer) => layer.id),
    ).toEqual(['a', 'c', 'b']);
  });
  it('rejects ambiguous groups and transformed ungroup operations', () => {
    const { engine, add, compositionId } = setup();
    engine.commands.transaction('Setup', [add('a'), add('g', 'group')]);
    expect(() =>
      engine.commands.execute({
        type: 'GROUP',
        compositionId,
        layerIds: ['a', 'a'],
        groupId: 'x',
        name: 'G',
      }),
    ).toThrow(/Duplicate/);
    engine.commands.execute({
      type: 'SET_PROPERTY',
      compositionId,
      layerId: 'g',
      target: { kind: 'transform', key: 'rotation' },
      property: number(45),
    });
    expect(() =>
      engine.commands.execute({ type: 'UNGROUP', compositionId, groupId: 'g' }),
    ).toThrow(/identity/);
  });
  it('adds and replaces assets while preserving reference identity', () => {
    const { engine, compositionId } = setup();
    engine.commands.execute({ type: 'ADD_ASSET', asset });
    const layer = createLayer('image', 'image', 'Image');
    layer.assetId = asset.id;
    engine.commands.execute({
      type: 'CREATE_LAYER',
      compositionId,
      parentId: null,
      layer,
    });
    engine.commands.execute({
      type: 'REPLACE_ASSET',
      assetId: asset.id,
      asset: { ...asset, name: 'Replacement' },
    });
    expect(engine.state.assets[0]!.name).toBe('Replacement');
    expect(engine.state.compositions[0]!.layers[0]!.assetId).toBe(asset.id);
    expect(() =>
      engine.commands.execute({
        type: 'REPLACE_ASSET',
        assetId: asset.id,
        asset: { ...asset, id: 'new-id' },
      }),
    ).toThrow(/preserve/);
    expect(() =>
      engine.commands.execute({
        type: 'REPLACE_ASSET',
        assetId: asset.id,
        asset: { ...asset, type: 'audio' },
      }),
    ).toThrow(/incompatible/);
    expect(() =>
      engine.commands.execute({ type: 'ADD_ASSET', asset }),
    ).toThrow();
  });
  it.each([
    { type: 'UNKNOWN' },
    { type: 'DELETE_LAYER', layerId: 'missing' },
    { type: 'ADD_ASSET', asset: { ...asset, duration: -1 } },
    { type: 'ADD_ASSET', asset, surprise: true },
    null,
  ])('rejects malformed runtime command %# without mutation', (invalid) => {
    const { engine } = setup();
    const before = engine.state;
    expect(() =>
      engine.commands.transaction('Invalid', [invalid as unknown as Command]),
    ).toThrow();
    expect(engine.state).toBe(before);
    expect(engine.canUndo).toBe(false);
  });
  it('rejects a missing layer and unsafe property key', () => {
    const { engine, add, compositionId } = setup();
    engine.commands.execute(add());
    expect(() =>
      engine.commands.execute({
        type: 'DELETE_LAYER',
        compositionId,
        layerId: 'absent',
      }),
    ).toThrow(/Unknown/);
    expect(() =>
      engine.commands.execute({
        type: 'SET_PROPERTY',
        compositionId,
        layerId: 'layer-1',
        target: { kind: 'property', key: '__proto__' },
        property: number(1),
      }),
    ).toThrow();
  });
});

describe('transactions, history and events', () => {
  it('undoes and redoes a transaction as a single boundary', () => {
    const { engine, add, property } = setup();
    const before = engine.state;
    engine.commands.transaction('Create and fade', [add(), property(0.5)]);
    const after = engine.state;
    expect(engine.history.undo[0]).toMatchObject({
      label: 'Create and fade',
      kind: 'transaction',
    });
    expect(engine.history.undo[0]!.commands).toHaveLength(2);
    expect(engine.undo()).toBe(true);
    expect(engine.state).toEqual(before);
    expect(engine.redo()).toBe(true);
    expect(engine.state).toEqual(after);
    expect(engine.redo()).toBe(false);
  });
  it('rolls back every command on validation failure and preserves redo', () => {
    const { engine, add, property } = setup();
    engine.commands.execute(add('previous'));
    engine.undo();
    const before = engine.state;
    const applied = vi.fn();
    const failed = vi.fn();
    engine.on('command:applied', applied);
    engine.on('transaction:failed', failed);
    expect(() =>
      engine.commands.transaction('Fail', [add(), property(4)]),
    ).toThrow();
    expect(engine.state).toBe(before);
    expect(engine.canRedo).toBe(true);
    expect(engine.canUndo).toBe(false);
    expect(applied).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
  });
  it('clears redo after a new edit and bounds history', () => {
    const { engine, add } = setup({ historyLimit: 2 });
    engine.commands.execute(add('a'));
    engine.commands.execute(add('b'));
    engine.commands.execute(add('c'));
    expect(engine.history.undo).toHaveLength(2);
    engine.undo();
    engine.commands.execute(add('d'));
    expect(engine.canRedo).toBe(false);
    expect(engine.history.undo).toHaveLength(2);
  });
  it('ignores no-ops, validates labels and rejects empty transactions', () => {
    const { engine, add, property } = setup();
    engine.commands.execute(add());
    engine.commands.execute(property(0.5));
    engine.undo();
    engine.commands.execute(property(1));
    expect(engine.canRedo).toBe(true);
    expect(engine.history.undo).toHaveLength(1);
    expect(() => engine.commands.transaction('Empty', [])).toThrow();
    expect(() => engine.commands.execute(property(0), '')).toThrow();
  });
  it('emits one state change per transaction in lifecycle order', () => {
    const { engine, add } = setup();
    const events: string[] = [];
    engine.on('command:before', () => events.push('before'));
    engine.on('command:applied', () => events.push('applied'));
    engine.on('transaction:committed', () => events.push('committed'));
    const off = engine.on('state:changed', () => events.push('state'));
    engine.commands.transaction('Two layers', [add('a'), add('b')]);
    expect(events).toEqual([
      'before',
      'before',
      'applied',
      'applied',
      'committed',
      'state',
    ]);
    off();
    engine.undo();
    expect(events).toHaveLength(6);
  });
  it('isolates listener failures and blocks reentrant mutations', () => {
    const onListenerError = vi.fn();
    const { engine, add } = setup({ onListenerError });
    engine.on('state:changed', () => {
      engine.undo();
    });
    engine.on('command:applied', () => {
      throw new Error('Observer failure');
    });
    expect(() => engine.commands.execute(add())).not.toThrow();
    expect(engine.canUndo).toBe(true);
    expect(onListenerError).toHaveBeenCalledTimes(2);
  });
  it('loads as a validated session boundary and preserves state on invalid load', () => {
    const { engine, add } = setup();
    engine.commands.execute(add());
    const before = engine.state;
    expect(() => engine.load({})).toThrow();
    expect(engine.state).toBe(before);
    expect(engine.canUndo).toBe(true);
    engine.load(createProject('New'));
    expect(engine.state.metadata.name).toBe('New');
    expect(engine.canUndo).toBe(false);
  });
});

describe('serialization and migrations', () => {
  it('rejects oversized exports before they can create an unreadable save', () => {
    const project = createProject();
    project.assets.push({
      ...asset,
      metadata: { oversized: 'x'.repeat(20_000_000) },
    });
    expect(() => serializeProject(project)).toThrow(/size limit/);
  });
  it('round trips canonical state', () => {
    const { engine, add } = setup();
    engine.commands.execute(add());
    expect(deserializeProject(serializeProject(engine.state))).toEqual(
      engine.state,
    );
    expect(() => deserializeProject('{')).toThrow();
  });
  it('rejects future versions without changing input', () => {
    const future = { ...createProject(), schemaVersion: 99 };
    const text = JSON.stringify(future);
    expect(() => deserializeProject(text)).toThrow(FutureSchemaError);
    expect(JSON.stringify(future)).toBe(text);
  });
  it('runs an explicitly registered legacy migration without mutating input', () => {
    const registry = new MigrationRegistry();
    const legacy = { ...createProject(), schemaVersion: 0 };
    registry.register({
      from: 0,
      to: 1,
      migrate: (document) => ({ ...(document as object), schemaVersion: 1 }),
    });
    expect(registry.run(legacy).schemaVersion).toBe(5);
    expect(legacy.schemaVersion).toBe(0);
    expect(() =>
      registry.register({ from: 0, to: 1, migrate: (value) => value }),
    ).toThrow(/already/);
  });
  it('rejects gaps, malformed versions, invalid migration output and nonsequential registration', () => {
    const registry = new MigrationRegistry();
    const legacy = { ...createProject(), schemaVersion: 0 };
    expect(() => registry.run(legacy)).toThrow(/Missing migration/);
    expect(() => registry.run({ schemaVersion: 0.5 })).toThrow(/schemaVersion/);
    expect(() =>
      registry.register({ from: 0, to: 2, migrate: (value) => value }),
    ).toThrow();
    registry.register({ from: 0, to: 1, migrate: (value) => value });
    expect(() => registry.run(legacy)).toThrow(/wrong schema/);
  });
});

describe('capability foundation', () => {
  it('requires JSON input even when a handler accepts arbitrary input', () => {
    const { engine } = setup();
    const plugin = capability();
    plugin.commands.RENAME!.inputSchema = z.unknown();
    engine.capabilities.register(plugin);
    expect(() =>
      engine.commands.execute({
        type: 'plugin:test-capability:RENAME',
      } as unknown as Parameters<typeof engine.commands.execute>[0]),
    ).toThrow();
    expect(engine.canUndo).toBe(false);
  });
  function capability(): Capability {
    return {
      id: 'test-capability',
      version: '1.0.0',
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      commands: {
        RENAME: {
          inputSchema: z.string().min(1),
          outputSchema: z.string(),
          apply: (draft, input) => {
            draft.metadata.name = input as string;
            return input as string;
          },
        },
      },
      uiExtension: { slot: 'inspector' },
      rendererExtension: { kind: 'reserved' },
      aiInstruction: { description: 'Declaration only; no execution.' },
    };
  }
  it('registers a validated descriptor and rejects duplicate or malformed registration', () => {
    const registry = new CapabilityRegistry();
    registry.register(capability());
    expect(registry.list()[0]).toEqual({
      id: 'test-capability',
      version: '1.0.0',
      commands: ['RENAME'],
    });
    expect(() => registry.register(capability())).toThrow(/already/);
    expect(() =>
      registry.register({ ...capability(), version: 'bad' }),
    ).toThrow();
    expect(() =>
      registry.register({ ...capability(), inputSchema: {} } as Capability),
    ).toThrow();
  });
  it('runs extensions through the same validation, transaction and history path', () => {
    const { engine } = setup();
    engine.capabilities.register(capability());
    expect(
      engine.commands.execute({
        type: 'plugin:test-capability:RENAME',
        input: 'Renamed',
      }),
    ).toBe('Renamed');
    expect(engine.state.metadata.name).toBe('Renamed');
    engine.undo();
    expect(engine.state.metadata.name).toBe('Test project');
    engine.redo();
    expect(engine.state.metadata.name).toBe('Renamed');
    expect(() =>
      engine.commands.execute({
        type: 'plugin:test-capability:RENAME',
        input: 2,
      }),
    ).toThrow();
    expect(() =>
      engine.commands.execute({ type: 'plugin:missing:RENAME', input: 'X' }),
    ).toThrow(/Unknown/);
  });
  it('rolls back invalid plugin output/state and prevents retained draft mutation', () => {
    const { engine } = setup();
    let retained: Project | undefined;
    const plugin = capability();
    plugin.commands.RENAME!.apply = (draft) => {
      retained = draft;
      draft.metadata.name = 'Valid';
      return 'Valid';
    };
    engine.capabilities.register(plugin);
    engine.commands.execute({
      type: 'plugin:test-capability:RENAME',
      input: 'x',
    });
    retained!.metadata.name = 'External';
    expect(engine.state.metadata.name).toBe('Valid');
    const bad = capability();
    bad.id = 'bad';
    bad.commands.RENAME!.apply = (draft) => {
      draft.metadata.name = '';
      return 'ok';
    };
    engine.capabilities.register(bad);
    const before = engine.state;
    expect(() =>
      engine.commands.execute({ type: 'plugin:bad:RENAME', input: 'x' }),
    ).toThrow();
    expect(engine.state).toBe(before);
    const badOutput = capability();
    badOutput.id = 'bad-output';
    badOutput.commands.RENAME!.apply = (draft) => {
      draft.metadata.name = 'Valid';
      return 42;
    };
    engine.capabilities.register(badOutput);
    expect(() =>
      engine.commands.execute({ type: 'plugin:bad-output:RENAME', input: 'x' }),
    ).toThrow();
    expect(engine.state).toBe(before);
  });
});
