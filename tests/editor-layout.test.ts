// FIX6-010: the left rail is read from a layout object.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EDITOR_LAYOUT,
  RAIL_CATEGORY_IDS,
  railCategories,
  railIcon,
  resolveEditorLayout,
} from '../src/ui/editor-layout';

describe('[FIX6-010] editor layout', () => {
  it('the default shows every category in the shipped order', () => {
    expect(railCategories(DEFAULT_EDITOR_LAYOUT)).toEqual([
      ...RAIL_CATEGORY_IDS,
    ]);
    expect(railIcon(DEFAULT_EDITOR_LAYOUT, 'Media')).toBe('media');
  });
  it('a valid layout can hide and reorder categories', () => {
    const layout = resolveEditorLayout({
      version: 1,
      id: 'simple',
      rail: [
        { id: 'Media', icon: 'media' },
        { id: 'Text', icon: 'text' },
        { id: 'AI', icon: 'magic', visible: false },
      ],
    });
    expect(layout.id).toBe('simple');
    expect(railCategories(layout)).toEqual(['Media', 'Text']);
  });
  it('an invalid layout (unknown category, duplicates, nothing visible, extra fields) gives the default', () => {
    const bad = [
      { version: 1, id: 'x', rail: [{ id: 'Nope', icon: 'a' }] },
      {
        version: 1,
        id: 'x',
        rail: [
          { id: 'Text', icon: 'a' },
          { id: 'Text', icon: 'b' },
        ],
      },
      {
        version: 1,
        id: 'x',
        rail: [{ id: 'Text', icon: 'a', visible: false }],
      },
      { version: 1, id: 'x', rail: [{ id: 'Text', icon: 'a', script: 'x()' }] },
      'text',
      null,
    ];
    for (const value of bad)
      expect(resolveEditorLayout(value)).toBe(DEFAULT_EDITOR_LAYOUT);
  });
});
