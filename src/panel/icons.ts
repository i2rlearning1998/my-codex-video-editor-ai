// P2-R3: the panel's line icons (one set, drawn from fixed path strings, no
// outside text). `icon('home')` returns an <svg> that takes the text colour.
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  styles:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5"/>',
  projects:
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  studio:
    '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  assets:
    '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  credits: '<circle cx="12" cy="12" r="9"/><path d="M9 12h6M12 9v6"/>',
  brand:
    '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/>',
  learn:
    '<path d="M3 8l9-4 9 4-9 4z"/><path d="M7 10.5V16c0 1.5 2.2 3 5 3s5-1.5 5-3v-5.5"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  director:
    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  text: '<path d="M5 5h14M5 10h14M5 15h9"/>',
  audio: '<path d="M4 14v-4M8 18V6M12 15V9M16 20V4M20 14v-4"/>',
  voice:
    '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>',
  video:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  captions:
    '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 11h4M7 14h8"/>',
  pack: '<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.4l6-.8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  arrowLeft: '<path d="M15 5l-7 7 7 7"/>',
  arrowRight: '<path d="M9 5l7 7-7 7"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 22): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ico');
  svg.innerHTML = PATHS[name];
  return svg;
}

/** The icon that stands for a Studio's output kind. */
export const studioIcon = (output: string): IconName =>
  output === 'audio'
    ? 'audio'
    : output === 'image'
      ? 'image'
      : output === 'video'
        ? 'video'
        : output === 'captions'
          ? 'captions'
          : output === 'pack'
            ? 'pack'
            : 'text';
