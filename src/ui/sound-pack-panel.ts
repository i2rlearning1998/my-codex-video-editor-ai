// V7 (Clipchamp clone spec 11.3): the left "Audio" category is the built-in
// sound pack: twelve tiles with name and length, a play / pause preview on
// hover, click or drag to add at the playhead in a new audio lane. A click
// imports the sound like any file (a real audio asset, so it exports) and
// places it. "Stock music" is honestly Planned (no external service).
import { SOUND_PACK, encodeWav, soundSamples } from '../audio/sound-pack';
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

  // Preview: one shared context, one sound at a time.
  let context: AudioContext | null = null;
  let playing: { id: string; node: AudioBufferSourceNode } | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const stop = () => {
    if (!playing) return;
    try {
      playing.node.stop();
    } catch {
      // Already over.
    }
    list
      .querySelector(`[data-sound="${playing.id}"] .sound-tile-play`)
      ?.setAttribute('aria-pressed', 'false');
    playing = null;
  };
  const play = (id: string) => {
    const sound = SOUND_PACK.find((item) => item.id === id)!;
    stop();
    context ??= new AudioContext({ sampleRate: 48_000 });
    let buffer = buffers.get(id);
    if (!buffer) {
      buffer = context.createBuffer(
        1,
        Math.round(sound.duration * 48_000),
        48_000,
      );
      buffer.copyToChannel(soundSamples(sound) as Float32Array<ArrayBuffer>, 0);
      buffers.set(id, buffer);
    }
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    node.onended = () => {
      if (playing?.node === node) stop();
    };
    node.start();
    playing = { id, node };
    list
      .querySelector(`[data-sound="${id}"] .sound-tile-play`)
      ?.setAttribute('aria-pressed', 'true');
  };
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
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'icon-button sound-tile-play';
    preview.dataset.action = 'sound-preview';
    preview.setAttribute('aria-pressed', 'false');
    preview.title = t('sound.preview', { name: t(sound.key) });
    preview.setAttribute('aria-label', preview.title);
    preview.innerHTML = iconSvg('play', 20);
    preview.onclick = () =>
      playing?.id === sound.id ? stop() : play(sound.id);
    tile.addEventListener('pointerenter', () => {
      if (playing?.id !== sound.id) play(sound.id);
    });
    tile.addEventListener('pointerleave', () => {
      if (playing?.id === sound.id) stop();
    });
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
      stop();
      void context?.close();
    },
  };
}
