// FINAL3 T5 (Canva's Text tab): the default text styles ("Add a heading",
// "Add a subheading", "Add a little bit of body text") and "My text
// styles", a styled text the user saved (kept in this browser). The 24 font
// combinations are catalog items now (Phase 1 library).
// Library items insert like any library text: auto width, centred, one undo
// step; a saved style is the whole text layer (effects, gradient and all).
import type { LibraryItem } from '../library/schema';
import type { Layer } from '../core';
import type { SceneLayer } from '../render/adapter';

type TextItem = Extract<LibraryItem, { type: 'text' }>;
type Element = TextItem['data']['elements'][number];
const line = (
  y: number,
  size: number,
  en: string,
  hi: string,
  extra: Partial<Element> = {},
): Element => ({
  kind: 'text',
  x: 0,
  y,
  w: 0.8,
  h: size * 1.4,
  text: { en, hi },
  size,
  color: '#1f2433',
  align: 'center',
  ...extra,
});

/** FINAL3 T5: heading about 8 % of the canvas height, then smaller. */
export const DEFAULT_TEXT_ITEMS: readonly TextItem[] = [
  {
    id: 'text-add-heading',
    type: 'text',
    name: { en: 'Add a heading', hi: 'शीर्षक जोड़ें' },
    tags: ['heading', 'title'],
    section: 'default-styles',
    data: {
      elements: [
        line(0, 0.08, 'Add a heading', 'शीर्षक जोड़ें', {
          weight: 700,
          font: 'Inter',
        }),
      ],
    },
  },
  {
    id: 'text-add-subheading',
    type: 'text',
    name: { en: 'Add a subheading', hi: 'उपशीर्षक जोड़ें' },
    tags: ['subheading'],
    section: 'default-styles',
    data: {
      elements: [
        line(0, 0.05, 'Add a subheading', 'उपशीर्षक जोड़ें', {
          weight: 600,
          font: 'Inter',
        }),
      ],
    },
  },
  {
    id: 'text-add-body',
    type: 'text',
    name: {
      en: 'Add a little bit of body text',
      hi: 'थोड़ा सा मुख्य टेक्स्ट जोड़ें',
    },
    tags: ['body', 'paragraph'],
    section: 'default-styles',
    data: {
      elements: [
        line(
          0,
          0.03,
          'Add a little bit of body text',
          'थोड़ा सा मुख्य टेक्स्ट जोड़ें',
          { weight: 400, font: 'Inter' },
        ),
      ],
    },
  },
];

// Phase 1 library (P1-09): the 24 font combinations moved to the catalog
// (library/seed/text-combinations.ts, the Text index).

// --- My text styles --------------------------------------------------------
export const MY_TEXT_STYLES_KEY = 'aive.textStyles';
export interface MyTextStyle {
  readonly id: string;
  readonly name: string;
  /** The text layer as saved (its properties and transform). */
  readonly layer: Layer;
}
const listeners = new Set<() => void>();
export const onMyTextStylesChange = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function myTextStyles(): MyTextStyle[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MY_TEXT_STYLES_KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter(
          (item): item is MyTextStyle =>
            !!item &&
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            item.layer?.type === 'text',
        )
      : [];
  } catch {
    return [];
  }
}
/** Saves a styled text (at most 40 kept, newest first). */
export function saveMyTextStyle(layer: SceneLayer, name: string): MyTextStyle {
  const style: MyTextStyle = {
    id: `style-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.slice(0, 60) || 'My text style',
    layer: {
      ...(JSON.parse(JSON.stringify(layer)) as Layer),
      children: [],
    },
  };
  try {
    localStorage.setItem(
      MY_TEXT_STYLES_KEY,
      JSON.stringify([style, ...myTextStyles()].slice(0, 40)),
    );
  } catch {
    throw new Error('This browser blocked saving the text style');
  }
  listeners.forEach((listener) => listener());
  return style;
}
export function deleteMyTextStyle(id: string): void {
  try {
    localStorage.setItem(
      MY_TEXT_STYLES_KEY,
      JSON.stringify(myTextStyles().filter((item) => item.id !== id)),
    );
  } catch {
    /* Storage blocked: nothing to remove. */
  }
  listeners.forEach((listener) => listener());
}
