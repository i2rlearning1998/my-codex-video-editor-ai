// V7 (Clipchamp clone spec 11.3): the left "Audio" category is the built-in
// sound pack: twelve tiles with name and length, a Play / Stop button (no
// hover play), click or drag to add at the playhead in a new audio lane. A click
// imports the sound like any file (a real audio asset, so it exports) and
// places it. "Stock music" is honestly Planned (no external service).
import { SOUND_PACK, encodeWav, soundSamples } from '../audio/sound-pack';
import { audioPlayButton, stopAudioPreview } from './components/audio-preview';
import { formatNumber, t } from '../i18n';
import { drags } from './drag-controller';
import { iconSvg } from './icons';

export interface SoundPackHost {
  /** Imports the WAV; resolves with the asset id. */
  importSound(file: File): Promise<string | null>;
  /** Adds the asset at the playhead in a new audio lane (one step). */
  add(assetId: string): void;
  /** The asset already imported for this file name, if any. */
  existing(fileName: string): string | null;
  report(error: unknown): void;
}

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
  const stock = document.createElement('div');
  stock.className = 'sound-pack-stock';
  stock.innerHTML = `${iconSvg('audio', 20)}<span></span><span class="quiet-tag"></span>`;
  stock.querySelector('span')!.textContent = t('sound.stock');
  stock.querySelector('.quiet-tag')!.textContent = t('right.planned');
  // FIX1 F5: stock music is the Audio category's Music tab now.
  host.replaceChildren(heading, search, list, empty);
  void stock;

  const urls: Record<string, string> = {};
  const fileOf = (id: string) => {
    const sound = SOUND_PACK.find((item) => item.id === id)!;
    const name = `${t(sound.key)}.wav`;
    return new File([encodeWav(soundSamples(sound)) as BlobPart], name, {
      type: 'audio/wav',
    });
  };
  /** The sound as an asset: imported once, found again by its file. */
  // (One import per sound at a time: the press and the click share it.)
  const pending = new Map<string, Promise<string | null>>();
  const ensure = (id: string) => {
    const file = fileOf(id);
    const found = options.existing(file.name);
    if (found) return Promise.resolve(found);
    let job = pending.get(id);
    if (!job) {
      job = options.importSound(file).finally(() => pending.delete(id));
      pending.set(id, job);
    }
    return job;
  };
  const ready = new Map<string, string>();

  const tiles = SOUND_PACK.map((sound) => {
    const tile = document.createElement('div');
    tile.className = 'sound-tile';
    tile.dataset.sound = sound.id;
    tile.setAttribute('role', 'listitem');
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'sound-tile-add';
    add.dataset.action = 'sound-add';
    add.title = t('sound.add', { name: t(sound.key) });
    add.setAttribute('aria-label', add.title);
    add.innerHTML = `${iconSvg('audioFile', 20)}<span class="sound-tile-name"></span><span class="sound-tile-length"></span>`;
    add.querySelector('.sound-tile-name')!.textContent = t(sound.key);
    add.querySelector('.sound-tile-length')!.textContent = t('sound.length', {
      seconds: formatNumber(Math.round(sound.duration * 10) / 10),
    });
    add.onclick = () => {
      void ensure(sound.id).then(
        (assetId) => {
          if (assetId) options.add(assetId);
        },
        (error: unknown) => options.report(error),
      );
    };
    // A press prepares the asset, so a drag that follows carries it.
    add.addEventListener('pointerdown', () => {
      if (ready.has(sound.id)) return;
      void ensure(sound.id).then(
        (assetId) => {
          if (assetId) ready.set(sound.id, assetId);
        },
        () => undefined,
      );
    });
    drags().source(add, () => {
      const id = ready.get(sound.id) ?? options.existing(fileOf(sound.id).name);
      return id
        ? {
            kind: 'asset',
            id,
            name: t(sound.key),
            media: 'audio',
            duration: sound.duration,
          }
        : null;
    });
    // FIX5 C2: no hover play; a Play / Stop button (one preview at a time).
    const preview = audioPlayButton(
      {
        id: `sound:${sound.id}`,
        name: t(sound.key),
        url: () => {
          urls[sound.id] ??= URL.createObjectURL(fileOf(sound.id));
          return urls[sound.id]!;
        },
      },
      'sound-tile-play',
    );
    preview.dataset.action = 'sound-preview';
    tile.append(add, preview);
    return tile;
  });
  list.replaceChildren(...tiles);
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    tiles.forEach((tile, index) => {
      const match =
        !query || t(SOUND_PACK[index]!.key).toLowerCase().includes(query);
      tile.hidden = !match;
      if (match) shown++;
    });
    empty.hidden = shown > 0;
  });
  return {
    dispose: () => {
      stopAudioPreview();
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    },
  };
}
