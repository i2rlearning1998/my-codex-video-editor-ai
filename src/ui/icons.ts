/** Minimal inline-SVG line-icon set. No external icon library dependency (offline build).
 *  Each icon is 20x20, stroke-based, inherits currentColor. Usage: element.innerHTML = icon('menu'). */
const PATHS: Record<string, string> = {
  menu: 'M3 5h14M3 10h14M3 15h14',
  media: 'M3 4h14v12H3z M6 8l3 2-3 2z M11 6h4 M11 9h4 M11 12h4',
  graphics: 'M10 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z',
  text: 'M4 4h12 M10 4v12',
  templates: 'M3 3h6v6H3z M11 3h6v4h-6z M11 9h6v8h-6z M3 11h6v6H3z',
  audio: 'M4 8v4 M7 5v10 M10 3v14 M13 6v8 M16 8v4',
  elements:
    'M6 3l3 3-3 3-3-3z M14 3l3 3-3 3-3-3z M6 11l3 3-3 3-3-3z M14 11l3 3-3 3-3-3z',
  transitions: 'M3 10h6 M9 10l-3-3 M9 10l-3 3 M11 10h6 M17 10l-3-3 M17 10l-3 3',
  properties: 'M4 6h12 M4 10h12 M4 14h8',
  effects:
    'M10 3v3 M10 14v3 M3 10h3 M14 10h3 M5.5 5.5l2 2 M12.5 12.5l2 2 M14.5 5.5l-2 2 M7.5 12.5l-2 2',
  color:
    'M10 3a7 7 0 100 14 2 2 0 002-2 2 2 0 012-2h1a2 2 0 002-2 7 7 0 00-7-8z M6.5 9a1 1 0 100-2 1 1 0 000 2z M10 7a1 1 0 100-2 1 1 0 000 2z M13.5 9a1 1 0 100-2 1 1 0 000 2z M7.5 13a1 1 0 100-2 1 1 0 000 2z',
  speed: 'M10 4a7 7 0 100 14 7 7 0 000-14z M10 6v4l3 2',
  undo: 'M6 5L3 9l3 4 M3 9h9a4 4 0 010 8h-2',
  redo: 'M14 5l3 4-3 4 M17 9H8a4 4 0 000 8h2',
  export: 'M10 3v9 M6 8l4-4 4 4 M4 15h12',
  save: 'M4 4h9l3 3v9H4z M7 4v4h6V4 M7 12h6v4H7z',
  open: 'M3 6h5l2 2h7v8H3z',
  play: 'M6 4l10 6-10 6z',
  pause: 'M6 4h3v12H6z M11 4h3v12h-3z',
  stop: 'M5 5h10v10H5z',
  frameBack: 'M9 5L4 10l5 5 M4 10h12 M4 5v10',
  frameForward: 'M11 5l5 5-5 5 M16 10H4 M16 5v10',
  zoomIn: 'M9 4a5 5 0 100 10 5 5 0 000-10z M13 13l4 4 M9 6v6 M6 9h6',
  zoomOut: 'M9 4a5 5 0 100 10 5 5 0 000-10z M13 13l4 4 M6 9h6',
  fit: 'M4 8V4h4 M16 8V4h-4 M4 12v4h4 M16 12v4h-4',
  fullscreen: 'M4 8V4h4 M16 8V4h-4 M4 12v4h4 M16 12v4h-4',
  lock: 'M6 9V6a4 4 0 018 0v3 M4 9h12v8H4z',
  unlock: 'M6 9V6a4 4 0 017.5-2 M4 9h12v8H4z',
  eye: 'M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z M10 12a2 2 0 100-4 2 2 0 000 4z',
  eyeOff:
    'M3 3l14 14 M9 5.1A8.6 8.6 0 0110 5c5 0 8 5 8 5a13 13 0 01-2.6 3 M6.7 6.7A8.3 8.3 0 002 10s3 5 8 5c1 0 2-.2 2.9-.5 M8.1 11.9a2 2 0 002.8-2.8',
  mute: 'M3 8v4h3l4 3V5L6 8z M13.5 7.5l3 5 M16.5 7.5l-3 5',
  speaker: 'M3 8v4h3l4 3V5L6 8z M13 7.3a4 4 0 010 5.4 M15.3 5a7.3 7.3 0 010 10',
  arrowUp: 'M10 15V5 M5.5 9.5L10 5l4.5 4.5',
  arrowDown: 'M10 5v10 M5.5 10.5L10 15l4.5-4.5',
  split: 'M10 3v4 M10 13v4 M5 9a5 5 0 0110 0v2a5 5 0 01-10 0z',
  duplicate: 'M5 5h9v9H5z M8 8h9v9H8z',
  delete: 'M5 6h10 M8 6V4h4v2 M6 6l1 11h6l1-11',
  marker: 'M10 3l4 4v10H6V7z',
  close: 'M5 5l10 10 M15 5L5 15',
  chevronDown: 'M5 8l5 5 5-5',
  chevronRight: 'M8 5l5 5-5 5',
  chevronLeft: 'M12 5l-5 5 5 5',
  check: 'M4 10l4 4 8-8',
  search: 'M9 4a5 5 0 100 10 5 5 0 000-10z M13 13l4 4',
  info: 'M10 6.2v.1 M9 9h1.2v5H9 M10 17a7 7 0 100-14 7 7 0 000 14z',
  warning: 'M10 3l8.5 14.5H1.5z M10 8v4 M10 14.5v.1',
  diamondFilled: 'M10 3l6 7-6 7-6-7z',
  diamondOutline: 'M10 4.6L15 10l-5 5.4L5 10z',
  group: 'M4 4h8v8H4z M8 8h8v8H8z',
  ungroup: 'M3 3h6v6H3z M11 11h6v6h-6z',
  groupSelection:
    'M2 5V2h3 M15 2h3v3 M18 15v3h-3 M5 18H2v-3 M6 6h5v5H6z M9 9h5v5H9z',
  more: 'M4.5 10h1 M9.5 10h1 M14.5 10h1',
  layers: 'M10 3l7 4-7 4-7-4z M3 10.5l7 4 7-4 M3 14l7 4 7-4',
  image:
    'M3 4h14v12H3z M6.5 8.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M3 14l4.5-5 3 3.5L14 9l3 5',
  flipH: 'M10 3v14 M8 6L3 14h5z M12 6l5 8h-5z',
  flipV: 'M3 10h14 M6 8l8-5v5z M6 12l8 5v-5z',
  animate: 'M3 14c3 0 3-8 7-8s4 8 7 8 M3 17h14',
  pen: 'M4 16l1-4 8-8 3 3-8 8z M11.5 5.5l3 3 M4 16l4-1',
  brush: 'M13 3l4 4-6 6-4-4z M7 9l-2 2c-1.5 1.5-1 4-3 5 3 1 6 0 7-2l2-2',
  highlighter: 'M12 3l5 5-7 7-5-5z M5 10l-2 5 2 2 5-2 M3 17h14',
  solo: 'M4 13v-3a6 6 0 0112 0v3 M4 13h3v4H4z M13 13h3v4h-3z',
  reverse: 'M15 7H5 M8 4L5 7l3 3 M5 13h10 M12 10l3 3-3 3',
  freeze: 'M10 3v14 M3.9 6.5l12.2 7 M3.9 13.5l12.2-7',
  link: 'M8.5 11.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2l-1 1 M11.5 8.5a3 3 0 00-4.2 0l-2.6 2.6a3 3 0 004.2 4.2l1-1',
  panelLeft: 'M3 4h14v12H3z M8 4v12',
  panelRight: 'M3 4h14v12H3z M12 4v12',
};

export function iconSvg(name: keyof typeof PATHS | string, size = 18): string {
  const d = PATHS[name];
  if (!d) return '';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d
    .split(' M')
    .map((seg, i) => `<path d="${i === 0 ? seg : 'M' + seg}" />`)
    .join('')}</svg>`;
}

export const ICON_NAMES = Object.keys(PATHS);
