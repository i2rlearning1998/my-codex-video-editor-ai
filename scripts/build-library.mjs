#!/usr/bin/env node
// H5: generates Starter Pack 1 (public/library/index.json). Everything is
// original and made from code: shapes are polygons in a 100 × 100 box;
// backgrounds, text styles and templates are elements placed in fractions of
// the canvas. The output is deterministic (a seeded random source), so the
// file only changes when this script changes. Run: npm run library
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/library/index.json');

// --- helpers -----------------------------------------------------------------
let seed = 20260930;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const round = (value) => Math.round(value * 100) / 100;
const pt = (x, y) => [round(x), round(y)];
const circlePoints = (cx, cy, r, n = 48, start = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2;
    return pt(cx + r * Math.cos(a), cy + r * Math.sin(a));
  });
const ellipsePoints = (cx, cy, rx, ry, n = 48) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return pt(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  });
/** Scales a list of rings so they fill the 100 × 100 box. */
function fit(rings) {
  const all = rings.flat();
  const xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1]);
  const minX = Math.min(...xs),
    minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1,
    h = Math.max(...ys) - minY || 1;
  const s = 100 / Math.max(w, h);
  const ox = (100 - w * s) / 2,
    oy = (100 - h * s) / 2;
  return {
    rings: rings.map((ring) =>
      ring.map(([x, y]) => pt((x - minX) * s + ox, (y - minY) * s + oy)),
    ),
    aspect: w / h,
  };
}
const regular = (n, rotation = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => {
    const a = rotation + (i / n) * Math.PI * 2;
    return pt(50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a));
  });
const star = (n, inner) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? 50 * inner : 50;
    return pt(50 + r * Math.cos(a), 50 + r * Math.sin(a));
  });
function blob(points = 10, wobble = 0.22) {
  const radii = Array.from(
    { length: points },
    () => 1 - wobble + random() * wobble * 2,
  );
  return Array.from({ length: 72 }, (_, i) => {
    const t = (i / 72) * points;
    const k = Math.floor(t),
      f = t - k;
    const a = radii[k % points],
      b = radii[(k + 1) % points];
    const smooth = f * f * (3 - 2 * f);
    const r = 50 * (a + (b - a) * smooth);
    const angle = (i / 72) * Math.PI * 2;
    return pt(50 + r * Math.cos(angle), 50 + r * Math.sin(angle));
  });
}
const flower = (petals, depth) =>
  Array.from({ length: 96 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    const r = 50 * (1 - depth + depth * Math.abs(Math.cos((petals * a) / 2)));
    return pt(
      50 + r * Math.cos(a - Math.PI / 2),
      50 + r * Math.sin(a - Math.PI / 2),
    );
  });
const heart = () =>
  Array.from({ length: 80 }, (_, i) => {
    const t = (i / 80) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    );
    return pt(x, y);
  });
const scallop = (n, depth) =>
  Array.from({ length: n * 8 }, (_, i) => {
    const a = (i / (n * 8)) * Math.PI * 2;
    const r = 50 - depth * (1 - Math.abs(Math.sin((n * a) / 2)));
    return pt(50 + r * Math.cos(a), 50 + r * Math.sin(a));
  });
const wave = (height, cycles) => {
  const top = Array.from({ length: 41 }, (_, i) =>
    pt(
      i * 2.5,
      50 - height + Math.sin((i / 40) * Math.PI * 2 * cycles) * height * 0.6,
    ),
  );
  return [...top, pt(100, 100), pt(0, 100)];
};

// --- palettes ----------------------------------------------------------------
const PALETTE = [
  '#7c5cff',
  '#ff6b6b',
  '#ffb84d',
  '#2ec4b6',
  '#3a86ff',
  '#ff4d9d',
  '#1f2937',
  '#22c55e',
  '#f59e0b',
  '#06b6d4',
  '#a855f7',
  '#ef4444',
];
const pick = (i) => PALETTE[i % PALETTE.length];
const gradient = (a, b, angle = 45, type = 'linear', c) => ({
  type,
  angle,
  stops: c
    ? [
        { offset: 0, color: a },
        { offset: 0.5, color: c },
        { offset: 1, color: b },
      ]
    : [
        { offset: 0, color: a },
        { offset: 1, color: b },
      ],
});

// --- shapes (about 80) ------------------------------------------------------
const items = [];
let shapeIndex = 0;
function shape(id, en, hi, tags, rings, fill) {
  const { rings: fitted, aspect } = fit(
    Array.isArray(rings[0][0]) ? rings : [rings],
  );
  const width = aspect >= 1 ? 240 : Math.round(240 * aspect);
  const height = aspect >= 1 ? Math.round(240 / aspect) : 240;
  items.push({
    id: `shape-${id}`,
    type: 'shape',
    name: { en, hi },
    tags: ['shape', ...tags],
    data: {
      polygons: [fitted],
      width,
      height,
      fill: fill ?? pick(shapeIndex),
    },
  });
  shapeIndex++;
}
const POLY_NAMES = {
  3: ['Triangle', 'त्रिभुज'],
  4: ['Diamond', 'हीरा'],
  5: ['Pentagon', 'पंचभुज'],
  6: ['Hexagon', 'षट्भुज'],
  7: ['Heptagon', 'सप्तभुज'],
  8: ['Octagon', 'अष्टभुज'],
  9: ['Nonagon', 'नवभुज'],
  10: ['Decagon', 'दशभुज'],
  12: ['Dodecagon', 'द्वादशभुज'],
};
for (const [n, [en, hi]] of Object.entries(POLY_NAMES))
  shape(`polygon-${n}`, en, hi, ['polygon', 'basic'], regular(Number(n)));
for (const n of [4, 5, 6, 8, 10, 12])
  for (const [inner, label, labelHi] of [
    [0.45, '', ''],
    [0.7, ' soft', ' नरम'],
  ])
    shape(
      `star-${n}${label ? '-soft' : ''}`,
      `Star ${n}${label}`,
      `तारा ${n}${labelHi}`,
      ['star'],
      star(n, inner),
    );
for (let i = 1; i <= 8; i++)
  shape(
    `blob-${i}`,
    `Blob ${i}`,
    `बूँद आकृति ${i}`,
    ['blob', 'organic'],
    blob(6 + (i % 5), 0.12 + (i % 3) * 0.06),
    i % 3 === 0 ? gradient(pick(i), pick(i + 3), 30 * i) : undefined,
  );
const arrows = [
  [
    'right',
    'Arrow right',
    'दायाँ तीर',
    [
      pt(0, 35),
      pt(60, 35),
      pt(60, 10),
      pt(100, 50),
      pt(60, 90),
      pt(60, 65),
      pt(0, 65),
    ],
  ],
  [
    'left',
    'Arrow left',
    'बायाँ तीर',
    [
      pt(100, 35),
      pt(40, 35),
      pt(40, 10),
      pt(0, 50),
      pt(40, 90),
      pt(40, 65),
      pt(100, 65),
    ],
  ],
  [
    'up',
    'Arrow up',
    'ऊपर तीर',
    [
      pt(35, 100),
      pt(35, 40),
      pt(10, 40),
      pt(50, 0),
      pt(90, 40),
      pt(65, 40),
      pt(65, 100),
    ],
  ],
  [
    'down',
    'Arrow down',
    'नीचे तीर',
    [
      pt(35, 0),
      pt(35, 60),
      pt(10, 60),
      pt(50, 100),
      pt(90, 60),
      pt(65, 60),
      pt(65, 0),
    ],
  ],
  [
    'double',
    'Double arrow',
    'दोहरा तीर',
    [
      pt(0, 50),
      pt(25, 15),
      pt(25, 35),
      pt(75, 35),
      pt(75, 15),
      pt(100, 50),
      pt(75, 85),
      pt(75, 65),
      pt(25, 65),
      pt(25, 85),
    ],
  ],
  [
    'chevron',
    'Chevron',
    'शेवरॉन',
    [pt(0, 0), pt(55, 0), pt(100, 50), pt(55, 100), pt(0, 100), pt(45, 50)],
  ],
  [
    'chevron-left',
    'Chevron left',
    'बायाँ शेवरॉन',
    [pt(100, 0), pt(45, 0), pt(0, 50), pt(45, 100), pt(100, 100), pt(55, 50)],
  ],
  [
    'pentagon-arrow',
    'Tag arrow',
    'टैग तीर',
    [pt(0, 20), pt(70, 20), pt(100, 50), pt(70, 80), pt(0, 80)],
  ],
];
for (const [id, en, hi, ring] of arrows)
  shape(`arrow-${id}`, en, hi, ['arrow'], ring);
shape(
  'heart',
  'Heart',
  'दिल',
  ['love', 'heart'],
  heart(),
  gradient('#ff4d9d', '#ff6b6b', 90),
);
shape(
  'heart-plain',
  'Heart solid',
  'ठोस दिल',
  ['love', 'heart'],
  heart(),
  '#ef4444',
);
for (let i = 0; i < 4; i++) {
  const petals = [5, 6, 8, 12][i];
  shape(
    `flower-${petals}`,
    `Flower ${petals}`,
    `फूल ${petals}`,
    ['flower', 'organic'],
    flower(petals, 0.35 + (i % 2) * 0.15),
  );
}
for (const [n, depth] of [
  [12, 8],
  [16, 6],
  [20, 5],
  [24, 4],
])
  shape(
    `seal-${n}`,
    `Seal ${n}`,
    `मुहर ${n}`,
    ['badge', 'seal'],
    scallop(n, depth),
  );
for (const [id, en, hi, outer, inner] of [
  ['ring', 'Ring', 'छल्ला', 50, 32],
  ['ring-thin', 'Thin ring', 'पतला छल्ला', 50, 42],
  ['ring-thick', 'Thick ring', 'मोटा छल्ला', 50, 20],
])
  shape(
    id,
    en,
    hi,
    ['ring', 'circle'],
    [
      circlePoints(50, 50, outer, 64),
      circlePoints(50, 50, inner, 64).reverse(),
    ],
  );
shape(
  'frame-square',
  'Square frame',
  'वर्गाकार फ़्रेम',
  ['frame'],
  [
    [pt(0, 0), pt(100, 0), pt(100, 100), pt(0, 100)],
    [pt(12, 12), pt(12, 88), pt(88, 88), pt(88, 12)],
  ],
);
shape(
  'frame-circle',
  'Round frame',
  'गोल फ़्रेम',
  ['frame', 'circle'],
  [circlePoints(50, 50, 50, 64), circlePoints(50, 50, 44, 64).reverse()],
);
for (const [id, en, hi, ring] of [
  [
    'plus',
    'Plus',
    'धन चिह्न',
    [
      pt(35, 0),
      pt(65, 0),
      pt(65, 35),
      pt(100, 35),
      pt(100, 65),
      pt(65, 65),
      pt(65, 100),
      pt(35, 100),
      pt(35, 65),
      pt(0, 65),
      pt(0, 35),
      pt(35, 35),
    ],
  ],
  [
    'cross',
    'Cross',
    'गुणा चिह्न',
    [
      pt(15, 0),
      pt(50, 35),
      pt(85, 0),
      pt(100, 15),
      pt(65, 50),
      pt(100, 85),
      pt(85, 100),
      pt(50, 65),
      pt(15, 100),
      pt(0, 85),
      pt(35, 50),
      pt(0, 15),
    ],
  ],
  [
    'check',
    'Check mark',
    'सही का निशान',
    [pt(0, 55), pt(15, 40), pt(38, 62), pt(85, 10), pt(100, 25), pt(38, 92)],
  ],
  [
    'bolt',
    'Lightning',
    'बिजली',
    [
      pt(55, 0),
      pt(15, 58),
      pt(45, 58),
      pt(35, 100),
      pt(85, 38),
      pt(55, 38),
      pt(70, 0),
    ],
  ],
  [
    'drop',
    'Drop',
    'बूँद',
    [
      ...Array.from({ length: 40 }, (_, i) => {
        const a = Math.PI * (i / 39);
        return pt(50 - 35 * Math.cos(a), 62 + 35 * Math.sin(a));
      }),
      pt(50, 0),
    ],
  ],
  [
    'shield',
    'Shield',
    'ढाल',
    [pt(50, 0), pt(100, 15), pt(95, 55), pt(50, 100), pt(5, 55), pt(0, 15)],
  ],
  [
    'tag',
    'Price tag',
    'मूल्य टैग',
    [pt(0, 25), pt(70, 25), pt(100, 50), pt(70, 75), pt(0, 75)],
  ],
  [
    'bookmark',
    'Bookmark',
    'बुकमार्क',
    [pt(20, 0), pt(80, 0), pt(80, 100), pt(50, 75), pt(20, 100)],
  ],
  [
    'ribbon',
    'Ribbon',
    'रिबन',
    [
      pt(0, 30),
      pt(15, 45),
      pt(0, 60),
      pt(20, 60),
      pt(20, 70),
      pt(80, 70),
      pt(80, 60),
      pt(100, 60),
      pt(85, 45),
      pt(100, 30),
      pt(80, 30),
      pt(80, 30),
      pt(20, 30),
    ],
  ],
  [
    'banner',
    'Banner',
    'बैनर',
    [pt(0, 20), pt(100, 20), pt(88, 50), pt(100, 80), pt(0, 80), pt(12, 50)],
  ],
  [
    'parallelogram',
    'Parallelogram',
    'समांतर चतुर्भुज',
    [pt(25, 0), pt(100, 0), pt(75, 100), pt(0, 100)],
  ],
  [
    'trapezoid',
    'Trapezoid',
    'समलंब',
    [pt(20, 0), pt(80, 0), pt(100, 100), pt(0, 100)],
  ],
  [
    'right-triangle',
    'Right triangle',
    'समकोण त्रिभुज',
    [pt(0, 0), pt(100, 100), pt(0, 100)],
  ],
  ['kite', 'Kite', 'पतंग', [pt(50, 0), pt(90, 35), pt(50, 100), pt(10, 35)]],
  [
    'house',
    'House',
    'घर',
    [
      pt(50, 0),
      pt(100, 45),
      pt(88, 45),
      pt(88, 100),
      pt(12, 100),
      pt(12, 45),
      pt(0, 45),
    ],
  ],
  [
    'pill',
    'Pill',
    'कैप्सूल',
    [
      ...ellipsePoints(25, 25, 25, 25, 32)
        .slice(8, 25)
        .map(([x, y]) => pt(x, y)),
      ...ellipsePoints(75, 25, 25, 25, 32)
        .slice(24)
        .concat(ellipsePoints(75, 25, 25, 25, 32).slice(0, 9)),
    ],
  ],
])
  shape(id, en, hi, ['symbol'], ring);
shape(
  'speech',
  'Speech bubble',
  'बातचीत बुलबुला',
  ['speech', 'bubble'],
  [
    ...ellipsePoints(50, 40, 50, 36, 48).slice(0, 14),
    pt(30, 90),
    pt(38, 74),
    ...ellipsePoints(50, 40, 50, 36, 48).slice(16),
  ],
);
shape(
  'speech-square',
  'Square speech bubble',
  'वर्गाकार बुलबुला',
  ['speech', 'bubble'],
  [
    pt(0, 0),
    pt(100, 0),
    pt(100, 70),
    pt(40, 70),
    pt(20, 95),
    pt(22, 70),
    pt(0, 70),
  ],
);
shape(
  'thought',
  'Thought cloud',
  'विचार बादल',
  ['cloud', 'bubble'],
  blob(9, 0.1),
);
shape(
  'cloud',
  'Cloud',
  'बादल',
  ['cloud', 'weather'],
  [
    ...Array.from({ length: 60 }, (_, i) => {
      const a = Math.PI + (i / 59) * Math.PI;
      const bump = 1 + 0.18 * Math.abs(Math.sin(a * 3));
      return pt(50 + 50 * Math.cos(a) * bump, 60 + 38 * Math.sin(a) * bump);
    }),
  ],
);
shape(
  'crescent',
  'Crescent',
  'अर्धचंद्र',
  ['moon'],
  [
    ...Array.from({ length: 40 }, (_, i) => {
      const a = Math.PI / 2 + (i / 39) * Math.PI;
      return pt(50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a));
    }),
    ...Array.from({ length: 40 }, (_, i) => {
      const a = (3 * Math.PI) / 2 - (i / 39) * Math.PI;
      return pt(62 + 38 * Math.cos(a), 50 + 50 * Math.sin(a));
    }),
  ],
);
for (const [i, [h, c]] of [
  [18, 1],
  [26, 2],
  [12, 3],
].entries())
  shape(
    `wave-${i + 1}`,
    `Wave ${i + 1}`,
    `लहर ${i + 1}`,
    ['wave', 'divider'],
    wave(h, c),
    gradient(pick(i + 3), pick(i + 5), 0),
  );
shape(
  'semicircle',
  'Semicircle',
  'अर्धवृत्त',
  ['basic', 'circle'],
  [
    ...Array.from({ length: 40 }, (_, i) => {
      const a = Math.PI + (i / 39) * Math.PI;
      return pt(50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a));
    }),
  ],
);
shape(
  'quarter',
  'Quarter circle',
  'चौथाई वृत्त',
  ['basic', 'circle'],
  [
    pt(0, 0),
    ...Array.from({ length: 30 }, (_, i) => {
      const a = (i / 29) * (Math.PI / 2);
      return pt(100 * Math.cos(a), 100 * Math.sin(a));
    }),
  ],
);
shape('egg', 'Oval', 'अंडाकार', ['basic'], ellipsePoints(50, 50, 38, 50, 64));
shape(
  'arch',
  'Arch',
  'मेहराब',
  ['frame', 'basic'],
  [
    pt(0, 100),
    ...Array.from({ length: 40 }, (_, i) => {
      const a = Math.PI + (i / 39) * Math.PI;
      return pt(50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a));
    }),
    pt(100, 100),
  ],
);
shape(
  'burst',
  'Burst',
  'विस्फोट',
  ['badge', 'star'],
  star(16, 0.72),
  gradient('#ffb84d', '#ff6b6b', 0, 'radial'),
);

// --- I5: flowchart shapes (original outlines) -------------------------------
const arc = (cx, cy, r, from, to, n = 16) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const angle = from + ((to - from) * i) / n;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });
const FLOW = [
  [
    'terminator',
    'Terminator',
    'टर्मिनेटर',
    [...arc(130, 30, 30, -Math.PI / 2, Math.PI / 2), ...arc(30, 30, 30, Math.PI / 2, (3 * Math.PI) / 2)],
  ],
  ['process', 'Process', 'प्रक्रिया', [[0, 0], [120, 0], [120, 80], [0, 80]]],
  ['decision', 'Decision', 'निर्णय', [[60, 0], [120, 50], [60, 100], [0, 50]]],
  ['data', 'Data', 'डेटा', [[24, 0], [120, 0], [96, 70], [0, 70]]],
  [
    'document',
    'Document',
    'दस्तावेज़',
    [
      [0, 0],
      [120, 0],
      [120, 70],
      ...Array.from({ length: 25 }, (_, i) => [
        120 - i * 5,
        70 + Math.sin((i / 24) * Math.PI * 2) * 8,
      ]),
    ],
  ],
  [
    'predefined',
    'Predefined process',
    'पूर्वनिर्धारित प्रक्रिया',
    [
      [[0, 0], [120, 0], [120, 80], [0, 80]],
      [[12, 4], [12, 76], [16, 76], [16, 4]],
      [[104, 4], [104, 76], [108, 76], [108, 4]],
    ],
  ],
  ['connector', 'Connector', 'कनेक्टर', circlePoints(50, 50, 50)],
  ['manual-input', 'Manual input', 'मैनुअल इनपुट', [[0, 24], [120, 0], [120, 80], [0, 80]]],
  [
    'preparation',
    'Preparation',
    'तैयारी',
    [[22, 0], [98, 0], [120, 40], [98, 80], [22, 80], [0, 40]],
  ],
  [
    'manual-operation',
    'Manual operation',
    'मैनुअल संचालन',
    [[0, 0], [120, 0], [98, 70], [22, 70]],
  ],
  ['delay', 'Delay', 'विलंब', [[0, 0], [70, 0], ...arc(70, 40, 40, -Math.PI / 2, Math.PI / 2), [0, 80]]],
  ['merge', 'Merge', 'विलय', [[0, 0], [120, 0], [60, 90]]],
  [
    'off-page',
    'Off-page connector',
    'ऑफ़-पेज कनेक्टर',
    [[0, 0], [100, 0], [100, 60], [50, 90], [0, 60]],
  ],
  [
    'display',
    'Display',
    'डिस्प्ले',
    [[22, 0], [96, 0], ...arc(96, 40, 40, -Math.PI / 2, Math.PI / 2).slice(1, -1), [96, 80], [22, 80], [0, 40]],
  ],
];
for (const [id, en, hi, rings] of FLOW)
  shape(`flow-${id}`, en, hi, ['flowchart', 'diagram'], rings, '#e0e7ff');

// --- backgrounds (about 40) -------------------------------------------------
const GRADIENTS = [
  ['Sunrise', 'सूर्योदय', '#ff9a8b', '#ffd86f', 135],
  ['Ocean', 'सागर', '#2193b0', '#6dd5ed', 90],
  ['Violet dusk', 'बैंगनी शाम', '#41295a', '#7c5cff', 120],
  ['Mint', 'पुदीना', '#d4fc79', '#96e6a1', 45],
  ['Peach', 'आड़ू', '#ffecd2', '#fcb69f', 90],
  ['Night sky', 'रात का आकाश', '#0f2027', '#2c5364', 160],
  ['Candy', 'कैंडी', '#ff9a9e', '#fad0c4', 45],
  ['Lagoon', 'लैगून', '#43cea2', '#185a9d', 135],
  ['Lavender', 'लैवेंडर', '#e0c3fc', '#8ec5fc', 60],
  ['Ember', 'अंगारा', '#f12711', '#f5af19', 30],
  ['Forest', 'जंगल', '#134e5e', '#71b280', 120],
  ['Slate', 'स्लेट', '#232526', '#414345', 90],
  ['Rose gold', 'रोज़ गोल्ड', '#f4c4f3', '#fc67fa', 150],
  ['Sky', 'आकाश', '#a1c4fd', '#c2e9fb', 90],
  ['Citrus', 'नींबू', '#f7971e', '#ffd200', 45],
  ['Aurora', 'ध्रुवीय ज्योति', '#00c9ff', '#92fe9d', 110],
];
GRADIENTS.forEach(([en, hi, a, b, angle], i) =>
  items.push({
    id: `bg-gradient-${i + 1}`,
    type: 'background',
    name: { en, hi },
    tags: ['background', 'gradient'],
    data: {
      elements: [
        {
          kind: 'shape',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          shape: 'rectangle',
          fill: gradient(a, b, angle),
        },
      ],
    },
  }),
);
const RADIAL = [
  ['Spotlight', 'स्पॉटलाइट', '#3a3a52', '#0d0d16'],
  ['Glow', 'चमक', '#ffe29f', '#ffa99f'],
  ['Deep sea', 'गहरा सागर', '#1cb5e0', '#000046'],
  ['Halo', 'प्रभामंडल', '#fdfbfb', '#d7d2cc'],
];
RADIAL.forEach(([en, hi, a, b], i) =>
  items.push({
    id: `bg-radial-${i + 1}`,
    type: 'background',
    name: { en, hi },
    tags: ['background', 'gradient', 'radial'],
    data: {
      elements: [
        {
          kind: 'shape',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          shape: 'rectangle',
          fill: gradient(a, b, 0, 'radial'),
        },
      ],
    },
  }),
);
const THREE = [
  ['Tropical', 'उष्णकटिबंधीय', '#ff6b6b', '#2ec4b6', '#ffe66d', 120],
  ['Neon', 'नियॉन', '#7c5cff', '#06b6d4', '#ff4d9d', 45],
  ['Dawn', 'भोर', '#ffecd2', '#a1c4fd', '#fcb69f', 90],
  ['Sunset strip', 'सूर्यास्त', '#355c7d', '#f67280', '#c06c84', 90],
];
THREE.forEach(([en, hi, a, b, c, angle], i) =>
  items.push({
    id: `bg-tri-${i + 1}`,
    type: 'background',
    name: { en, hi },
    tags: ['background', 'gradient'],
    data: {
      elements: [
        {
          kind: 'shape',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          shape: 'rectangle',
          fill: gradient(a, b, angle, 'linear', c),
        },
      ],
    },
  }),
);
const LAYERED = [
  ['Bubbles', 'बुलबुले', '#fdf6ec', ['#ffb84d', '#ff6b6b', '#7c5cff']],
  ['Corner circles', 'कोने के वृत्त', '#f0f4ff', ['#3a86ff', '#a855f7']],
  ['Soft blobs', 'नरम बूँदें', '#fff7f0', ['#ffd6a5', '#caffbf', '#9bf6ff']],
  ['Waves', 'लहरें', '#e0f7fa', ['#06b6d4', '#3a86ff']],
  ['Dark orbs', 'अंधेरे गोले', '#111827', ['#7c5cff', '#ff4d9d']],
  [
    'Pastel stack',
    'पेस्टल परतें',
    '#fef9ef',
    ['#ffcbf2', '#c0fdff', '#e2ece9'],
  ],
  ['Split', 'विभाजन', '#ffffff', ['#1f2937']],
  ['Diagonal band', 'तिरछी पट्टी', '#fff1e6', ['#ff6b6b', '#ffb84d']],
  ['Sun', 'सूरज', '#ffe8cc', ['#ff922b', '#ffd43b']],
  ['Hills', 'पहाड़ियाँ', '#e7f5ff', ['#51cf66', '#2f9e44']],
  [
    'Confetti',
    'कंफ़ेटी',
    '#ffffff',
    ['#ff6b6b', '#3a86ff', '#ffb84d', '#22c55e'],
  ],
  ['Frame', 'फ़्रेम', '#f8f9fa', ['#7c5cff']],
  ['Chalkboard', 'चॉकबोर्ड', '#1e3a2f', ['#2d5242']],
  ['Notebook', 'नोटबुक', '#fffdf5', ['#90caf9', '#ef9a9a']],
  ['Studio', 'स्टूडियो', '#141414', ['#262626', '#7c5cff']],
  ['Blueprint', 'ब्लूप्रिंट', '#0b3d91', ['#1450b8']],
];
LAYERED.forEach(([en, hi, base, colors], i) => {
  const elements = [
    { kind: 'shape', x: 0, y: 0, w: 1, h: 1, shape: 'rectangle', fill: base },
  ];
  const add = (element) => elements.push({ kind: 'shape', ...element });
  switch (i) {
    case 0:
      colors.forEach((c, k) =>
        add({
          x: 0.08 + k * 0.3,
          y: 0.15 + (k % 2) * 0.45,
          w: 0.22,
          h: 0.22 * 1.78,
          shape: 'ellipse',
          fill: c,
          opacity: 0.55,
        }),
      );
      break;
    case 1:
      add({
        x: -0.15,
        y: -0.25,
        w: 0.45,
        h: 0.8,
        shape: 'ellipse',
        fill: colors[0],
        opacity: 0.8,
      });
      add({
        x: 0.72,
        y: 0.55,
        w: 0.4,
        h: 0.71,
        shape: 'ellipse',
        fill: colors[1],
        opacity: 0.8,
      });
      break;
    case 2:
      colors.forEach((c, k) =>
        add({
          x: -0.1 + k * 0.38,
          y: k % 2 ? 0.45 : -0.15,
          w: 0.5,
          h: 0.8,
          shape: 'polygon',
          polygons: [[blob(8, 0.18)]],
          fill: c,
          opacity: 0.9,
        }),
      );
      break;
    case 3:
      add({
        x: 0,
        y: 0.55,
        w: 1,
        h: 0.45,
        shape: 'polygon',
        polygons: [[wave(20, 2)]],
        fill: colors[0],
        opacity: 0.6,
      });
      add({
        x: 0,
        y: 0.68,
        w: 1,
        h: 0.32,
        shape: 'polygon',
        polygons: [[wave(16, 3)]],
        fill: colors[1],
        opacity: 0.8,
      });
      break;
    case 4:
      add({
        x: 0.55,
        y: -0.2,
        w: 0.55,
        h: 0.98,
        shape: 'ellipse',
        fill: gradient(colors[0], base, 0, 'radial'),
        opacity: 0.9,
      });
      add({
        x: -0.15,
        y: 0.5,
        w: 0.4,
        h: 0.71,
        shape: 'ellipse',
        fill: gradient(colors[1], base, 0, 'radial'),
        opacity: 0.9,
      });
      break;
    case 5:
      colors.forEach((c, k) =>
        add({
          x: 0,
          y: 0.5 + k * 0.17,
          w: 1,
          h: 0.2,
          shape: 'rectangle',
          fill: c,
        }),
      );
      break;
    case 6:
      add({ x: 0.5, y: 0, w: 0.5, h: 1, shape: 'rectangle', fill: colors[0] });
      break;
    case 7:
      add({
        x: -0.2,
        y: 0.35,
        w: 1.4,
        h: 0.3,
        shape: 'rectangle',
        fill: gradient(colors[0], colors[1], 0),
        rotation: -12,
      });
      break;
    case 8:
      add({
        x: 0.6,
        y: 0.1,
        w: 0.3,
        h: 0.53,
        shape: 'ellipse',
        fill: gradient(colors[1], colors[0], 90),
      });
      break;
    case 9:
      add({
        x: -0.1,
        y: 0.55,
        w: 0.7,
        h: 0.6,
        shape: 'ellipse',
        fill: colors[0],
      });
      add({
        x: 0.35,
        y: 0.62,
        w: 0.8,
        h: 0.6,
        shape: 'ellipse',
        fill: colors[1],
      });
      break;
    case 10:
      for (let k = 0; k < 24; k++)
        add({
          x: random() * 0.96,
          y: random() * 0.92,
          w: 0.012 + random() * 0.012,
          h: 0.04 + random() * 0.03,
          shape: 'rectangle',
          fill: colors[k % colors.length],
          rotation: Math.round(random() * 180),
        });
      break;
    case 11:
      add({
        x: 0.03,
        y: 0.05,
        w: 0.94,
        h: 0.9,
        shape: 'polygon',
        polygons: [
          [
            [pt(0, 0), pt(100, 0), pt(100, 100), pt(0, 100)],
            [pt(1.5, 2.5), pt(1.5, 97.5), pt(98.5, 97.5), pt(98.5, 2.5)],
          ],
        ],
        fill: colors[0],
      });
      break;
    case 12:
      add({
        x: 0.03,
        y: 0.05,
        w: 0.94,
        h: 0.9,
        shape: 'rectangle',
        fill: colors[0],
        radius: 0.02,
      });
      break;
    case 13:
      for (let k = 1; k < 12; k++)
        add({
          x: 0,
          y: k / 12,
          w: 1,
          h: 0.004,
          shape: 'rectangle',
          fill: colors[0],
        });
      add({
        x: 0.1,
        y: 0,
        w: 0.003,
        h: 1,
        shape: 'rectangle',
        fill: colors[1],
      });
      break;
    case 14:
      add({
        x: 0.2,
        y: 0.1,
        w: 0.6,
        h: 0.8,
        shape: 'ellipse',
        fill: gradient(colors[1], colors[0], 0, 'radial'),
        opacity: 0.5,
      });
      break;
    default:
      for (let k = 1; k < 16; k++)
        add({
          x: k / 16,
          y: 0,
          w: 0.002,
          h: 1,
          shape: 'rectangle',
          fill: colors[0],
        });
      for (let k = 1; k < 9; k++)
        add({
          x: 0,
          y: k / 9,
          w: 1,
          h: 0.003,
          shape: 'rectangle',
          fill: colors[0],
        });
  }
  // Keep within the manifest limit of 12 elements.
  items.push({
    id: `bg-layered-${i + 1}`,
    type: 'background',
    name: { en, hi },
    tags: ['background', 'shapes'],
    data: { elements: elements.slice(0, 12) },
  });
});

// --- text styles (about 30) -------------------------------------------------
const T = (en, hi) => ({ en, hi });
const TEXT_STYLES = [
  [
    'Bold heading',
    'मोटा शीर्षक',
    [
      {
        text: T('Add a heading', 'शीर्षक जोड़ें'),
        size: 0.1,
        weight: 700,
        color: '#111827',
      },
    ],
  ],
  [
    'Subheading',
    'उपशीर्षक',
    [
      {
        text: T('Add a subheading', 'उपशीर्षक जोड़ें'),
        size: 0.06,
        weight: 600,
        color: '#374151',
      },
    ],
  ],
  [
    'Body text',
    'मुख्य टेक्स्ट',
    [
      {
        text: T(
          'Add a little bit of body text',
          'थोड़ा सा मुख्य टेक्स्ट जोड़ें',
        ),
        size: 0.035,
        weight: 400,
        color: '#374151',
      },
    ],
  ],
  [
    'Serif title',
    'सेरिफ़ शीर्षक',
    [
      {
        text: T('Timeless', 'कालातीत'),
        size: 0.11,
        font: 'Georgia',
        weight: 700,
        color: '#1f2937',
      },
    ],
  ],
  [
    'Elegant italic',
    'सुंदर तिरछा',
    [
      {
        text: T('Once upon a time', 'एक समय की बात है'),
        size: 0.07,
        font: 'Georgia',
        italic: true,
        color: '#7c5cff',
      },
    ],
  ],
  [
    'Spaced caps',
    'दूरी वाले बड़े अक्षर',
    [
      {
        text: T('Studio notes', 'स्टूडियो नोट्स'),
        size: 0.04,
        weight: 600,
        letterSpacing: 12,
        textCase: 'upper',
        color: '#6b7280',
      },
    ],
  ],
  [
    'Typewriter',
    'टाइपराइटर',
    [
      {
        text: T('Chapter one', 'पहला अध्याय'),
        size: 0.06,
        font: 'Courier New',
        color: '#1f2937',
      },
    ],
  ],
  [
    'Underlined',
    'रेखांकित',
    [
      {
        text: T('Key idea', 'मुख्य विचार'),
        size: 0.07,
        weight: 700,
        decoration: 'underline',
        color: '#1f2937',
      },
    ],
  ],
  [
    'Big number',
    'बड़ी संख्या',
    [{ text: T('01', '01'), size: 0.22, weight: 700, color: '#7c5cff' }],
  ],
  [
    'Quote',
    'उद्धरण',
    [
      {
        text: T('“Make it simple.”', '“इसे सरल बनाएँ।”'),
        size: 0.07,
        font: 'Georgia',
        italic: true,
        color: '#111827',
        align: 'center',
      },
    ],
  ],
  [
    'Headline and line',
    'शीर्षक और पंक्ति',
    [
      {
        text: T('Big news', 'बड़ी ख़बर'),
        size: 0.1,
        weight: 700,
        color: '#111827',
      },
      {
        text: T('Tell everyone what is new', 'सबको बताएँ क्या नया है'),
        size: 0.04,
        color: '#4b5563',
        y: 0.13,
      },
    ],
  ],
  [
    'Title and date',
    'शीर्षक और तारीख़',
    [
      {
        text: T('Launch day', 'लॉन्च का दिन'),
        size: 0.09,
        weight: 700,
        color: '#1f2937',
      },
      {
        text: T('Friday, 10 am', 'शुक्रवार, सुबह 10 बजे'),
        size: 0.04,
        weight: 600,
        color: '#7c5cff',
        y: 0.12,
        textCase: 'upper',
        letterSpacing: 4,
      },
    ],
  ],
  [
    'Lesson title',
    'पाठ का शीर्षक',
    [
      {
        text: T('Lesson 3', 'पाठ 3'),
        size: 0.04,
        weight: 700,
        color: '#2ec4b6',
        textCase: 'upper',
        letterSpacing: 6,
      },
      {
        text: T('Fractions made easy', 'भिन्न आसान बनाएँ'),
        size: 0.08,
        weight: 700,
        color: '#111827',
        y: 0.06,
      },
    ],
  ],
  [
    'Neon',
    'नियॉन',
    [
      {
        text: T('Tonight', 'आज रात'),
        size: 0.1,
        weight: 700,
        color: '#ff4d9d',
        font: 'Trebuchet MS',
      },
    ],
  ],
  [
    'Retro',
    'रेट्रो',
    [
      {
        text: T('Groovy', 'शानदार'),
        size: 0.1,
        weight: 700,
        font: 'Verdana',
        color: '#f59e0b',
        letterSpacing: 2,
      },
    ],
  ],
  [
    'Minimal',
    'न्यूनतम',
    [
      {
        text: T('less is more', 'कम ही ज़्यादा है'),
        size: 0.06,
        color: '#111827',
        textCase: 'lower',
        letterSpacing: 3,
      },
    ],
  ],
  [
    'Title case',
    'टाइटल केस',
    [
      {
        text: T('the art of video', 'वीडियो की कला'),
        size: 0.08,
        weight: 600,
        textCase: 'title',
        color: '#1f2937',
      },
    ],
  ],
  [
    'Label',
    'लेबल',
    [
      {
        text: T('New', 'नया'),
        size: 0.035,
        weight: 700,
        textCase: 'upper',
        letterSpacing: 5,
        color: '#ef4444',
      },
    ],
  ],
  [
    'Caption',
    'कैप्शन',
    [
      {
        text: T('Photo by you', 'फ़ोटो आपकी'),
        size: 0.028,
        italic: true,
        color: '#6b7280',
      },
    ],
  ],
  [
    'Call to action',
    'कार्रवाई का आह्वान',
    [
      {
        text: T('Subscribe now', 'अभी सब्सक्राइब करें'),
        size: 0.06,
        weight: 700,
        color: '#ef4444',
        textCase: 'upper',
      },
    ],
  ],
  [
    'Strike price',
    'कटा हुआ दाम',
    [
      {
        text: T('₹999', '₹999'),
        size: 0.05,
        color: '#9ca3af',
        decoration: 'line-through',
      },
      {
        text: T('₹499', '₹499'),
        size: 0.09,
        weight: 700,
        color: '#22c55e',
        y: 0.07,
      },
    ],
  ],
  [
    'Centered title',
    'बीच में शीर्षक',
    [
      {
        text: T('Welcome', 'स्वागत है'),
        size: 0.11,
        weight: 700,
        color: '#111827',
        align: 'center',
      },
      {
        text: T('to the class', 'कक्षा में'),
        size: 0.045,
        color: '#6b7280',
        align: 'center',
        y: 0.14,
      },
    ],
  ],
  [
    'Tahoma clean',
    'ताहोमा साफ़',
    [
      {
        text: T('Clear and simple', 'साफ़ और सरल'),
        size: 0.07,
        font: 'Tahoma',
        weight: 600,
        color: '#1f2937',
      },
    ],
  ],
  [
    'Times classic',
    'टाइम्स क्लासिक',
    [
      {
        text: T('The daily report', 'दैनिक रिपोर्ट'),
        size: 0.08,
        font: 'Times New Roman',
        weight: 700,
        color: '#111827',
      },
    ],
  ],
  [
    'Step',
    'चरण',
    [
      {
        text: T('Step 1', 'चरण 1'),
        size: 0.04,
        weight: 700,
        color: '#3a86ff',
        textCase: 'upper',
        letterSpacing: 4,
      },
      {
        text: T('Open the app', 'ऐप खोलें'),
        size: 0.07,
        weight: 700,
        color: '#111827',
        y: 0.06,
      },
    ],
  ],
  [
    'Question',
    'प्रश्न',
    [
      {
        text: T('What do you think?', 'आप क्या सोचते हैं?'),
        size: 0.08,
        weight: 700,
        color: '#7c5cff',
      },
    ],
  ],
  [
    'Fact',
    'तथ्य',
    [
      {
        text: T('Did you know?', 'क्या आप जानते हैं?'),
        size: 0.045,
        weight: 700,
        color: '#f59e0b',
      },
      {
        text: T('Honey never spoils.', 'शहद कभी ख़राब नहीं होता।'),
        size: 0.07,
        weight: 600,
        color: '#111827',
        y: 0.07,
      },
    ],
  ],
  [
    'Wide spaced',
    'चौड़ी दूरी',
    [
      {
        text: T('Horizon', 'क्षितिज'),
        size: 0.08,
        weight: 400,
        letterSpacing: 30,
        textCase: 'upper',
        color: '#111827',
      },
    ],
  ],
  [
    'Light on dark',
    'अंधेरे पर हल्का',
    [
      {
        text: T('Night mode', 'रात मोड'),
        size: 0.09,
        weight: 700,
        color: '#f9fafb',
      },
    ],
  ],
  [
    'Footnote',
    'फ़ुटनोट',
    [
      {
        text: T('Source: your notes', 'स्रोत: आपके नोट्स'),
        size: 0.025,
        color: '#9ca3af',
      },
    ],
  ],
];
TEXT_STYLES.forEach(([en, hi, parts], i) =>
  items.push({
    id: `text-${i + 1}`,
    type: 'text',
    name: { en, hi },
    tags: ['text'],
    data: {
      elements: parts.map((part) => {
        const { y = 0, ...rest } = part;
        return {
          kind: 'text',
          x: 0,
          y: round(y),
          w: 0.7,
          h: round(
            part.size * 1.4 * Math.max(1, Math.ceil(part.text.en.length / 40)),
          ),
          ...rest,
        };
      }),
    },
  }),
);

// --- I5: animated titles (Text › Titles) ------------------------------------
const TITLES = [
  ['pop', 'Pop title', 'पॉप शीर्षक', 'Big news', 'बड़ी ख़बर', { preset: 'pop', duration: 0.6 }, '#7c3aed'],
  ['slide', 'Slide-up title', 'ऊपर स्लाइड शीर्षक', 'Coming up', 'आगे देखें', { preset: 'slide', duration: 0.8, direction: 'up' }, '#0f766e'],
  ['typewriter', 'Typewriter title', 'टाइपराइटर शीर्षक', 'Chapter one', 'अध्याय एक', { preset: 'typewriter', duration: 1.5 }, '#111827'],
  ['zoom', 'Zoom title', 'ज़ूम शीर्षक', 'Welcome', 'स्वागत है', { preset: 'zoom', duration: 0.7 }, '#be123c'],
  ['wipe', 'Wipe title', 'वाइप शीर्षक', 'Key point', 'मुख्य बात', { preset: 'wipe', duration: 0.8 }, '#1d4ed8'],
  ['fade', 'Fade title', 'फ़ेड शीर्षक', 'Thank you', 'धन्यवाद', { preset: 'fade', duration: 1 }, '#374151'],
];
for (const [id, en, hi, textEn, textHi, entrance, color] of TITLES)
  items.push({
    id: `text-title-${id}`,
    type: 'text',
    name: { en, hi },
    tags: ['text', 'title', 'animated', entrance.preset],
    data: {
      elements: [
        {
          kind: 'text',
          x: 0,
          y: 0,
          w: 0.7,
          h: round(0.11 * 1.4),
          text: { en: textEn, hi: textHi },
          size: 0.11,
          weight: 700,
          color,
          align: 'center',
        },
      ],
      animation: { in: entrance },
    },
  });

// --- templates (about 12) ---------------------------------------------------
const text = (en, hi, x, y, w, size, color, extra = {}) => ({
  kind: 'text',
  x,
  y,
  w,
  h: round(size * 1.35),
  text: T(en, hi),
  size,
  color,
  ...extra,
});
const rect = (x, y, w, h, fill, extra = {}) => ({
  kind: 'shape',
  x,
  y,
  w,
  h,
  shape: 'rectangle',
  fill,
  ...extra,
});
const oval = (x, y, w, h, fill, extra = {}) => ({
  kind: 'shape',
  x,
  y,
  w,
  h,
  shape: 'ellipse',
  fill,
  ...extra,
});
const TEMPLATES = [
  [
    'YouTube intro',
    'यूट्यूब इंट्रो',
    '#111827',
    [
      rect(0, 0, 1, 1, gradient('#7c5cff', '#ff4d9d', 135)),
      text(
        'Welcome back!',
        'फिर से स्वागत है!',
        0.08,
        0.32,
        0.84,
        0.13,
        '#ffffff',
        { weight: 700, align: 'center' },
      ),
      text(
        'New video every Friday',
        'हर शुक्रवार नया वीडियो',
        0.08,
        0.52,
        0.84,
        0.05,
        '#fdf2f8',
        { align: 'center' },
      ),
    ],
  ],
  [
    'Lesson slide',
    'पाठ स्लाइड',
    '#fffdf5',
    [
      rect(0, 0, 0.04, 1, '#2ec4b6'),
      text('Lesson 1', 'पाठ 1', 0.1, 0.12, 0.6, 0.045, '#2ec4b6', {
        weight: 700,
        textCase: 'upper',
        letterSpacing: 6,
      }),
      text('The water cycle', 'जल चक्र', 0.1, 0.2, 0.8, 0.1, '#111827', {
        weight: 700,
      }),
      text(
        'Evaporation, condensation and rain',
        'वाष्पीकरण, संघनन और वर्षा',
        0.1,
        0.36,
        0.8,
        0.045,
        '#4b5563',
      ),
      oval(0.7, 0.55, 0.22, 0.39, '#a1c4fd', { opacity: 0.8 }),
    ],
  ],
  [
    'Quote card',
    'उद्धरण कार्ड',
    '#fef3c7',
    [
      text(
        '“Learning never exhausts the mind.”',
        '“सीखना मन को कभी नहीं थकाता।”',
        0.1,
        0.3,
        0.8,
        0.075,
        '#1f2937',
        { font: 'Georgia', italic: true, align: 'center' },
      ),
      text(
        'Leonardo da Vinci',
        'लियोनार्डो दा विंची',
        0.1,
        0.62,
        0.8,
        0.04,
        '#92400e',
        { align: 'center', textCase: 'upper', letterSpacing: 4 },
      ),
    ],
  ],
  [
    'Top 3 list',
    'शीर्ष 3 सूची',
    '#f0f4ff',
    [
      text('Top 3 tips', 'शीर्ष 3 सुझाव', 0.08, 0.1, 0.84, 0.09, '#1e3a8a', {
        weight: 700,
      }),
      oval(0.08, 0.3, 0.06, 0.107, '#3a86ff'),
      text(
        'Plan your video',
        'अपने वीडियो की योजना बनाएँ',
        0.18,
        0.31,
        0.7,
        0.055,
        '#111827',
      ),
      oval(0.08, 0.48, 0.06, 0.107, '#3a86ff'),
      text(
        'Record in good light',
        'अच्छी रोशनी में रिकॉर्ड करें',
        0.18,
        0.49,
        0.7,
        0.055,
        '#111827',
      ),
      oval(0.08, 0.66, 0.06, 0.107, '#3a86ff'),
      text('Keep it short', 'इसे छोटा रखें', 0.18, 0.67, 0.7, 0.055, '#111827'),
    ],
  ],
  [
    'Thumbnail',
    'थंबनेल',
    '#111827',
    [
      rect(0, 0, 1, 1, gradient('#f12711', '#f5af19', 30)),
      text('I tried it', 'मैंने आज़माया', 0.06, 0.12, 0.6, 0.14, '#ffffff', {
        weight: 700,
        textCase: 'upper',
      }),
      text('for 30 days', '30 दिन तक', 0.06, 0.34, 0.6, 0.1, '#111827', {
        weight: 700,
        textCase: 'upper',
      }),
      oval(0.62, 0.2, 0.34, 0.6, '#ffffff', { opacity: 0.25 }),
    ],
  ],
  [
    'End screen',
    'अंतिम स्क्रीन',
    '#0f172a',
    [
      text(
        'Thanks for watching',
        'देखने के लिए धन्यवाद',
        0.06,
        0.1,
        0.88,
        0.08,
        '#ffffff',
        { weight: 700, align: 'center' },
      ),
      rect(0.08, 0.35, 0.38, 0.42, '#1e293b', { radius: 0.05 }),
      rect(0.54, 0.35, 0.38, 0.42, '#1e293b', { radius: 0.05 }),
      text('Subscribe', 'सब्सक्राइब करें', 0.3, 0.84, 0.4, 0.05, '#ef4444', {
        weight: 700,
        align: 'center',
        textCase: 'upper',
      }),
    ],
  ],
  [
    'Chapter title',
    'अध्याय शीर्षक',
    '#1f2937',
    [
      text('Chapter 2', 'अध्याय 2', 0.08, 0.36, 0.84, 0.05, '#a5b4fc', {
        textCase: 'upper',
        letterSpacing: 8,
        align: 'center',
      }),
      text('Getting started', 'शुरुआत', 0.08, 0.45, 0.84, 0.11, '#ffffff', {
        weight: 700,
        align: 'center',
      }),
      rect(0.44, 0.64, 0.12, 0.006, '#7c5cff'),
    ],
  ],
  [
    'Compare',
    'तुलना',
    '#ffffff',
    [
      rect(0, 0, 0.5, 1, '#fee2e2'),
      rect(0.5, 0, 0.5, 1, '#dcfce7'),
      text('Before', 'पहले', 0.05, 0.1, 0.4, 0.08, '#991b1b', {
        weight: 700,
        align: 'center',
      }),
      text('After', 'बाद में', 0.55, 0.1, 0.4, 0.08, '#166534', {
        weight: 700,
        align: 'center',
      }),
    ],
  ],
  [
    'Announcement',
    'घोषणा',
    '#fff7ed',
    [
      oval(-0.1, -0.2, 0.5, 0.89, '#ffedd5'),
      text('Big announcement', 'बड़ी घोषणा', 0.1, 0.3, 0.8, 0.1, '#9a3412', {
        weight: 700,
      }),
      text(
        'Something new is coming',
        'कुछ नया आ रहा है',
        0.1,
        0.46,
        0.8,
        0.05,
        '#c2410c',
      ),
    ],
  ],
  [
    'Quiz question',
    'प्रश्नोत्तरी प्रश्न',
    '#eef2ff',
    [
      text(
        'Quiz time!',
        'प्रश्नोत्तरी का समय!',
        0.08,
        0.08,
        0.84,
        0.06,
        '#4f46e5',
        { weight: 700, textCase: 'upper', letterSpacing: 3 },
      ),
      text(
        'What is 7 × 8?',
        '7 × 8 कितना है?',
        0.08,
        0.2,
        0.84,
        0.1,
        '#111827',
        { weight: 700 },
      ),
      rect(0.08, 0.45, 0.4, 0.15, '#ffffff', { radius: 0.2 }),
      text('A. 54', 'क. 54', 0.1, 0.49, 0.36, 0.05, '#111827'),
      rect(0.52, 0.45, 0.4, 0.15, '#ffffff', { radius: 0.2 }),
      text('B. 56', 'ख. 56', 0.54, 0.49, 0.36, 0.05, '#111827'),
    ],
  ],
  [
    'Event',
    'कार्यक्रम',
    '#111827',
    [
      rect(0, 0, 1, 1, gradient('#41295a', '#2f0743', 90)),
      text('Live workshop', 'लाइव कार्यशाला', 0.08, 0.2, 0.84, 0.1, '#ffffff', {
        weight: 700,
      }),
      text(
        'Saturday · 6 pm',
        'शनिवार · शाम 6 बजे',
        0.08,
        0.36,
        0.84,
        0.05,
        '#e9d5ff',
        { textCase: 'upper', letterSpacing: 4 },
      ),
      rect(0.08, 0.6, 0.3, 0.12, '#ff4d9d', { radius: 0.5 }),
      text('Join free', 'मुफ़्त जुड़ें', 0.08, 0.63, 0.3, 0.05, '#ffffff', {
        weight: 700,
        align: 'center',
      }),
    ],
  ],
  [
    'Recipe card',
    'रेसिपी कार्ड',
    '#fffbeb',
    [
      rect(0.55, 0, 0.45, 1, gradient('#fcd34d', '#f59e0b', 90)),
      text('Masala chai', 'मसाला चाय', 0.06, 0.14, 0.46, 0.09, '#78350f', {
        weight: 700,
        font: 'Georgia',
      }),
      text(
        'Ready in 10 minutes',
        '10 मिनट में तैयार',
        0.06,
        0.3,
        0.46,
        0.045,
        '#92400e',
      ),
      text(
        'Tea · milk · ginger · cardamom',
        'चाय · दूध · अदरक · इलायची',
        0.06,
        0.45,
        0.46,
        0.04,
        '#78350f',
      ),
    ],
  ],
];
TEMPLATES.forEach(([en, hi, background, elements], i) =>
  items.push({
    id: `template-${i + 1}`,
    type: 'template',
    name: { en, hi },
    tags: ['template'],
    // I1.4: every Starter Pack 1 template is designed for a 16:9 canvas.
    data: { background, elements, width: 1920, height: 1080 },
  }),
);

// --- I2: browse sections, template taxonomy, transitions --------------------
// Each item names the browse-panel section it is listed in. Templates sit in
// a category and subcategory; a subcategory carries the canvas size of its
// designs (common sizes for document types, recorded in docs/LIBRARY.md).
const sectionOf = (item) => {
  const id = item.id;
  if (item.type === 'shape') {
    if (/^shape-polygon-/.test(id)) return 'polygons';
    if (/^shape-(star|seal|burst|flower)/.test(id)) return 'stars';
    if (/^shape-arrow/.test(id)) return 'arrows';
    if (/^shape-flow-/.test(id)) return 'flowchart';
    return 'basic';
  }
  if (item.type === 'background')
    return /^bg-layered-/.test(id) ? 'backgrounds' : 'gradients';
  if (item.type === 'text') {
    const n = Number(id.replace('text-', ''));
    if ([1, 2, 3].includes(n)) return 'default';
    if ([11, 12, 13, 22].includes(n)) return 'combinations';
    if ([21, 25, 27].includes(n)) return 'two-line';
    if ([16, 17, 19, 23, 24, 30].includes(n)) return 'plain';
    if ([9, 14, 28].includes(n) || /^text-title-/.test(id)) return 'titles';
    return 'styles';
  }
  return undefined;
};
const FEATURED = new Set([
  'bg-layered-1',
  'bg-layered-9',
  'bg-layered-10',
  'bg-layered-13',
  'bg-gradient-6',
  'bg-gradient-16',
]);
const size = (width, height) => ({ width, height });
const sub = (id, en, hi, dims) => ({ id, name: { en, hi }, ...(dims ?? {}) });
const DOC = {
  youtube: size(1920, 1080),
  instagram: size(1080, 1080),
  facebook: size(1200, 630),
  presentation: size(1920, 1080),
  invitation: size(1500, 2100),
  poster: size(1800, 2400),
  cv: size(1240, 1754),
  logo: size(500, 500),
  code: size(1920, 1080),
  'business-card': size(1050, 600),
  flyer: size(1275, 1650),
  brochure: size(1650, 1275),
  menu: size(1275, 1650),
  'photo-collage': size(1080, 1080),
  sheet: size(1920, 1080),
  doc: size(1240, 1754),
  website: size(1366, 768),
  whiteboard: size(1920, 1080),
};
const DOC_NAMES = {
  youtube: ['YouTube', 'यूट्यूब'],
  instagram: ['Instagram', 'इंस्टाग्राम'],
  facebook: ['Facebook', 'फ़ेसबुक'],
  presentation: ['Presentation', 'प्रस्तुति'],
  invitation: ['Invitation', 'निमंत्रण'],
  poster: ['Poster', 'पोस्टर'],
  cv: ['CV', 'सीवी'],
  logo: ['Logo', 'लोगो'],
  code: ['Code', 'कोड'],
  'business-card': ['Business card', 'बिज़नेस कार्ड'],
  flyer: ['Flyer', 'फ़्लायर'],
  brochure: ['Brochure', 'ब्रोशर'],
  menu: ['Menu', 'मेन्यू'],
  'photo-collage': ['Photo collage', 'फ़ोटो कोलाज'],
  sheet: ['Sheet', 'शीट'],
  doc: ['Doc', 'डॉक'],
  website: ['Website', 'वेबसाइट'],
  whiteboard: ['Whiteboard', 'व्हाइटबोर्ड'],
};
const doc = (id) => sub(id, DOC_NAMES[id][0], DOC_NAMES[id][1], DOC[id]);
const TAXONOMY = [
  {
    id: 'all',
    name: { en: 'All Templates', hi: 'सभी टेम्पलेट' },
    subcategories: Object.keys(DOC).map(doc),
  },
  {
    id: 'video',
    name: { en: 'Video Templates', hi: 'वीडियो टेम्पलेट' },
    subcategories: [
      sub('mobile-video', 'Mobile video', 'मोबाइल वीडियो', size(1080, 1920)),
      sub(
        'landscape-video',
        'Landscape video',
        'लैंडस्केप वीडियो',
        size(1920, 1080),
      ),
      sub(
        'youtube-shorts',
        'YouTube Shorts',
        'यूट्यूब शॉर्ट्स',
        size(1080, 1920),
      ),
      sub(
        'instagram-reels',
        'Instagram Reels',
        'इंस्टाग्राम रील्स',
        size(1080, 1920),
      ),
      sub(
        'youtube-videos',
        'YouTube videos',
        'यूट्यूब वीडियो',
        size(1920, 1080),
      ),
      sub(
        'facebook-videos',
        'Facebook videos',
        'फ़ेसबुक वीडियो',
        size(1920, 1080),
      ),
      sub('video-collage', 'Video collage', 'वीडियो कोलाज', size(1080, 1080)),
      sub('video-message', 'Video message', 'वीडियो संदेश', size(1080, 1920)),
      sub(
        'feed-ad-video',
        'Feed ad video',
        'फ़ीड विज्ञापन वीडियो',
        size(1080, 1350),
      ),
    ],
  },
  {
    id: 'graphics',
    name: { en: 'Graphics Templates', hi: 'ग्राफ़िक्स टेम्पलेट' },
    subcategories: [
      'presentation',
      'cv',
      'logo',
      'code',
      'business-card',
      'doc',
      'website',
      'whiteboard',
      'flyer',
      'brochure',
      'menu',
      'photo-collage',
      'invitation',
    ].map(doc),
  },
  {
    id: 'social',
    name: { en: 'Social media Templates', hi: 'सोशल मीडिया टेम्पलेट' },
    subcategories: [
      sub(
        'instagram-post',
        'Instagram post',
        'इंस्टाग्राम पोस्ट',
        size(1080, 1080),
      ),
      sub(
        'youtube-thumbnail',
        'YouTube thumbnail',
        'यूट्यूब थंबनेल',
        size(1280, 720),
      ),
      sub('facebook-post', 'Facebook post', 'फ़ेसबुक पोस्ट', size(1200, 630)),
      sub('linkedin-post', 'LinkedIn post', 'लिंक्डइन पोस्ट', size(1200, 627)),
      sub('pinterest-pin', 'Pinterest pin', 'पिनटेरेस्ट पिन', size(1000, 1500)),
    ],
  },
  {
    id: 'education',
    name: { en: 'Education Templates', hi: 'शिक्षा टेम्पलेट' },
    subcategories: [],
  },
];
/** Where each Starter Pack 1 template goes (all are 16:9 designs). */
const PLACE = {
  'template-1': ['video', 'youtube-videos', ['youtube']],
  'template-2': ['education', undefined, ['presentation']],
  'template-3': ['graphics', 'presentation', ['presentation']],
  'template-4': ['education', undefined, ['presentation']],
  'template-5': ['social', 'youtube-thumbnail', ['youtube']],
  'template-6': ['video', 'youtube-videos', ['youtube']],
  'template-7': ['video', 'landscape-video', ['youtube']],
  'template-8': ['education', undefined, ['presentation']],
  'template-9': ['graphics', 'presentation', ['presentation']],
  'template-10': ['education', undefined, ['presentation']],
  'template-11': ['video', 'landscape-video', ['invitation']],
  'template-12': ['graphics', 'presentation', ['menu']],
};
for (const item of items) {
  const section = sectionOf(item);
  if (section) item.section = section;
  if (FEATURED.has(item.id)) item.tags = [...item.tags, 'featured'];
  if (item.type === 'template' && PLACE[item.id]) {
    const [category, subcategory, tags] = PLACE[item.id];
    const dims = subcategory
      ? TAXONOMY.find((entry) => entry.id === category).subcategories.find(
          (entry) => entry.id === subcategory,
        )
      : DOC.presentation;
    item.data.category = category;
    if (subcategory) item.data.subcategory = subcategory;
    item.data.width = dims.width;
    item.data.height = dims.height;
    item.tags = [...new Set([...item.tags, ...tags])];
  }
}
// Transitions: listed now with static posters, applied from Wave 6.
const TRANSITIONS = [
  ['fades', 'fade', 'Fade', 'फ़ेड', 'fade', 'TR-003'],
  ['fades', 'fade-black', 'Fade to black', 'काले में फ़ेड', 'fade', 'TR-003'],
  [
    'fades',
    'dissolve',
    'Cross dissolve',
    'क्रॉस डिज़ॉल्व',
    'dissolve',
    'TR-003',
  ],
  ['fades', 'blur', 'Blur', 'धुंधला', 'blur', 'TR-004'],
  ['wipes', 'wipe-left', 'Wipe left', 'बाएँ वाइप', 'wipe-left', 'TR-003'],
  ['wipes', 'wipe-up', 'Wipe up', 'ऊपर वाइप', 'wipe-up', 'TR-003'],
  ['wipes', 'iris', 'Circle wipe', 'गोल वाइप', 'wipe-circle', 'TR-004'],
  ['pushes', 'push-left', 'Push left', 'बाएँ पुश', 'push-left', 'TR-003'],
  ['pushes', 'push-up', 'Push up', 'ऊपर पुश', 'push-up', 'TR-003'],
  ['pushes', 'slide', 'Slide', 'स्लाइड', 'slide', 'TR-003'],
  ['cartoon', 'pop', 'Pop', 'पॉप', 'cartoon-pop', 'TR-004'],
  [
    'cartoon',
    'zoom-burst',
    'Zoom burst',
    'ज़ूम बर्स्ट',
    'cartoon-zoom',
    'TR-004',
  ],
  ['glitches', 'glitch', 'Glitch', 'ग्लिच', 'glitch', 'TR-004'],
  [
    'glitches',
    'rgb-split',
    'RGB split',
    'आरजीबी विभाजन',
    'rgb-split',
    'TR-004',
  ],
  ['3d', 'flip', 'Flip', 'फ़्लिप', 'flip', 'TR-004'],
  ['3d', 'cube', 'Cube', 'क्यूब', 'cube', 'TR-004'],
  ['3d', 'page-turn', 'Page turn', 'पन्ना पलटना', 'page', 'TR-004'],
];
const TRANSITION_COLOURS = [
  ['#7c5cff', '#f59e0b'],
  ['#0ea5e9', '#f43f5e'],
  ['#10b981', '#6366f1'],
];
TRANSITIONS.forEach(([section, id, en, hi, poster, planned], i) => {
  const [from, to] = TRANSITION_COLOURS[i % TRANSITION_COLOURS.length];
  items.push({
    id: `transition-${id}`,
    type: 'transition',
    name: { en, hi },
    tags: ['transition', section],
    section,
    data: { poster, from, to, planned },
  });
});

const manifest = {
  version: 1,
  templates: TAXONOMY,
  pack: {
    id: 'starter-1',
    name: { en: 'Starter Pack 1', hi: 'स्टार्टर पैक 1' },
  },
  items,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(manifest)}\n`);
const count = (type) => items.filter((item) => item.type === type).length;
console.log(
  `Wrote ${out}: ${count('shape')} shapes, ${count('background')} backgrounds, ${count('text')} text styles, ${count('template')} templates, ${count('transition')} transitions`,
);
