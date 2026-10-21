// FINAL3 T5 (Canva's Text tab): the default text styles ("Add a heading",
// "Add a subheading", "Add a little bit of body text"), 24 font
// combinations built in code (12 English, 12 Hindi in Devanagari fonts) and
// "My text styles", a styled text the user saved (kept in this browser).
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

type Combo = readonly [
  id: string,
  name: string,
  title: readonly [font: string, text: string, weight?: 400 | 600 | 700],
  subtitle: readonly [font: string, text: string, weight?: 400 | 600 | 700],
  label?: readonly [font: string, text: string],
  extra?: Partial<Element>,
];
const ENGLISH: readonly Combo[] = [
  [
    'news',
    'Playfair and Inter',
    ['Playfair Display', 'Big news', 700],
    ['Inter', 'Tell everyone what is new'],
  ],
  [
    'launch',
    'Bebas and Montserrat',
    ['Bebas Neue', 'LAUNCH DAY'],
    ['Montserrat', 'Friday · 10 am', 600],
    ['Montserrat', 'Join us live'],
  ],
  [
    'script',
    'Pacifico and Poppins',
    ['Pacifico', 'Summer vibes'],
    ['Poppins', 'Sale ends Sunday', 600],
  ],
  [
    'classic',
    'Cinzel and Cormorant',
    ['Cinzel', 'THE GRAND OPENING', 700],
    ['Cormorant Garamond', 'An evening to remember'],
  ],
  [
    'bold',
    'Anton and Work Sans',
    ['Anton', 'GO BIGGER'],
    ['Work Sans', 'Train every day', 600],
  ],
  [
    'editorial',
    'Abril and Lato',
    ['Abril Fatface', 'The Weekly'],
    ['Lato', 'Stories worth your time'],
    ['Lato', 'Issue 12'],
  ],
  [
    'code',
    'Space Mono and Plex Mono',
    ['Space Mono', 'hello, world', 700],
    ['IBM Plex Mono', 'Learn to code in 30 days'],
  ],
  [
    'friendly',
    'Righteous and Nunito',
    ['Righteous', 'Game night'],
    ['Nunito', 'Snacks, friends and fun', 600],
  ],
  [
    'modern',
    'DM Serif and DM Sans',
    ['DM Serif Display', 'Design matters'],
    ['DM Sans', 'Simple ideas, well made'],
  ],
  [
    'note',
    'Caveat and Raleway',
    ['Caveat', 'Thank you!', 700],
    ['Raleway', 'From all of us at the studio'],
  ],
  [
    'report',
    'Oswald and Roboto',
    ['Oswald', 'QUARTERLY REPORT', 600],
    ['Roboto', 'Results at a glance'],
    ['Roboto', 'Q3 2026'],
  ],
  [
    'lesson',
    'Merriweather and Open Sans',
    ['Merriweather', 'Lesson 1', 700],
    ['Open Sans', 'Fractions made easy', 600],
  ],
];
const HINDI: readonly Combo[] = [
  [
    'hi-news',
    'Rozha One and Hind',
    ['Rozha One', 'बड़ी ख़बर'],
    ['Hind', 'सबको बताएँ क्या नया है'],
  ],
  [
    'hi-festival',
    'Yatra One and Mukta',
    ['Yatra One', 'दिवाली मुबारक'],
    ['Mukta', 'रोशनी और खुशियों का त्योहार', 600],
  ],
  [
    'hi-classic',
    'Noto Serif and Noto Sans',
    ['Noto Serif Devanagari', 'कहानी का सफ़र', 700],
    ['Noto Sans Devanagari', 'हर शब्द में एक दुनिया'],
  ],
  [
    'hi-poem',
    'Tiro and Hind',
    ['Tiro Devanagari Hindi', 'कविता की शाम'],
    ['Hind', 'शनिवार, शाम 7 बजे'],
    ['Hind', 'सबका स्वागत है'],
  ],
  [
    'hi-lesson',
    'Martel and Mukta',
    ['Martel', 'पाठ 1', 700],
    ['Mukta', 'भिन्न को आसानी से समझें'],
  ],
  [
    'hi-note',
    'Kalam and Poppins',
    ['Kalam', 'धन्यवाद!', 700],
    ['Poppins', 'आपके साथ के लिए'],
  ],
  [
    'hi-sport',
    'Teko and Rajdhani',
    ['Teko', 'खेल महोत्सव', 600],
    ['Rajdhani', 'रविवार सुबह 8 बजे', 600],
  ],
  [
    'hi-tech',
    'Khand and Yantramanav',
    ['Khand', 'नई तकनीक', 700],
    ['Yantramanav', 'आज से सबके लिए'],
  ],
  [
    'hi-sale',
    'Poppins and Noto Sans',
    ['Poppins', 'महा सेल', 700],
    ['Noto Sans Devanagari', '50% तक की छूट'],
    ['Noto Sans Devanagari', 'सिर्फ़ इस हफ़्ते'],
  ],
  [
    'hi-simple',
    'Hind bold and Hind',
    ['Hind', 'स्वागत है', 700],
    ['Hind', 'हमारे चैनल पर'],
  ],
  [
    'hi-wedding',
    'Rozha One and Martel',
    ['Rozha One', 'शुभ विवाह'],
    ['Martel', 'आप सादर आमंत्रित हैं'],
  ],
  [
    'hi-story',
    'Yatra One and Kalam',
    ['Yatra One', 'आज की कहानी'],
    ['Kalam', 'एक छोटे गाँव से'],
  ],
];
const combo = (
  [id, name, title, subtitle, label, extra]: Combo,
  hindi: boolean,
): TextItem => {
  const elements: Element[] = [
    line(0, 0.09, title[1], title[1], {
      font: title[0],
      ...(title[2] ? { weight: title[2] } : {}),
      ...extra,
    }),
    line(0.13, 0.04, subtitle[1], subtitle[1], {
      font: subtitle[0],
      color: '#4b5263',
      ...(subtitle[2] ? { weight: subtitle[2] } : {}),
    }),
  ];
  if (label)
    elements.push(
      line(0.2, 0.028, label[1], label[1], {
        font: label[0],
        color: '#7c5cff',
        weight: 600,
        letterSpacing: 2,
      }),
    );
  return {
    id: `combo-${id}`,
    type: 'text',
    name: { en: hindi ? `Hindi: ${name}` : name, hi: hindi ? name : name },
    tags: ['combination', hindi ? 'hindi' : 'english', title[0], subtitle[0]],
    section: 'combinations',
    data: { elements },
  };
};
/** 24 combinations: 12 English and 12 Hindi (Devanagari fonts). */
export const FONT_COMBINATIONS: readonly TextItem[] = [
  ...ENGLISH.map((item) => combo(item, false)),
  ...HINDI.map((item) => combo(item, true)),
];
/** Combinations in the UI language's order (Hindi first in Hindi). */
export function combinationsFor(language: string): readonly TextItem[] {
  const hindi = FONT_COMBINATIONS.filter((item) => item.tags.includes('hindi'));
  const english = FONT_COMBINATIONS.filter((item) =>
    item.tags.includes('english'),
  );
  return language === 'hi' ? [...hindi, ...english] : [...english, ...hindi];
}

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
