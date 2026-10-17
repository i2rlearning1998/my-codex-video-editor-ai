// B1: a style's card picture (styles are never placed on the canvas): its
// palette as swatches, the category's icon and its name, as an SVG data URI.
// A style's own `thumbnail` (a data: image) wins when it has one.
import type { StyleData } from '../creator-pack';
import { iconSvg } from './icons';

export const STYLE_ICONS: Readonly<Record<StyleData['category'], string>> = {
  documentary: 'filmstrip',
  'youtube-intro': 'play',
  'logo-reveal-2d': 'magic',
  'logo-reveal-3d': 'cube',
  reels: 'screen',
  education: 'templates',
  'animation-2d': 'animate',
  'animation-3d': 'cube',
  'recorded-video-enhance': 'camera',
  custom: 'effects',
};
/** Colours of the picture when a style names no palette (content, not UI). */
const NEUTRAL = {
  background: '#1f2430',
  primary: '#5b6475',
  accent: '#8b93a6',
  text: '#f5f6f8',
};
const escape = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

export function styleThumbnail(data: StyleData, name: string): string {
  if (data.thumbnail) return data.thumbnail;
  const palette: {
    background: string;
    primary: string;
    accent: string;
    text: string;
    extra?: string;
  } = data.look.palette ?? NEUTRAL;
  const swatches = [palette.primary, palette.accent, palette.text]
    .concat(palette.extra ? [palette.extra] : [])
    .map(
      (colour, index) =>
        `<rect x="${24 + index * 34}" y="118" width="26" height="26" rx="6" fill="${colour}" stroke="${palette.text}" stroke-opacity="0.25"/>`,
    )
    .join('');
  const icon = iconSvg(STYLE_ICONS[data.category], 40).replace(
    '<svg',
    `<svg x="24" y="24" color="${palette.accent}"`,
  );
  const label = escape(name.length > 26 ? `${name.slice(0, 25)}…` : name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="${palette.background}"/>${icon}<text x="24" y="98" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="600" fill="${palette.text}">${label}</text>${swatches}</svg>`;
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
