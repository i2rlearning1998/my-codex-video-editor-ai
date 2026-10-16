// R3: the one place library cards get their thumbnails (Media, AI and My
// Templates). Until the thumbnail service (src/thumbnails) is wired in, a
// placeholder draws a 16:9 poster: the item's own picture when it has one,
// else a soft gradient with its kind's icon and initial. Callers never draw
// thumbnails themselves, so the service replaces only this file.
import { iconSvg } from './icons';

export interface ThumbSource {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly data?: unknown;
  /** A picture the item already has (a data URL or object URL). */
  readonly url?: string | null;
  readonly revision?: string;
}

const ICON: Record<string, string> = {
  shape: 'elements',
  background: 'graphics',
  text: 'text',
  template: 'templates',
  motion: 'animate',
  preset: 'animate',
  composition: 'scenes',
  effect: 'effects',
  theme: 'color',
  scene: 'scenes',
  group: 'group',
  image: 'image',
  video: 'media',
  audio: 'audio',
  animation: 'animate',
  annotation: 'pen',
  sticker: 'magic',
};
const hue = (text: string) => {
  let value = 0;
  for (let i = 0; i < text.length; i++)
    value = (value * 31 + text.charCodeAt(i)) % 360;
  return value;
};

/** Fills a card's thumbnail slot with a 16:9 picture. */
export function libraryThumb(slot: HTMLElement, source: ThumbSource): void {
  slot.dataset.thumb = source.url ? 'image' : 'placeholder';
  if (source.url) {
    const image = document.createElement('img');
    image.src = source.url;
    image.alt = '';
    image.draggable = false;
    slot.replaceChildren(image);
    return;
  }
  const poster = document.createElement('span');
  poster.className = 'library-thumb-placeholder';
  const base = hue(source.id);
  poster.style.background = `linear-gradient(135deg, hsl(${base} 55% 42%), hsl(${(base + 60) % 360} 60% 30%))`;
  poster.innerHTML = iconSvg(ICON[source.type] ?? 'magic', 28);
  slot.replaceChildren(poster);
}

/** Hover: a short looping preview (one card at a time); returns the stop. */
export function libraryPreview(
  slot: HTMLElement,
  source: ThumbSource,
): () => void {
  void source;
  slot.classList.add('library-thumb-playing');
  slot.dataset.playing = 'true';
  return () => {
    slot.classList.remove('library-thumb-playing');
    delete slot.dataset.playing;
  };
}
