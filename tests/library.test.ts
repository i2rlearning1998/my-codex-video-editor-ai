import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLibrary } from '../src/library/schema';
import { formatGradient, parseGradient } from '../src/render/paint';
import { SYSTEM_FONTS } from '../src/render/text-style';

// H5: Starter Pack 1 (public/library/index.json) and gradient fills.
const manifest = parseLibrary(
  JSON.parse(readFileSync('public/library/index.json', 'utf8')),
);
const count = (type: string) =>
  manifest.items.filter((item) => item.type === type).length;

describe('H5 library manifest', () => {
  it('validates and holds the planned pack sizes', () => {
    expect(manifest.version).toBe(1);
    expect(count('shape')).toBeGreaterThanOrEqual(75);
    expect(count('background')).toBeGreaterThanOrEqual(38);
    expect(count('text')).toBeGreaterThanOrEqual(28);
    expect(count('template')).toBeGreaterThanOrEqual(12);
  });
  it('names every item in English and Hindi, with unique ids', () => {
    const ids = manifest.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of manifest.items) {
      expect(item.name.en.length).toBeGreaterThan(0);
      expect(item.name.hi).not.toBe('');
    }
  });
  it('keeps shapes inside their 100 × 100 box and uses only bundled fonts', () => {
    const fonts = new Set<string>(SYSTEM_FONTS.map(([name]) => name));
    for (const item of manifest.items) {
      if (item.type === 'shape')
        for (const polygon of item.data.polygons)
          for (const ring of polygon)
            for (const [x, y] of ring) {
              expect(x).toBeGreaterThanOrEqual(-0.01);
              expect(x).toBeLessThanOrEqual(100.01);
              expect(y).toBeGreaterThanOrEqual(-0.01);
              expect(y).toBeLessThanOrEqual(100.01);
            }
      const elements =
        item.type === 'shape'
          ? []
          : (item.data.elements as { kind: string; font?: string }[]);
      for (const element of elements)
        if (element.kind === 'text' && element.font)
          expect(fonts.has(element.font)).toBe(true);
    }
  });
  it('refuses a malformed manifest with a readable message', () => {
    expect(() => parseLibrary({ version: 1, pack: {}, items: [] })).toThrow(
      /Library manifest is invalid at pack/,
    );
    const duplicate = {
      ...manifest,
      items: [manifest.items[0], manifest.items[0]],
    };
    expect(() => parseLibrary(duplicate)).toThrow(/Duplicate library id/);
  });
});

describe('H5 gradient fills', () => {
  it('reads 2 to 4 valid stops and refuses anything else', () => {
    const gradient = {
      type: 'linear' as const,
      angle: 450,
      stops: [
        { offset: 1, color: '#ffffff' },
        { offset: 0, color: '#7C5CFF' },
      ],
    };
    const parsed = parseGradient(JSON.stringify(gradient))!;
    expect(parsed.angle).toBe(90);
    expect(parsed.stops.map((stop) => stop.offset)).toEqual([0, 1]);
    expect(parseGradient(formatGradient(parsed))).toEqual({
      ...parsed,
      stops: parsed.stops.map((stop) => ({
        ...stop,
        color: stop.color.toLowerCase(),
      })),
    });
    expect(parseGradient('')).toBeNull();
    expect(parseGradient('{')).toBeNull();
    expect(
      parseGradient(
        JSON.stringify({ ...gradient, stops: [gradient.stops[0]] }),
      ),
    ).toBeNull();
    expect(
      parseGradient(
        JSON.stringify({
          ...gradient,
          stops: [...gradient.stops, ...gradient.stops, gradient.stops[0]],
        }),
      ),
    ).toBeNull();
    expect(
      parseGradient(JSON.stringify({ ...gradient, type: 'conic' })),
    ).toBeNull();
  });
});
