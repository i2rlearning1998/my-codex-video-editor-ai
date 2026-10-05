import { effect } from './definition';
import { compileGrade } from './grade';
import type { Grade } from './grade';
const looks: readonly [string, string, Grade][] = [
  [
    'retro',
    'Retro',
    {
      contrast: 0.9,
      saturation: 0.75,
      lift: 0.07,
      warm: 0.5,
      shadows: [-15, 8, 25],
    },
  ],
  [
    'orange-teal',
    'Orange and teal',
    {
      contrast: 1.12,
      saturation: 1.1,
      shadows: [-70, 30, 45],
      highlights: [80, 20, -50],
      tone: 0.4,
    },
  ],
  [
    'bold-blue',
    'Bold and blue',
    { contrast: 1.3, saturation: 1.25, warm: -0.6, shadows: [-30, -5, 60] },
  ],
  [
    'golden-hour',
    'Golden hour',
    { gamma: 1.08, warm: 1, highlights: [70, 30, -40], tone: 0.35 },
  ],
  [
    'vibrant-vlogger',
    'Vibrant vlogger',
    { exposure: 0.15, saturation: 1.4, contrast: 1.08 },
  ],
  [
    'purple-undertone',
    'Purple undertone',
    { tint: 0.75, shadows: [40, -30, 70], tone: 0.35 },
  ],
  [
    'winter-sunset',
    'Winter sunset',
    { warm: -0.4, shadows: [-20, 0, 70], highlights: [80, 15, 0], tone: 0.4 },
  ],
  [
    '35mm',
    '35mm',
    {
      contrast: 1.08,
      saturation: 0.86,
      lift: 0.025,
      warm: 0.2,
      vignette: 0.16,
      grain: 12,
    },
  ],
  ['contrast', 'Contrast', { contrast: 1.4 }],
  [
    'fall',
    'Fall',
    { saturation: 1.12, warm: 0.8, shadows: [50, 8, -40], tone: 0.25 },
  ],
  ['winter', 'Winter', { warm: -0.9, saturation: 0.78, exposure: 0.12 }],
  [
    'old-western',
    'Old western',
    { saturation: 0.18, warm: 1.15, contrast: 1.1, vignette: 0.3, grain: 7 },
  ],
  [
    'warm-coastline',
    'Warm coastline',
    { gamma: 1.12, saturation: 0.95, warm: 0.6, highlights: [15, 30, 20] },
  ],
  [
    'cool-coastline',
    'Cool coastline',
    { gamma: 1.1, saturation: 1.1, warm: -0.65, shadows: [-20, 35, 35] },
  ],
  [
    'warm-countryside',
    'Warm countryside',
    { contrast: 1.08, warm: 0.55, saturation: 1.2, shadows: [5, 40, -15] },
  ],
  [
    'cool-countryside',
    'Cool countryside',
    { contrast: 1.08, warm: -0.5, saturation: 1.05, shadows: [-15, 30, 15] },
  ],
  ['golden', 'Golden', { warm: 1.25, tint: -0.25, saturation: 1.05 }],
  [
    'dreamscape',
    'Dreamscape',
    {
      gamma: 1.2,
      lift: 0.07,
      saturation: 0.82,
      tint: 0.45,
      highlights: [40, 0, 50],
    },
  ],
  [
    'sunrise',
    'Sunrise',
    {
      exposure: 0.12,
      warm: 0.7,
      highlights: [55, 12, -10],
      shadows: [25, -12, 35],
      tone: 0.35,
    },
  ],
  ['warm-tone', 'Warm tone', { warm: 0.75 }],
  ['cool-tone', 'Cool tone', { warm: -0.75 }],
  [
    'pastel-dreams',
    'Pastel dreams',
    { contrast: 0.78, saturation: 0.68, lift: 0.045, tint: 0.3 },
  ],
  [
    'scenery',
    'Scenery',
    { contrast: 1.15, saturation: 1.28, shadows: [-10, 20, 15] },
  ],
  [
    'portrait',
    'Portrait',
    { contrast: 0.95, saturation: 0.9, gamma: 1.07, warm: 0.25 },
  ],
  ['indoors', 'Indoors', { exposure: 0.18, warm: -0.25, gamma: 1.05 }],
  ['outdoors', 'Outdoors', { contrast: 1.08, saturation: 1.15, warm: 0.15 }],
  ['muted', 'Muted', { saturation: 0.38, contrast: 0.88, lift: 0.035 }],
  ['black-white', 'Black and white', { saturation: 0 }],
  ['soft-bw', 'Soft B&W', { saturation: 0, contrast: 0.78, lift: 0.04 }],
  ['muted-bw', 'Muted B&W', { saturation: 0, contrast: 0.94, lift: 0.09 }],
  [
    'gloomy',
    'Gloomy',
    { saturation: 0.45, exposure: -0.35, warm: -0.3, vignette: 0.24 },
  ],
  [
    'deep-fried',
    'Deep fried',
    { contrast: 2.3, saturation: 2.3, exposure: 0.25, warm: 0.7 },
  ],
  [
    'euphoric',
    'Euphoric',
    { saturation: 1.65, tint: 0.4, contrast: 1.15, highlights: [35, 0, 45] },
  ],
];
export const filters = [
  effect(
    'filter.none',
    'None',
    'Filters',
    (s, d) => d.data.set(s.data),
    [],
    'preserve',
    'filter',
  ),
  ...looks.map(([id, name, g]) => {
    const run = compileGrade(g);
    return effect(
      'filter.' + id,
      name,
      'Filters',
      (s, d, _p, c) => run(s, d, c),
      [],
      'preserve',
      'filter',
    );
  }),
];
const duos: readonly [string, string, readonly number[], readonly number[]][] =
  [
    ['yellow-orange', 'Yellow–orange', [126, 47, 16], [255, 234, 80]],
    ['pink-purple', 'Pink–purple', [66, 24, 111], [251, 161, 208]],
    ['blue-pink', 'Blue–pink', [20, 55, 132], [255, 172, 201]],
    ['green-blue', 'Green–blue', [12, 55, 112], [110, 229, 151]],
  ];
for (const [id, name, shadow, high] of duos)
  filters.push(
    effect(
      'filter.duotone-' + id,
      name,
      'Duotones',
      (s, d) => {
        for (let i = 0; i < s.data.length; i += 4) {
          const l =
            (0.2126 * s.data[i]! +
              0.7152 * s.data[i + 1]! +
              0.0722 * s.data[i + 2]!) /
            255;
          for (let c = 0; c < 3; c++)
            d.data[i + c] = shadow[c]! + (high[c]! - shadow[c]!) * l;
        }
      },
      [],
      'preserve',
      'filter',
    ),
  );
const overlays: readonly [string, readonly number[]][] = [
  ['white', [255, 255, 255]],
  ['black', [0, 0, 0]],
  ['yellow', [255, 224, 20]],
  ['orange', [245, 132, 32]],
  ['red', [231, 42, 56]],
  ['pink', [244, 107, 176]],
  ['purple', [140, 79, 211]],
  ['blue', [47, 120, 227]],
  ['green', [61, 174, 104]],
];
for (const [id, rgb] of overlays)
  filters.push(
    effect(
      'filter.overlay-' + id,
      id[0]!.toUpperCase() + id.slice(1),
      'Colour overlays',
      (s, d) => {
        for (let i = 0; i < s.data.length; i += 4)
          for (let c = 0; c < 3; c++)
            d.data[i + c] = s.data[i + c]! * 0.55 + rgb[c]! * 0.45;
      },
      [],
      'preserve',
      'filter',
    ),
  );
