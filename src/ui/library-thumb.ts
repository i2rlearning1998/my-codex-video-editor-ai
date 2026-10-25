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

/** True when a picture has no visible pixel (fully transparent). */
export async function pictureIsBlank(url: string): Promise<boolean> {
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 18;
    const context = canvas.getContext('2d');
    if (!context) return false;
    context.drawImage(image, 0, 0, 32, 18);
    const { data } = context.getImageData(0, 0, 32, 18);
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 8) return false;
    return true;
  } catch {
    // Unreadable here (a picture the page cannot read back): keep it.
    return false;
  }
}

/** One service try: a picture URL, or null when the service had to fall back
 *  (it answers with its grey SVG stand-in) or drew nothing. */
async function fromService(source: ThumbSource): Promise<string | null> {
  try {
    const blob = await getThumbnail(
      {
        id: source.id,
        type: source.type,
        ...(source.data !== undefined ? { data: source.data } : {}),
        ...(source.revision ? { revision: source.revision } : {}),
      },
      SIZE,
    );
    if (blob.type === 'image/svg+xml') return null;
    const url = URL.createObjectURL(blob);
    if (await pictureIsBlank(url)) {
      URL.revokeObjectURL(url);
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/** Fills a card's thumbnail slot with a 16:9 picture. FIX5 C1: a card never
 *  stays blank. The kind icon shows first and stays when no picture can be
 *  made (an item's own picture that is empty, or a service fallback); the
 *  service is asked once more after a moment before giving up. */
export function libraryThumb(slot: HTMLElement, source: ThumbSource): void {
  const poster = document.createElement('span');
  poster.className = 'library-thumb-placeholder';
  const base = hue(source.id);
  poster.style.background = `linear-gradient(135deg, hsl(${base} 55% 42%), hsl(${(base + 60) % 360} 60% 30%))`;
  poster.innerHTML = iconSvg(ICON[source.type] ?? 'magic', 28);
  const show = (url: string, kind: 'image' | 'service', later = true) => {
    // (A late answer for a card that has left the page is dropped.)
    if (later && !slot.isConnected) return;
    slot.dataset.thumb = kind;
    slot.replaceChildren(imageOf(url));
  };
  slot.dataset.thumb = 'placeholder';
  slot.replaceChildren(poster);
  const key = keyOf(source);
  const ask = (retry: boolean) => {
    let url = urls.get(key);
    if (!url) {
      url = fromService(source);
      urls.set(key, url);
    }
    void url.then((found) => {
      if (found) return show(found, 'service');
      urls.delete(key);
      if (retry) window.setTimeout(() => ask(false), 1500);
    });
  };
  if (source.url) {
    const own = source.url;
    show(own, 'image', false);
    void pictureIsBlank(own).then((blank) => {
      if (!blank || !slot.isConnected) return;
      slot.dataset.thumb = 'placeholder';
      slot.replaceChildren(poster);
      ask(true);
    });
    return;
  }
  ask(true);
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
