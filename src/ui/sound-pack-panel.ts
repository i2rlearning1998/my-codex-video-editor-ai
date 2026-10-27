// V7 (Clipchamp clone spec 11.3): the left "Audio" category's sound effects:
// tiles with name and length, a Play / Stop button (no hover play), click or
// drag to add at the playhead in a new audio lane. Phase 1 library (P1-22,
// P1-25): the sounds come from the signed catalog. A tile prefetches its
// small proxy when it shows, so a click or drop places the sound at once;
// the full file follows in the background and replaces the proxy.
import { audioPlayButton, stopAudioPreview } from './components/audio-preview';
import { formatNumber, getLanguage, t } from '../i18n';
import { drags } from './drag-controller';
import { iconSvg } from './icons';
import type { CatalogEntry } from '../library-client/format';

export interface SoundPackHost {
  /** The catalog's sound entries (listed and ordered). */
  entries(): CatalogEntry[];
  /** Called when the catalog changed. */
  onChange(listener: () => void): () => void;
  /** Makes the entry local (proxy and waveform) before it is used. */
  prefetch(entry: CatalogEntry): void;
  /** The entry's asset, made now (one id per sound). */
  ensure(entry: CatalogEntry): string;
  /** Adds the asset at the playhead in a new audio lane (one step). */
  add(assetId: string): void;
  /** An address to preview the sound (the proxy, else the full file). */
  previewUrl(entry: CatalogEntry): Promise<string | null>;
  report(error: unknown): void;
}

/** The tile's stable name: the catalog id without its `sound-` prefix. */
export const soundTileId = (entry: CatalogEntry) =>
  entry.id.replace(/^sound-/, '');

export function mountSoundPack(host: HTMLElement, options: SoundPackHost) {
  host.classList.add('sound-pack');
  const heading = document.createElement('h3');
  heading.className = 'sound-pack-title';
  heading.textContent = t('sound.title');
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'sound-pack-search';
  search.placeholder = t('sound.search');
  search.setAttribute('aria-label', t('sound.search'));
  const list = document.createElement('div');
  list.className = 'sound-pack-list';
  list.setAttribute('role', 'list');
  const empty = document.createElement('p');
  empty.className = 'sound-pack-empty';
  empty.textContent = t('sound.noMatch');
  empty.hidden = true;
  host.replaceChildren(heading, search, list, empty);

  const nameOf = (entry: CatalogEntry) =>
    entry.name[getLanguage()] || entry.name.en;
  let shown: CatalogEntry[] = [];
  const tileFor = (entry: CatalogEntry) => {
    const tile = document.createElement('div');
    tile.className = 'sound-tile';
    tile.dataset.sound = soundTileId(entry);
    tile.dataset.catalogId = entry.id;
    tile.setAttribute('role', 'listitem');
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'sound-tile-add';
    add.dataset.action = 'sound-add';
    add.title = t('sound.add', { name: nameOf(entry) });
    add.setAttribute('aria-label', add.title);
    add.innerHTML = `${iconSvg('audioFile', 20)}<span class="sound-tile-name"></span><span class="sound-tile-length"></span>`;
    add.querySelector('.sound-tile-name')!.textContent = nameOf(entry);
    add.querySelector('.sound-tile-length')!.textContent = t('sound.length', {
      seconds: formatNumber(Math.round((entry.media?.duration ?? 0) * 10) / 10),
    });
    add.onclick = () => {
      try {
        options.add(options.ensure(entry));
      } catch (error) {
        options.report(error);
      }
    };
    const warm = () => options.prefetch(entry);
    add.addEventListener('pointerenter', warm);
    // A press prepares the asset (as before), so a drag that follows
    // carries it; nothing waits for the network.
    add.addEventListener('pointerdown', () => {
      warm();
      try {
        options.ensure(entry);
      } catch (error) {
        options.report(error);
      }
    });
    drags().source(add, () => {
      try {
        return {
          kind: 'asset',
          id: options.ensure(entry),
          name: nameOf(entry),
          media: 'audio',
          duration: entry.media?.duration ?? 0,
        };
      } catch {
        return null;
      }
    });
    // FIX5 C2: no hover play; a Play / Stop button (one preview at a time).
    const preview = audioPlayButton(
      {
        id: `sound:${soundTileId(entry)}`,
        name: nameOf(entry),
        url: () => options.previewUrl(entry),
      },
      'sound-tile-play',
    );
    preview.dataset.action = 'sound-preview';
    tile.append(add, preview);
    return tile;
  };
  const filter = () => {
    const query = search.value.trim().toLowerCase();
    let count = 0;
    [...list.children].forEach((tile, index) => {
      const entry = shown[index]!;
      const match =
        !query ||
        nameOf(entry).toLowerCase().includes(query) ||
        entry.name.en.toLowerCase().includes(query);
      (tile as HTMLElement).hidden = !match;
      if (match) count++;
    });
    empty.hidden = count > 0;
  };
  const render = () => {
    shown = options.entries();
    list.replaceChildren(...shown.map(tileFor));
    // FIX6: a tile warms its sound when it is on screen. Warming every
    // tile at start-up (the panel is built hidden) downloaded all the
    // sounds before anyone opened Audio.
    seen?.disconnect();
    if (seen)
      [...list.children].forEach((tile, index) => {
        tiles.set(tile, shown[index]!);
        seen!.observe(tile);
      });
    filter();
  };
  const tiles = new WeakMap<Element, CatalogEntry>();
  const seen =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((records) => {
          for (const record of records) {
            if (!record.isIntersecting) continue;
            seen?.unobserve(record.target);
            const entry = tiles.get(record.target);
            if (entry) options.prefetch(entry);
          }
        });
  search.addEventListener('input', filter);
  render();
  const stop = options.onChange(render);
  return {
    dispose: () => {
      stop();
      seen?.disconnect();
      stopAudioPreview();
    },
  };
}
