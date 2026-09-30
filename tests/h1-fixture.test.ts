import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createComposition,
  createLayer,
  number,
  serializeProject,
  validateProject,
  vector2,
  SCHEMA_VERSION,
  type Layer,
  type Property,
} from '../src/core';

// H1.2: one object of every kind, each alone in a 427x360 cell of a
// 1280x720 canvas, for the rotated-resize proofs. Pictures have no media
// bytes, so they draw as flat placeholders.
const FILE = 'tests/fixtures/projects/h1-rotated.json';
const property = (type: 'color' | 'string', value: string): Property =>
  ({ type, value, animated: false, keyframes: [], constraints: [] }) as never;

function box(
  id: string,
  type: Layer['type'],
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Record<string, Property> = {},
): Layer {
  const layer = createLayer(id, type, id, 5);
  layer.transform.position = vector2(x, y);
  layer.properties = { width: number(width), height: number(height), ...extra };
  return layer;
}
const fill = (value: string) => ({ fill: property('color', value) });

export function buildH1Project() {
  const composition = createComposition({
    id: 'h1-composition',
    name: 'H1 rotated',
    width: 1280,
    height: 720,
    duration: 5,
  });
  const group = createLayer('h1-group', 'group', 'h1-group', 5);
  group.transform.position = vector2(1060 - 80, 180 - 45);
  group.children = [
    box('h1-group-a', 'shape', 0, 0, 90, 60, fill('#30a060')),
    box('h1-group-b', 'shape', 70, 30, 90, 60, fill('#a030a0')),
  ];
  const outer = createLayer('h1-outer', 'group', 'h1-outer', 5);
  outer.transform.position = vector2(640, 540);
  outer.transform.rotation = number(12);
  const nested = createLayer('h1-nested', 'group', 'h1-nested', 5);
  nested.transform.position = vector2(-80, -45);
  nested.children = [
    box('h1-nested-a', 'shape', 0, 0, 160, 90, fill('#d9e38e')),
    box('h1-nested-b', 'text', 20, 20, 120, 40, {
      ...fill('#242b24'),
      text: property('string', 'NEST'),
      fontSize: number(28),
    }),
  ];
  outer.children = [nested];
  const flipped = box('h1-flip', 'shape', 1060 + 80, 540 - 45, 160, 90, {
    ...fill('#e07020'),
  });
  flipped.transform.scale = vector2(-1, 1);
  composition.layers = [
    box('h1-rect', 'shape', 213 - 80, 180 - 45, 160, 90, fill('#e04040')),
    box('h1-text', 'text', 640 - 80, 180 - 30, 160, 60, {
      ...fill('#222222'),
      text: property('string', 'Rotate'),
      fontSize: number(36),
    }),
    group,
    box('h1-image', 'image', 213 - 80, 540 - 45, 160, 90, fill('#d0a020')),
    outer,
    flipped,
  ];
  composition.layers.find((layer) => layer.id === 'h1-image')!.assetId =
    'h1-image-asset';
  return validateProject({
    schemaVersion: SCHEMA_VERSION,
    id: 'h1-rotated',
    metadata: {
      name: 'H1 rotated',
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    },
    settings: { backgroundColor: '#f0eee7', audioSampleRate: 48000 },
    compositions: [composition],
    assets: [
      {
        id: 'h1-image-asset',
        name: 'Photo',
        type: 'image',
        source: { kind: 'local', reference: 'media/h1-missing-image' },
        metadata: {},
        duration: 5,
      },
    ],
  });
}

describe('H1 fixture', () => {
  it('[CV-049] h1-rotated.json is the validated project built here', () => {
    const text = `${serializeProject(buildH1Project())}\n`;
    if (process.env.UPDATE_FIXTURES) writeFileSync(FILE, text);
    expect(text).toBe(readFileSync(FILE, 'utf8'));
  });
});
