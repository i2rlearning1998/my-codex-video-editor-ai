// P2-R2 (P2B-28): the Aurora Ink colours, the single list the CSS token file
// (aurora.css) and the contrast test read. The dark values are also the
// config's brand.colors defaults (Admin can change them there).
export const AURORA = {
  dark: {
    bg: '#07070d',
    panel: '#0f0f1a',
    raised: '#161627',
    border: '#23233a',
    text: '#ecebf5',
    muted: '#9a98b5',
    accentText: '#a591ff',
    goldText: '#ffc247',
    onAurora: '#07070d',
    danger: '#ff8a8a',
    success: '#5ee0a0',
  },
  light: {
    bg: '#f6f5fb',
    panel: '#ffffff',
    raised: '#efeef8',
    border: '#d9d7ea',
    text: '#14131f',
    muted: '#575670',
    accentText: '#5b37f0',
    goldText: '#8a5a00',
    onAurora: '#07070d',
    danger: '#b42318',
    success: '#0f7a43',
  },
  /** The aurora gradient: only for AI moments and primary actions. */
  violet: '#7c5cff',
  cyan: '#22d3ee',
  gold: '#ffc247',
} as const;
