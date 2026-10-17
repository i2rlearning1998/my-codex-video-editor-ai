import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { libraryItemSchema, type LibraryItem } from '../../src/library/schema';
import { buildProjectFromComposition } from '../../src/composition';
import { BUILT_IN_THEMES } from '../../src/themes/themes';

const read = () =>
  JSON.parse(
    readFileSync('tests/fixtures/compositions/logo-reveal.json', 'utf8'),
  ) as unknown;
const items = new Map<string, LibraryItem>();
for (const raw of (
  JSON.parse(readFileSync('public/library/index.json', 'utf8')) as {
    items: unknown[];
  }
).items) {
  const parsed = libraryItemSchema.safeParse(raw);
  if (parsed.success) items.set(parsed.data.id, parsed.data);
}
const library = (id: string) => items.get(id);

describe('[FINAL1] composition decisions', () => {
  it('a theme keeps the text colours the composition set', async () => {
    const theme = BUILT_IN_THEMES[1]!;
    const { project } = await buildProjectFromComposition(read(), { theme });
    const tagline = project!.compositions[0]!.layers.find(
      (l) => l.name === 'Tagline',
    )!;
    expect(tagline.properties.fill!.value).toBe('#ffffff');
    expect(tagline.properties.manualColor_fill!.value).toBe(true);
    expect(theme.palette.text).not.toBe('#ffffff');
    expect(project!.compositions[0]!.backgroundColor).toBe(
      theme.palette.background,
    );
  });
  it('replace: true puts a library fill in the slot place and timing', async () => {
    const build = (replace: boolean) =>
      buildProjectFromComposition(read(), {
        library,
        slotFills: {
          logo: { kind: 'library', id: 'shape-polygon-5', replace },
        },
      });
    const stack = async (replace: boolean) => {
      const layers = (await build(replace)).project!.compositions[0]!.layers;
      const index = (name: string) => layers.findIndex((l) => l.name === name);
      return { layers, logo: index('Pentagon'), tagline: index('Tagline') };
    };
    const placed = await stack(true);
    expect(placed.layers[placed.logo]).toMatchObject({
      startTime: 0.5,
      duration: 4.5,
    });
    expect(placed.logo).toBeLessThan(placed.tagline); // behind the tagline
    const onTop = await stack(false);
    expect(onTop.logo).toBeGreaterThan(onTop.tagline); // added on top
  });
});
