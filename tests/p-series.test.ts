import { describe, expect, it } from 'vitest';
import { INDEX_LIMIT, libraryIndex } from '../src/ui/library-index';
import {
  editedManually,
  presetCommands,
  presetGroups,
  readPresets,
} from '../src/ui/creator-presets';
import { readFileSync } from 'node:fs';

const base = {
  canvas: { width: 1920, height: 1080, fps: 30000 / 1001 },
  fonts: ['Inter'],
  animate: { in: ['fade'] },
  fx: { filters: ['filter.sepia'] },
  blocks: [
    { id: 'counter', name: 'Counter', kind: 'block', controls: ['from'] },
  ],
};
describe('P4 library index', () => {
  it('lists ids, names, tags, kinds and controls in full when small', () => {
    const text = libraryIndex({
      ...base,
      groups: [
        {
          title: 'Built-in library',
          items: [
            { id: 'shape-star', name: 'Star', kind: 'shape', tags: ['star'] },
          ],
        },
      ],
    });
    expect(text).toContain('canvas: 1920x1080 at 29.97 fps');
    expect(text).toContain('shape shape-star "Star" | tags: star');
    expect(text).toContain('block counter "Counter" | controls: from');
  });
  it('stays under 40 KB by grouping with names only, then cutting', () => {
    const items = Array.from({ length: 5000 }, (_, i) => ({
      id: `item-${i}`,
      name: `A long item name number ${i}`,
      kind: i % 2 ? 'shape' : 'text',
      tags: ['one', 'two', 'three'],
      controls: ['size', 'colour'],
    }));
    const text = libraryIndex({ ...base, groups: [{ title: 'Pack', items }] });
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(
      INDEX_LIMIT,
    );
    expect(text).toContain('names only');
    expect(text).toMatch(/\.\.\. \d+ more/);
  });
});

describe('P3 presets as keyframes', () => {
  const pack = JSON.parse(
    readFileSync('examples/creator-packs/move-preset.json', 'utf8'),
  ) as { items: { data: never }[] };
  const preset = pack.items[0]!.data;
  const property = (value: unknown) => ({
    type: Array.isArray(value) ? 'vector2' : 'number',
    value,
    animated: false,
    keyframes: [],
    constraints: [],
  });
  const layer = {
    id: 'a',
    type: 'shape',
    startTime: 0,
    transform: {
      position: property([100, 200]),
      scale: property([1, 1]),
      rotation: property(0),
      opacity: property(1),
    },
    properties: {},
    children: [],
  } as never;
  const composition = {
    id: 'c',
    width: 1000,
    height: 500,
    tracks: [{ clips: [{ layerId: 'a', startTime: 2 }] }],
  } as never;
  it('groups controls under the transforms the preset animates only', () => {
    const groups = presetGroups(preset);
    expect(groups.groups.map((group) => group.group)).toEqual(['move']);
    expect(groups.advanced.map((control) => control.name)).toEqual([
      'duration',
      'delay',
      'easing',
    ]);
  });
  it('writes offsets from the resting position from the clip start', () => {
    const commands = presetCommands(composition, layer, {
      id: 'p--move',
      name: 'Move',
      preset,
      params: { distance: 0.5 },
    }) as {
      target: { key: string };
      property: { keyframes: unknown[]; value: string };
    }[];
    expect(commands.map((command) => command.target.key)).toEqual([
      'position',
      'preset',
    ]);
    expect(commands[0]!.property.keyframes).toEqual([
      { time: 2, value: [100, 200] },
      { time: 3, value: [600, 200] },
    ]);
    // Applied, the record reads back and the keyframes match it.
    const applied = {
      ...(layer as object),
      transform: {
        ...(layer as { transform: object }).transform,
        position: { ...commands[0]!.property, type: 'vector2', animated: true },
      },
      properties: { preset: commands[1]!.property },
    } as never;
    const [record] = readPresets(applied);
    expect(record!.params).toEqual({ distance: 0.5 });
    expect(editedManually(applied, record!)).toBe(false);
    const edited = {
      ...(applied as object),
      transform: {
        ...(applied as { transform: object }).transform,
        position: {
          ...commands[0]!.property,
          type: 'vector2',
          animated: true,
          keyframes: [
            { time: 2, value: [100, 200] },
            { time: 3, value: [650, 200] },
          ],
        },
      },
    } as never;
    expect(editedManually(edited, record!)).toBe(true);
  });
});
