import { source as s0 } from './lower-third';
import { source as s1 } from './kinetic-quote';
import { source as s2 } from './typewriter-title';
import { source as s3 } from './bar-chart';
import { source as s4 } from './line-chart';
import { source as s5 } from './progress-ring';
import { source as s6 } from './counter-sparkline';
import { source as s7 } from './subscribe-bell';
import { source as s8 } from './callout-arrow';
import { source as s9 } from './countdown';
import { source as s10 } from './shape-reveal';
import { source as s11 } from './glitch-text';
import { source as s12 } from './ribbon-wave';
import { source as s13 } from './particle-confetti';
/** Original source fixtures. Compile before passing unchanged to the existing worker. */
export const blockLibrary = Object.freeze(
  [
    {
      id: 'lower-third',
      name: 'Offset lower third',
      category: 'Titles',
      source: s0,
    },
    {
      id: 'kinetic-quote',
      name: 'Measured words',
      category: 'Typography',
      source: s1,
    },
    {
      id: 'typewriter-title',
      name: 'Cursor note',
      category: 'Typography',
      source: s2,
    },
    {
      id: 'bar-chart',
      name: 'Three-way comparison',
      category: 'Data',
      source: s3,
    },
    {
      id: 'line-chart',
      name: 'Trace of progress',
      category: 'Data',
      source: s4,
    },
    {
      id: 'progress-ring',
      name: 'Open orbit progress',
      category: 'Data',
      source: s5,
    },
    {
      id: 'counter-sparkline',
      name: 'Metric with a pulse',
      category: 'Data',
      source: s6,
    },
    {
      id: 'subscribe-bell',
      name: 'Follow and chime',
      category: 'Calls to action',
      source: s7,
    },
    {
      id: 'callout-arrow',
      name: 'Bent path callout',
      category: 'Annotations',
      source: s8,
    },
    { id: 'countdown', name: 'Quiet countdown', category: 'Time', source: s9 },
    {
      id: 'shape-reveal',
      name: 'Folded compass mark',
      category: 'Shapes',
      source: s10,
    },
    {
      id: 'glitch-text',
      name: 'Signal offset title',
      category: 'Typography',
      source: s11,
    },
    {
      id: 'ribbon-wave',
      name: 'Tidal ribbons',
      category: 'Background accents',
      source: s12,
    },
    {
      id: 'particle-confetti',
      name: 'Paper celebration',
      category: 'Particles',
      source: s13,
    },
  ].map((entry) => Object.freeze(entry)),
);
export const getLibraryBlock = (id: string) =>
  blockLibrary.find((entry) => entry.id === id);
