import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EditorEngine, deserializeProject, type Command } from '../src/core';
import {
  BUILT_IN_THEMES,
  applyThemeCommands,
  decodeTheme,
  encodeTheme,
  projectThemes,
  withPaletteSlots,
  type Theme,
  type ThemeScene,
} from '../src/themes/themes';

const engine = () =>
  new EditorEngine(
    deserializeProject(
      readFileSync('tests/fixtures/projects/h1-rotated.json', 'utf8'),
    ),
  );
const theme = (id: string) => BUILT_IN_THEMES.find((item) => item.id === id)!;
const scenes = (e: EditorEngine) =>
  e.state.compositions as unknown as ThemeScene[];
const apply = (
  e: EditorEngine,
  next: Theme,
  previous: Theme | null,
  override = false,
) =>
  e.commands.transaction(
    'Apply theme',
    applyThemeCommands(scenes(e), next, {
      previous,
      override,
    }) as unknown as Command[],
  );
type AnyLayer = {
  id: string;
  type: string;
  properties: Record<string, { value: unknown } | undefined>;
  children: AnyLayer[];
};
const all = (e: EditorEngine): AnyLayer[] => {
  const out: AnyLayer[] = [];
  const visit = (layers: AnyLayer[]) => {
    for (const layer of layers) {
      out.push(layer);
      visit(layer.children);
    }
  };
  visit(e.state.compositions[0]!.layers as unknown as AnyLayer[]);
  return out;
};

describe('[QT-017][QT-018] themes', () => {
  it('ships 8 built-in themes that round-trip through a marker label under 256 characters', () => {
    expect(BUILT_IN_THEMES).toHaveLength(8);
    for (const item of BUILT_IN_THEMES) {
      const label = encodeTheme(item);
      expect(label.length).toBeLessThanOrEqual(256);
      expect(decodeTheme(label)).toEqual(item);
    }
  });
  it('applies colours, fonts and the background in one step; undo and redo restore it', () => {
    const e = engine();
    const before = JSON.stringify(e.state);
    const neon = theme('dark-neon');
    apply(e, neon, null);
    expect(e.state.compositions[0]!.backgroundColor).toBe(
      neon.palette.background,
    );
    const texts = all(e).filter((layer) => layer.type === 'text');
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text.properties.fill?.value).toBe(neon.palette.text);
      expect([neon.fonts.heading, neon.fonts.body]).toContain(
        text.properties.fontFamily?.value,
      );
    }
    expect(projectThemes(e.state.compositions[0]!.markers).current).toBe(
      'dark-neon',
    );
    // Reserved markers never set a scene's length.
    expect(e.state.compositions[0]!.duration).toBe(
      deserializeProject(before).compositions[0]!.duration,
    );
    e.undo();
    expect(JSON.stringify(e.state)).toBe(before);
    e.redo();
    expect(e.state.compositions[0]!.backgroundColor).toBe(
      neon.palette.background,
    );
  });
});

describe('[QT-019] palette slots', () => {
  it('a theme switch recolours slot layers and keeps manual colours unless overridden', () => {
    const e = engine();
    const neon = theme('dark-neon'),
      warm = theme('warm-story');
    apply(e, neon, null);
    // A manual colour on one text layer.
    const text = all(e).find((layer) => layer.type === 'text')!;
    e.commands.transaction('Colour', [
      {
        type: 'SET_PROPERTY',
        compositionId: e.state.compositions[0]!.id,
        layerId: text.id,
        target: { kind: 'property', key: 'fill' },
        property: {
          type: 'color',
          value: '#123456',
          animated: false,
          keyframes: [],
          constraints: [],
        },
      } as Command,
      {
        type: 'SET_PROPERTY',
        compositionId: e.state.compositions[0]!.id,
        layerId: text.id,
        target: { kind: 'property', key: 'paletteSlot' },
        property: {
          type: 'string',
          value: 'accent',
          animated: false,
          keyframes: [],
          constraints: [],
        },
      } as Command,
    ]);
    // A shape with a slot follows the theme; one without keeps its fill.
    const shapes = all(e).filter((layer) => layer.type === 'shape');
    const plainFill = shapes[0]!.properties.fill?.value;
    apply(e, warm, neon);
    const after = all(e);
    expect(
      after.find((layer) => layer.id === text.id)!.properties.fill?.value,
    ).toBe('#123456');
    expect(
      after.find((layer) => layer.id === shapes[0]!.id)!.properties.fill?.value,
    ).toBe(plainFill);
    apply(e, neon, warm, true);
    expect(
      all(e).find((layer) => layer.id === shapes[0]!.id)!.properties.fill
        ?.value,
    ).toBe(neon.palette.primary);
  });
  it('AI items get slots: backgrounds, text and shapes', () => {
    const layer = (type: string, children: AnyLayer[] = [], role?: string) =>
      ({
        id: type,
        type,
        properties: {
          fill: { type: 'color', value: '#000000' },
          ...(role ? { role: { type: 'string', value: role } } : {}),
        },
        children,
      }) as unknown as AnyLayer & { properties: Record<string, unknown> };
    const slotted = withPaletteSlots(
      layer('group', [layer('shape'), layer('text')], 'background') as never,
    ) as unknown as AnyLayer;
    expect(
      slotted.children.map((child) => child.properties.paletteSlot?.value),
    ).toEqual(['background', 'text']);
    expect(
      (withPaletteSlots(layer('shape') as never) as unknown as AnyLayer)
        .properties.paletteSlot?.value,
    ).toBe('primary');
  });
});
