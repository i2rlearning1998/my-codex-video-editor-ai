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

// G2: one layer of each kind, spaced apart on a 1280x720 canvas (the usual #f0eee7 paper), so an
// e2e test can measure each one's drawn pixels alone. Media bytes are not in
// the fixture, so pictures draw as their flat placeholder (their fill).
const FILE = 'tests/fixtures/projects/g2-types.json';
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
  layer.properties = {
    width: number(width),
    height: number(height),
    ...extra,
  };
  return layer;
}

export function buildG2Project() {
  const composition = createComposition({
    id: 'g2-composition',
    name: 'G2 types',
    width: 1280,
    height: 720,
    duration: 5,
  });
  const group = createLayer('g2-group', 'group', 'g2-group', 5);
  group.transform.position = vector2(500, 300);
  group.children = [
    box('g2-group-a', 'shape', 0, 0, 120, 80, {
      fill: property('color', '#30a060'),
    }),
    box('g2-group-b', 'shape', 140, 40, 120, 80, {
      fill: property('color', '#a030a0'),
    }),
  ];
  composition.layers = [
    box('g2-text', 'text', 60, 60, 360, 60, {
      fill: property('color', '#222222'),
      text: property('string', 'Glyph test'),
      fontSize: number(40),
    }),
    box('g2-rect', 'shape', 500, 60, 200, 120, {
      fill: property('color', '#e04040'),
    }),
    box('g2-line', 'shape', 820, 100, 240, 24, {
      shapeKind: property('string', 'line'),
      stroke: property('color', '#2040e0'),
      strokeWidth: number(8),
    }),
    // Pen stroke through (6,6), (146,76) and (286,16), 12 wide.
    box('g2-draw', 'shape', 60, 250, 292, 82, {
      path: property('string', '6 6 146 76 286 16'),
      brush: property('string', 'pen'),
      stroke: property('color', '#e07020'),
      strokeWidth: number(12),
    }),
    group,
    box('g2-image', 'image', 860, 300, 240, 135, {
      fill: property('color', '#d0a020'),
    }),
    box('g2-video', 'video', 60, 500, 240, 135, {
      fill: property('color', '#20a0d0'),
    }),
  ];
  composition.layers.find((layer) => layer.id === 'g2-image')!.assetId =
    'g2-image-asset';
  composition.layers.find((layer) => layer.id === 'g2-video')!.assetId =
    'g2-video-asset';
  return validateProject({
    schemaVersion: SCHEMA_VERSION,
    id: 'g2-types',
    metadata: {
      name: 'G2 types',
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
    },
    settings: { backgroundColor: '#f0eee7', audioSampleRate: 48000 },
    compositions: [composition],
    assets: [
      {
        id: 'g2-image-asset',
        name: 'Photo',
        type: 'image',
        source: { kind: 'local', reference: 'media/g2-missing-image' },
        metadata: {},
        duration: 5,
      },
      {
        id: 'g2-video-asset',
        name: 'Footage',
        type: 'video',
        source: { kind: 'local', reference: 'media/g2-missing-video' },
        metadata: {},
        duration: 5,
      },
    ],
  });
}

describe('G2 fixture', () => {
  it('[CV-044] g2-types.json is the validated project built here', () => {
    const text = `${serializeProject(buildG2Project())}\n`;
    if (process.env.UPDATE_FIXTURES) writeFileSync(FILE, text);
    expect(text).toBe(readFileSync(FILE, 'utf8'));
  });
});
