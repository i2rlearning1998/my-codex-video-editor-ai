// FIX5 C2: the one audio preview for every sound row (Audio category, Media,
// Elements › Audio, My audio). Hovering never plays; each row has a Play /
// Stop button. One preview at a time: starting another, closing the panel or
// switching category stops the first, and a finished preview resets its button.
import { t } from '../../i18n';
import type { MediaStore } from '../../media/store';
import { iconSvg } from '../icons';

export interface AudioPreviewSource {
  readonly id: string;
  readonly name: string;
  /** The sound's address (an object URL, a data URL or an https link). */
  readonly url: () => string | null | Promise<string | null>;
}

interface Current {
  readonly id: string;
  readonly audio: HTMLAudioElement;
}
let current: Current | null = null;
const buttons = new Set<Entry>();
let onFailure: (() => void) | null = null;

type Entry = {
  readonly id: string;
  readonly button: HTMLButtonElement;
  readonly name: string;
};
const paint = (entry: Entry) => {
  const on = current?.id === entry.id;
  const label = t(on ? 'audioPreview.stop' : 'audioPreview.play', {
    name: entry.name,
  });
  entry.button.setAttribute('aria-pressed', String(on));
  entry.button.setAttribute('aria-label', label);
  entry.button.title = label;
  entry.button.dataset.state = on ? 'playing' : 'stopped';
  entry.button.innerHTML = iconSvg(on ? 'pause' : 'play', 16);
};
const sync = () => {
  for (const entry of buttons) {
    // A button is painted when made; later ones that left the page are dropped.
    if (!entry.button.isConnected) buttons.delete(entry);
    else paint(entry);
  }
};

/** Stops the running preview (a panel closed or the category changed). */
export function stopAudioPreview() {
  const running = current;
  current = null;
  if (running) {
    running.audio.onended = null;
    running.audio.pause();
  }
  sync();
}

/** The app's message when a preview cannot start. */
export function onAudioPreviewFailure(handler: () => void) {
  onFailure = handler;
}

async function start(source: AudioPreviewSource) {
  stopAudioPreview();
  const marker = new Audio();
  current = { id: source.id, audio: marker };
  sync();
  try {
    const url = await source.url();
    if (current?.audio !== marker) return;
    if (!url) throw new Error('No sound');
    marker.src = url;
    marker.onended = () => {
      if (current?.audio === marker) stopAudioPreview();
    };
    await marker.play();
  } catch {
    if (current?.audio === marker) stopAudioPreview();
    onFailure?.();
  }
}

/** A Play / Stop button for one sound row. */
export function audioPlayButton(
  source: AudioPreviewSource,
  className = '',
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-button audio-play ${className}`.trim();
  button.dataset.action = 'audio-play';
  button.dataset.previewId = source.id;
  const entry = { id: source.id, button, name: source.name };
  buttons.add(entry);
  paint(entry);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (current?.id === source.id) stopAudioPreview();
    else void start(source);
  });
  // A press must not start a card drag.
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  return button;
}

const mediaUrls = new Map<string, string>();
/** An object URL for the bytes stored under `media/<fingerprint>` (kept for the session). */
export async function mediaPreviewUrl(
  store: Promise<MediaStore | null>,
  key: string,
): Promise<string | null> {
  const known = mediaUrls.get(key);
  if (known) return known;
  const blob = await (await store)?.read(key);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  mediaUrls.set(key, url);
  return url;
}
