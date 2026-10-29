import { describe, expect, it } from 'vitest';
import {
  addCategory,
  addSection,
  addSub,
  catalogConfigSchema,
  emptyConfig,
  mergeTaxonomy,
  moveNode,
  patchNode,
  removeNode,
} from '../../src/library-client/taxonomy';

describe('[FIX7-016] library taxonomy: category → sub-category → section', () => {
  it('[FIX7-016] adds a category, a sub-category and a section; the merged tree lists them', () => {
    let config = emptyConfig();
    let tree = mergeTaxonomy(config);
    const cat = addCategory(config, tree, { en: 'Festivals', hi: 'त्योहार' });
    config = cat.config;
    tree = mergeTaxonomy(config);
    const sub = addSub(config, tree, cat.id, { en: 'Diwali', hi: 'दिवाली' });
    config = sub.config;
    tree = mergeTaxonomy(config);
    const sec = addSection(config, tree, cat.id, sub.id, {
      en: 'Lamps',
      hi: 'दीपक',
    });
    config = sec.config;
    tree = mergeTaxonomy(config);
    const found = tree.find((c) => c.id === cat.id)!;
    expect(found.subs[0]!.id).toBe('diwali');
    expect(found.subs[0]!.sections[0]!.id).toBe('lamps');
    expect(catalogConfigSchema.safeParse(config).success).toBe(true);
  });
  it('[FIX7-016] adds a sub-category to an editor category and renames or hides built-in nodes', () => {
    let config = emptyConfig();
    let tree = mergeTaxonomy(config);
    config = addSub(config, tree, 'Elements', {
      en: 'Icons',
      hi: 'आइकन',
    }).config;
    tree = mergeTaxonomy(config);
    expect(
      tree.find((c) => c.id === 'Elements')!.subs.map((s) => s.id),
    ).toContain('icons');
    config = patchNode(
      config,
      tree,
      { category: 'Elements', sub: 'shapes' },
      { hidden: true, name: { en: 'Forms', hi: 'आकृतियाँ' } },
    );
    tree = mergeTaxonomy(config);
    const shapes = tree
      .find((c) => c.id === 'Elements')!
      .subs.find((s) => s.id === 'shapes')!;
    expect(shapes.hidden).toBe(true);
    expect(shapes.name.en).toBe('Forms');
    expect(shapes.sections.length).toBeGreaterThan(3);
  });
  it('[FIX7-016] re-orders siblings and refuses to delete the editor’s own nodes', () => {
    let config = emptyConfig();
    let tree = mergeTaxonomy(config);
    const before = tree.map((c) => c.id);
    config = moveNode(config, tree, { category: 'Text' }, -1);
    tree = mergeTaxonomy(config);
    expect(tree.map((c) => c.id).indexOf('Text')).toBe(
      before.indexOf('Text') - 1,
    );
    expect(() => removeNode(config, { category: 'Text' })).toThrow();
    expect(() =>
      removeNode(config, { category: 'Elements', sub: 'shapes' }),
    ).toThrow();
  });
});
