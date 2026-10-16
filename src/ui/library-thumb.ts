// R3: the one place library cards get their thumbnails (Media, AI and My
// Templates). R6: an item's own picture when it has one, else the thumbnail
// service (src/thumbnails, Codex) renders it from the item's data; a soft
// placeholder shows until the service answers. Hover previews use the
// service's preview frames. Callers never draw thumbnails themselves.
import { getPreviewFrames, getThumbnail } from '../thumbnails';
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

const SIZE = { width: 320, height: 180 };
/** Service pictures, kept for the session per item and revision. */
const urls = new Map<string, Promise<string | null>>();
const keyOf = (source: ThumbSource) =>
  `${source.type}:${source.id}:${source.revision ?? ''}`;
const imageOf = (url: string) => {
  const image = document.createElement('img');
  image.src = url;
  image.alt = '';
  image.draggable = false;
  return image;
};

/** Fills a card's thumbnail slot with a 16:9 picture. */
export function libraryThumb(slot: HTMLElement, source: ThumbSource): void {
  slot.dataset.thumb = source.url ? 'image' : 'placeholder';
  if (source.url) {
    slot.replaceChildren(imageOf(source.url));
    return;
  }
  let url = urls.get(keyOf(source));
  if (!url) {
    url = getThumbnail(
      {
        id: source.id,
        type: source.type,
        ...(source.data !== undefined ? { data: source.data } : {}),
        ...(source.revision ? { revision: source.revision } : {}),
      },
      SIZE,
    ).then(
      (blob) => URL.createObjectURL(blob),
      () => null,
    );
    urls.set(keyOf(source), url);
  }
  void url.then((found) => {
    if (!found || !slot.isConnected) return;
    slot.dataset.thumb = 'service';
    slot.replaceChildren(imageOf(found));
  });
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
  const controller = new AbortController();
  let timer = 0;
  const shown: string[] = [];
  slot.classList.add('library-thumb-playing');
  slot.dataset.playing = 'true';
  void getPreviewFrames(
    {
      id: source.id,
      type: source.type,
      ...(source.data !== undefined ? { data: source.data } : {}),
    },
    { count: 12, width: 160, height: 90, signal: controller.signal },
  ).then(
    (frames) => {
      if (controller.signal.aborted || !frames.length) return;
      shown.push(...frames.map((frame) => URL.createObjectURL(frame)));
      const image = imageOf(shown[0]!);
      image.className = 'library-thumb-frame';
      slot.append(image);
      slot.classList.remove('library-thumb-playing');
      let frame = 0;
      timer = window.setInterval(() => {
        frame = (frame + 1) % shown.length;
        image.src = shown[frame]!;
        slot.dataset.playing = String(frame + 1);
      }, 1000 / 12);
    },
    () => undefined,
  );
  return () => {
    controller.abort();
    window.clearInterval(timer);
    slot.querySelector('.library-thumb-frame')?.remove();
    for (const url of shown) URL.revokeObjectURL(url);
    slot.classList.remove('library-thumb-playing');
    delete slot.dataset.playing;
  };
}
