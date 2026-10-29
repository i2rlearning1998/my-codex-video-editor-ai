import { drags } from './drag-controller';
import type { EditorEngine } from '../core';
import {
  importMediaFiles,
  isAbort,
  probeMedia,
  STRIP_FRAMES,
  type ImportOutcome,
  type MediaPreviews,
  type MediaStore,
  type WaveformCache,
} from '../media';
import { formatDuration, formatNumber, t } from '../i18n';
import {
  confirmDialog,
  escapeHtml,
  openModal,
  promptDialog,
} from './components/modal';
import { showToast } from './components/toast';
import { attachStockLicense, type LicenseMeta } from '../providers';
import { iconSvg } from './icons';
import { mountShelf, type Shelf, type ShelfItem } from './library-shelf';
import { mediaFolders } from './media-folders';
import {
  codecMessage,
  probeNotes,
  probeRows,
  storedDetails,
} from './media-probe-info';
import type { EditorSession } from './session';

/** I1.7: how long a deleted media item can be restored before its stored
 *  files are removed for real. */
export const MEDIA_RESTORE_MS = 8000;

export interface MediaPanelOptions {
  container: HTMLElement;
  engine: EditorEngine;
  session: EditorSession;
  store: Promise<MediaStore | null>;
  previews: MediaPreviews;
  waveforms: WaveformCache;
  /** Called after an import, so other media views can look for new bytes. */
  imported?(): void;
  /** I1.7 "Add to scene": the asset as a layer with a clip at the playhead. */
  place?(assetId: string): void;
  /** I2: opens the file picker (the drop zone's click). */
  pick?(): void;
  toast(text: string, kind: 'info' | 'success' | 'error'): void;
  /** R4: the Import button row, shown as the panel's primary action. */
  importRow?: HTMLElement;
  /** R4: the title row's collapse button. */
  collapse?(): void;
}

/** The asset fields the panel reads (structural, to keep the readonly types shallow). */
interface Asset {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly source: { readonly kind: string; readonly reference: string };
  readonly duration?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly metadata: {
    readonly mimeType?: unknown;
    readonly size?: unknown;
    readonly fileName?: unknown;
    readonly fingerprint?: unknown;
    readonly removed?: unknown;
    readonly design?: unknown;
  };
}

const KIND_ICON: Record<string, string> = {
  video: 'media',
  audio: 'audio',
  image: 'graphics',
};
/** I1.7: a deleted (soft-removed) asset stays as a reference until its
 *  restore window ends; the panel no longer lists it. */
const removed = (asset: Asset) => asset.metadata.removed === true;
const listed = (asset: Asset) =>
  ['video', 'audio', 'image'].includes(asset.type) &&
  asset.source.kind !== 'generated' &&
  !removed(asset);
/** I2: the Media categories. Designs are frames saved with "Save to
 *  Media". R4: a tab shows only while its category has media. */
const MEDIA_CATEGORIES = ['image', 'video', 'audio', 'design'] as const;
export type MediaSort = 'added' | 'newest' | 'name' | 'duration';
const MEDIA_SORTS: readonly MediaSort[] = [
  'added',
  'newest',
  'name',
  'duration',
];
const isDesign = (asset: Asset) => asset.metadata.design === true;
const fingerprintOf = (asset: Asset) =>
  typeof asset.metadata.fingerprint === 'string'
    ? asset.metadata.fingerprint
    : asset.source.reference.replace(/^media\//, '');

/**
 * Project Media (MED-007/MED-009/MED-018/MED-035): the card grid, the import row
 * with progress and Cancel (MED-004) and the empty and error states. Bytes and
 * thumbnails come from the media store; the project keeps references only.
 */
export function mountMediaPanel(options: MediaPanelOptions) {
  const { container, engine, session } = options;
  // R4: the shared library panel; the drop zone, sort and import progress
  // sit under the Import row.
  const extras = document.createElement('div');
  extras.className = 'media-extras';
  extras.innerHTML = `
    <button type="button" class="media-dropzone" id="media-dropzone"></button>
    <div class="media-toolbar" id="media-toolbar"><label class="media-sort-label"><span id="media-sort-caption"></span><select id="media-sort"></select></label></div>
    <div class="media-import" id="media-import" role="status" hidden>
      <div class="media-import-text"><span id="media-import-label"></span><span id="media-import-percent"></span></div>
      <progress id="media-import-bar" max="100" value="0"></progress>
      <button type="button" class="button" id="media-import-cancel"></button>
    </div>`;
  const find = <T extends HTMLElement>(selector: string) =>
    (container.querySelector<T>(selector) ??
      extras.querySelector<T>(selector))!;
  let storeState: 'opening' | 'ready' | 'unavailable' = 'opening';
  let sort: MediaSort = 'added';
  let controller: AbortController | null = null;
  let disposed = false;

  const store = options.store.then((value) => {
    storeState = value ? 'ready' : 'unavailable';
    render();
    return value;
  });

  // MED-018: thumbnails come from the shared, store-cached preview service.
  // MED-019: audio cards draw their waveform instead of a picture.
  const setWaveform = (card: HTMLElement, asset: Asset) => {
    const slot = card.querySelector<HTMLElement>('.media-thumb')!;
    const wave = options.waveforms.waveform(asset);
    if (card.dataset.waveform === wave.state) return;
    card.dataset.waveform = wave.state;
    card.dataset.thumbnail = 'none';
    if (wave.state !== 'ready') {
      slot.innerHTML = `${iconSvg('audio', 22)}${
        wave.state === 'loading'
          ? `<span class="media-thumb-loading" aria-hidden="true"></span>`
          : ''
      }`;
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.className = 'media-waveform';
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-waveform')
        .trim();
      const peaks = wave.peaks;
      for (let x = 0; x < canvas.width; x++) {
        const from = Math.floor((x / canvas.width) * peaks.length);
        const to = Math.max(
          from + 1,
          Math.floor(((x + 1) / canvas.width) * peaks.length),
        );
        let peak = 0;
        for (let index = from; index < to; index++)
          peak = Math.max(peak, peaks[index] ?? 0);
        const height = Math.max(1, (peak / wave.max) * canvas.height * 0.8);
        context.fillRect(x, (canvas.height - height) / 2, 1, height);
      }
    }
    slot.replaceChildren(canvas);
  };
  const setThumb = (card: HTMLElement, asset: Asset) => {
    if (asset.type === 'audio') {
      setWaveform(card, asset);
      return;
    }
    const slot = card.querySelector<HTMLElement>('.media-thumb')!;
    const thumb = options.previews.thumbnail(asset);
    if (card.dataset.thumbnail === thumb.state && thumb.state !== 'ready')
      return;
    card.dataset.thumbnail = thumb.state;
    if (thumb.state === 'ready') {
      if (slot.querySelector('img')?.getAttribute('src') === thumb.url) return;
      const image = document.createElement('img');
      image.src = thumb.url;
      image.alt = '';
      // T1: a thumbnail is never a browser drag source of its own.
      image.draggable = false;
      slot.replaceChildren(image);
    } else
      slot.innerHTML = `${iconSvg(KIND_ICON[asset.type] ?? 'media', 22)}${
        thumb.state === 'loading'
          ? `<span class="media-thumb-loading" aria-hidden="true"></span>`
          : ''
      }`;
  };
  const updateThumbnails = () => {
    for (const card of shelf.grid.querySelectorAll<HTMLElement>(
      '.media-card',
    )) {
      const asset = (session.source.assets as unknown as readonly Asset[]).find(
        (item) => item.id === card.dataset.assetId,
      );
      if (asset) setThumb(card, asset);
    }
  };
  // MED-012: moving the pointer across a video's picture scrubs through its
  // filmstrip (made once in the background, cached with the thumbnails).
  const scrubbed = new Map<HTMLElement, number>();
  const scrubAt = (card: HTMLElement, x: number) => {
    const asset = (session.source.assets as unknown as readonly Asset[]).find(
      (item) => item.id === card.dataset.assetId,
    );
    const slot = card.querySelector<HTMLElement>('.media-thumb');
    if (!asset || asset.type !== 'video' || !slot) return;
    const strip = options.previews.strip(asset);
    if (strip.state !== 'ready') return;
    const box = slot.getBoundingClientRect();
    const ratio = box.width
      ? Math.min(1, Math.max(0, (x - box.left) / box.width))
      : 0;
    const index = Math.min(STRIP_FRAMES - 1, Math.floor(ratio * STRIP_FRAMES));
    let layer = slot.querySelector<HTMLElement>('.media-scrub');
    if (!layer) {
      layer = document.createElement('span');
      layer.className = 'media-scrub';
      layer.setAttribute('aria-hidden', 'true');
      layer.style.backgroundImage = `url("${strip.url}")`;
      layer.style.backgroundSize = `${STRIP_FRAMES * 100}% 100%`;
      slot.append(layer);
    }
    layer.dataset.frame = String(index);
    layer.style.backgroundPosition = `${(index / (STRIP_FRAMES - 1)) * 100}% 0`;
    scrubbed.set(card, index);
  };
  const stopScrub = (card: HTMLElement) => {
    card.querySelector('.media-scrub')?.remove();
    scrubbed.delete(card);
  };
  const unsubscribePreviews = options.previews.onChange(updateThumbnails);
  container.addEventListener('pointermove', (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>(
      '.media-card',
    );
    if (card) scrubAt(card, event.clientX);
  });
  container.addEventListener(
    'pointerout',
    (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>(
        '.media-card',
      );
      if (
        card &&
        !(
          event.relatedTarget instanceof Node &&
          card.contains(event.relatedTarget)
        )
      )
        stopScrub(card);
    },
    true,
  );
  const unsubscribeWaveforms = options.waveforms.onChange(updateThumbnails);

  const badge = (asset: Asset) =>
    asset.type === 'image'
      ? t('media.image')
      : asset.duration !== undefined
        ? formatDuration(asset.duration).replace(/^00:/, '')
        : t(`media.${asset.type}`);

  // I2: the drop zone and sort.
  const dropzone = find<HTMLButtonElement>('#media-dropzone');
  dropzone.onclick = () => options.pick?.();
  dropzone.ondragover = (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    dropzone.classList.add('over');
  };
  dropzone.ondragleave = () => dropzone.classList.remove('over');
  dropzone.ondrop = (event) => {
    dropzone.classList.remove('over');
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    event.stopPropagation();
    void importFiles([...event.dataTransfer.files]);
  };
  const sortSelect = find<HTMLSelectElement>('#media-sort');
  sortSelect.onchange = () => {
    sort = sortSelect.value as MediaSort;
    render();
  };
  const sorted = (list: readonly Asset[]) => {
    const copy = [...list];
    if (sort === 'newest') copy.reverse();
    else if (sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'duration')
      copy.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
    return copy;
  };
  const hasAny = () =>
    (session.source.assets as unknown as readonly Asset[]).some(listed);
  /** One shelf card per listed asset. */
  const shelfItem = (asset: Asset): ShelfItem => ({
    id: asset.id,
    name: asset.name,
    category: isDesign(asset) ? 'design' : asset.type,
    folderId: mediaFolders.folderOf(engine.state.id, asset.id),
    title: t('asset.drag', { name: asset.name }),
    badge: badge(asset),
    data: { assetId: asset.id, name: asset.name, kind: asset.type },
    thumb: () => undefined,
    // T1: one pointer-driven drag (no browser drag, no draggable thumbnail
    // image); a plain click adds the media to the scene.
    drag: () => ({
      kind: 'asset',
      id: asset.id,
      name: asset.name,
      media: asset.type as 'image' | 'video' | 'audio',
      duration: asset.duration && asset.duration > 0 ? asset.duration : 5,
      ...(asset.width && asset.height
        ? { width: asset.width, height: asset.height }
        : {}),
    }),
    // I2: a video previews its filmstrip while hovered.
    ...(asset.type === 'video'
      ? {
          preview: (slot: HTMLElement) => {
            const strip = options.previews.strip(asset);
            if (strip.state !== 'ready') return () => undefined;
            const hover = document.createElement('span');
            hover.className = 'media-hover';
            hover.style.backgroundImage = `url("${strip.url}")`;
            slot.append(hover);
            let frame = 0;
            const step = () => {
              hover.style.backgroundPosition = `${(frame % 12) * (100 / 11)}% 0`;
              frame++;
            };
            step();
            const timer = window.setInterval(step, 160);
            return () => {
              window.clearInterval(timer);
              hover.remove();
            };
          },
        }
      : {}),
    decorate: (card) => {
      card.innerHTML = '';
      card.insertAdjacentHTML(
        'afterbegin',
        `<span class="shelf-thumb media-thumb"></span><span class="media-badge"></span><span class="shelf-name media-name"></span>`,
      );
      card.querySelector('.media-badge')!.textContent = badge(asset);
      card.querySelector('.media-name')!.textContent = asset.name;
      setThumb(card, asset);
    },
  });
  const project = () => engine.state.id;
  // FIX1 F1: Sort scrolls with the cards, under the fixed chips.
  const moveSort = () => {
    const body = container.querySelector('.shelf-body');
    const sort = extras.querySelector('#media-toolbar');
    if (body && sort) body.prepend(sort);
  };
  const shelf: Shelf = mountShelf({
    host: container,
    prefix: 'media',
    title: t('library.media'),
    classes: { item: 'media-item', card: 'media-card', thumb: 'media-thumb' },
    searchId: 'asset-search',
    searchLabel: t('library.searchPlaceholder'),
    extra: [...(options.importRow ? [options.importRow] : []), extras],
    categoryLabel: (key) => t(`media.tab.${key}`),
    // T-ALL P1: the illustrated empty state.
    illustration: `<svg class="media-illustration" data-media-illustration viewBox="0 0 160 110" aria-hidden="true"><rect x="6" y="18" width="148" height="86" rx="12" fill="none" stroke="var(--border-strong, var(--color-border))" stroke-width="2" stroke-dasharray="6 5"/><rect x="22" y="40" width="70" height="44" rx="6" fill="var(--surface-raised, var(--color-bg-raised))" stroke="var(--color-border)"/><path d="M28 78l16-18 12 12 8-8 22 14z" fill="var(--accent-soft, var(--color-accent-soft))" stroke="var(--accent-text)" stroke-width="1.5" stroke-linejoin="round"/><circle cx="76" cy="52" r="5" fill="var(--accent-text)"/><rect x="70" y="26" width="70" height="44" rx="6" fill="var(--surface-raised, var(--color-bg-raised))" stroke="var(--color-border)" transform="rotate(8 105 48)"/><path d="M98 40l16 9-16 9z" fill="var(--accent-text)" transform="rotate(8 105 48)"/><path d="M118 74c0-6 4-9 8-7l2 1v-12a4 4 0 018 0v14l6 2c3 1 4 4 3 7l-3 10h-18z" fill="var(--color-bg)" stroke="var(--color-text)" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    categoryOrder: MEDIA_CATEGORIES,
    // S1: Images, Videos and Audio always show, even with no media.
    fixedCategories: ['image', 'video', 'audio'],
    flatAll: true,
    folders: {
      list: () => mediaFolders.list(project()),
      create: (name) => mediaFolders.create(project(), name),
      move: (id, folderId) => mediaFolders.move(project(), id, folderId),
      rename: (id, name) => mediaFolders.rename(project(), id, name),
      remove: (id) => mediaFolders.remove(project(), id),
    },
    items: () =>
      sorted(
        (session.source.assets as unknown as readonly Asset[]).filter(listed),
      ).map(shelfItem),
    add: (id) => options.place?.(id),
    rename: (id) => void rename(id),
    details: (id) => details(id),
    remove: (id) => void remove(id),
    prompt: (title, value) =>
      promptDialog(title, value, {
        label: t('media.folder.name'),
        confirmLabel: value
          ? t('media.rename.confirm')
          : t('media.folder.create'),
        cancelLabel: t('media.cancel'),
      }),
    empty: () =>
      hasAny()
        ? {
            title: t('media.tabEmptyTitle'),
            description: t('media.folderEmptyDescription'),
          }
        : {
            title: t('media.emptyTitle'),
            description: t('media.emptyDescription'),
          },
    status: () =>
      storeState === 'unavailable'
        ? {
            kind: 'error',
            title: t('media.unavailableTitle'),
            description: t('media.unavailableDescription'),
          }
        : storeState === 'opening' && !hasAny()
          ? {
              kind: 'loading',
              title: t('media.loadingTitle'),
              description: t('media.loadingDescription'),
            }
          : null,
    report: (error) =>
      options.toast(
        error instanceof Error ? error.message : String(error),
        'error',
      ),
    toast: (text) => options.toast(text, 'success'),
  });
  moveSort();
  const grid = shelf.grid;
  function render() {
    if (disposed) return;
    dropzone.textContent = t('media.dropzone');
    find('#media-sort-caption').textContent = t('media.sort');
    if (!sortSelect.options.length)
      for (const id of MEDIA_SORTS) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = t(`media.sortBy.${id}`);
        sortSelect.append(option);
      }
    sortSelect.value = sort;
    find('#media-import-cancel').textContent = t('media.cancel');
    shelf.render();
  }

  // I1.7: Rename, Delete and folders are library changes: never on the
  // Undo stack (docs/UNDO-RULES.md). R4: the menu is the shared panel's.
  const assetById = (id: string) =>
    (engine.state.assets as unknown as readonly Asset[]).find(
      (asset) => asset.id === id,
    );
  /** Clips (in every scene) that play this asset or its detached audio. */
  const usage = (id: string) => {
    const derived = new Set(
      (engine.state.assets as unknown as readonly Asset[])
        .filter((asset) => asset.source.reference === `audio-of:${id}`)
        .map((asset) => asset.id),
    );
    let count = 0;
    for (const composition of engine.state.compositions)
      for (const track of composition.tracks)
        for (const clip of track.clips)
          if (
            clip.assetId === id ||
            (clip.assetId && derived.has(clip.assetId))
          )
            count++;
    return count;
  };
  const replaceAsset = (label: string, asset: Asset) =>
    engine.library(label, [
      {
        type: 'REPLACE_ASSET',
        assetId: asset.id,
        asset: structuredClone(asset) as never,
      },
    ]);
  const setRemoved = (id: string, value: boolean) => {
    const asset = assetById(id);
    if (!asset) return;
    const metadata: Record<string, unknown> = { ...asset.metadata };
    if (value) metadata.removed = true;
    else delete metadata.removed;
    replaceAsset(value ? 'Delete media' : 'Restore media', {
      ...asset,
      metadata: metadata as Asset['metadata'],
    });
  };
  /** Pending removals: the stored files go once the restore window ends. */
  const purges = new Map<string, number>();
  const purge = async (id: string) => {
    purges.delete(id);
    const asset = assetById(id);
    if (!asset || !removed(asset)) return;
    const media = await store;
    if (!media) return;
    const fingerprint = fingerprintOf(asset);
    await Promise.all(
      ['media', 'thumbs', 'strips', 'waves'].map((folder) =>
        media.remove(`${folder}/${fingerprint}`).catch(() => undefined),
      ),
    );
    mediaFolders.move(engine.state.id, id, null);
  };
  const restore = (id: string) => {
    window.clearTimeout(purges.get(id));
    purges.delete(id);
    setRemoved(id, false);
    options.previews.retry();
    options.waveforms.retry();
  };
  const remove = async (id: string) => {
    const asset = assetById(id);
    if (!asset) return;
    const count = usage(id);
    if (
      count &&
      !(await confirmDialog(
        escapeHtml(t('media.delete.inUse', { name: asset.name, count })),
        {
          titleText: escapeHtml(t('media.delete.title', { name: asset.name })),
          confirmLabel: t('media.menu.delete'),
          cancelLabel: t('media.cancel'),
          danger: true,
        },
      ))
    )
      return;
    setRemoved(id, true);
    purges.set(
      id,
      window.setTimeout(() => void purge(id), MEDIA_RESTORE_MS),
    );
    showToast(
      t('media.deleted', { name: asset.name }),
      'info',
      MEDIA_RESTORE_MS,
      {
        label: t('media.restore'),
        run: () => restore(id),
      },
    );
  };
  const rename = async (id: string) => {
    const asset = assetById(id);
    if (!asset) return;
    const name = await promptDialog(t('media.rename.title'), asset.name, {
      label: t('media.rename.label'),
      confirmLabel: t('media.rename.confirm'),
      cancelLabel: t('media.cancel'),
    });
    const current = assetById(id);
    if (!name || !current || name === current.name) return;
    replaceAsset('Rename media', { ...current, name });
  };
  const details = (id: string) => {
    const asset = assetById(id);
    if (!asset) return;
    const rows: [string, string][] = [
      [t('media.details.name'), asset.name],
      [t('media.details.type'), t(`media.${asset.type}`)],
    ];
    if (typeof asset.metadata.fileName === 'string')
      rows.push([t('media.details.file'), asset.metadata.fileName]);
    if (typeof asset.metadata.size === 'number')
      rows.push([
        t('media.details.size'),
        t('media.details.megabytes', {
          size: formatNumber(
            Math.round((asset.metadata.size / 1048576) * 10) / 10,
          ),
        }),
      ]);
    if (asset.width && asset.height)
      rows.push([
        t('media.details.dimensions'),
        `${formatNumber(asset.width)} × ${formatNumber(asset.height)}`,
      ]);
    if (asset.duration !== undefined)
      rows.push([t('media.details.duration'), formatDuration(asset.duration)]);
    // FINAL2 U8: what the media probe read (codec, frame rate, rotation...).
    const probed = storedDetails(asset.metadata);
    if (probed) rows.push(...probeRows(probed));
    // FINAL2 U2: the stock credit (author, provider, licence).
    const credit = (asset.metadata as Record<string, unknown>).stockLicense as
      | {
          author?: unknown;
          attributionText?: unknown;
          license?: { name?: unknown };
        }
      | undefined;
    if (credit && typeof credit === 'object') {
      if (typeof credit.attributionText === 'string' && credit.attributionText)
        rows.push([t('media.details.credit'), credit.attributionText]);
      if (typeof credit.license?.name === 'string')
        rows.push([t('media.details.licence'), credit.license.name]);
    }
    rows.push([
      t('media.details.used'),
      t('media.details.clips', { count: usage(id) }),
    ]);
    openModal({
      titleText: escapeHtml(t('media.details.title', { name: asset.name })),
      bodyBuilder: (body) => {
        const list = document.createElement('dl');
        list.className = 'media-details';
        for (const [term, value] of rows) {
          const dt = document.createElement('dt');
          dt.textContent = term;
          const dd = document.createElement('dd');
          dd.textContent = value;
          list.append(dt, dd);
        }
        body.append(list);
        for (const note of probed ? probeNotes(probed, asset.name) : []) {
          const line = document.createElement('p');
          line.className = 'media-details-note';
          line.textContent = note;
          body.append(line);
        }
      },
    });
  };
  const unsubscribeFolders = mediaFolders.onChange(() => render());
  // T1: a Media card dragged (pointer drag) onto a folder moves into it.
  const folderUnder = (element: Element) =>
    element.closest<HTMLElement>(
      '#media-panel .shelf-folder-tab[data-folder-id]',
    );
  const unregisterFolders = drags().register({
    contains: (element) => !!folderUnder(element),
    over(payload, point) {
      for (const item of container.querySelectorAll('.shelf-folder-tab.over'))
        item.classList.remove('over');
      if (payload.kind !== 'asset' || !point.element) return false;
      folderUnder(point.element)?.classList.add('over');
      return true;
    },
    leave() {
      for (const item of container.querySelectorAll('.shelf-folder-tab.over'))
        item.classList.remove('over');
    },
    drop(payload, point) {
      const folder = point.element && folderUnder(point.element);
      if (!folder || payload.kind !== 'asset') return;
      const project = engine.state.id;
      const target = mediaFolders
        .list(project)
        .find((item) => item.id === folder.dataset.folderId);
      if (!target) return;
      mediaFolders.move(project, payload.id, target.id);
      options.toast(t('media.folder.moved', { name: target.name }), 'success');
    },
  });

  const showProgress = (
    fileName: string,
    index: number,
    count: number,
    fraction: number,
  ) => {
    const row = find('#media-import');
    row.hidden = false;
    const percent = Math.round(fraction * 100);
    find('#media-import-label').textContent =
      count > 1
        ? t('media.importingMany', {
            name: fileName,
            index: formatNumber(index + 1),
            count: formatNumber(count),
          })
        : t('media.importing', { name: fileName });
    find('#media-import-percent').textContent = t('media.percent', {
      percent: formatNumber(percent),
    });
    find<HTMLProgressElement>('#media-import-bar').value = percent;
  };
  find<HTMLButtonElement>('#media-import-cancel').onclick = () =>
    controller?.abort();

  const summarize = (
    outcomes: readonly ImportOutcome[],
    cancelled: boolean,
  ) => {
    const imported = outcomes.filter((item) => item.status === 'imported');
    if (imported.length)
      options.toast(t('media.imported', { count: imported.length }), 'success');
    for (const outcome of outcomes) {
      if (outcome.status === 'duplicate')
        options.toast(t('media.duplicate', { name: outcome.fileName }), 'info');
      else if (outcome.status === 'unsupported')
        options.toast(
          t('media.unsupported', { name: outcome.fileName }),
          'error',
        );
      else if (outcome.status === 'unreadable')
        options.toast(
          codecMessage(outcome.fileName, outcome.error) ??
            t('media.unreadable', { name: outcome.fileName }),
          'error',
        );
      else if (outcome.status === 'imported' && outcome.assetId) {
        // FINAL2 U8: rotation is applied for you; variable timing needs no fix.
        const asset = assetById(outcome.assetId);
        const probed = asset && storedDetails(asset.metadata);
        for (const note of probed ? probeNotes(probed, asset.name) : [])
          options.toast(note, 'info');
      } else if (outcome.status === 'failed')
        options.toast(
          t('media.failed', {
            name: outcome.fileName,
            error: outcome.error ?? '',
          }),
          'error',
        );
    }
    if (cancelled) options.toast(t('media.cancelled'), 'info');
  };

  /** Imports files; resolves with the ids of the media they gave (new,
   *  already there or restored), in file order. */
  const importFiles = async (
    files: readonly File[],
    importOptions: {
      design?: boolean;
      license?: LicenseMeta;
      /** FIX1 F2: no Restored or Already in Media notes (stock adds). */
      quiet?: boolean;
    } = {},
  ): Promise<string[]> => {
    if (!files.length) return [];
    if (controller) {
      options.toast(t('media.busy'), 'info');
      return [];
    }
    const media = await store;
    if (!media) {
      options.toast(t('media.unavailableTitle'), 'error');
      return [];
    }
    const ids: string[] = [];
    controller = new AbortController();
    const restoredIds = new Set<string>();
    try {
      const { outcomes, cancelled } = await importMediaFiles(files, {
        store: media,
        probe: probeMedia,
        signal: controller.signal,
        hasAsset: (id, fileName) => {
          const asset = assetById(id);
          // I1.7: importing a deleted file again brings it back.
          if (asset && removed(asset)) {
            restore(id);
            restoredIds.add(id);
            // FIX6: ... under the name of the file just chosen, not whatever
            // name the deleted copy had (it could be an old or generated one).
            const back = assetById(id);
            if (back && fileName && back.name !== fileName)
              replaceAsset('Rename media', { ...back, name: fileName });
          }
          return !!asset;
        },
        // I1.6: importing is a library change, not an undoable edit.
        addAsset: (asset) =>
          engine.library('Import media', [
            {
              type: 'ADD_ASSET',
              // FINAL2 U2: stock media keep their licence and credit.
              asset: importOptions.license
                ? attachStockLicense(asset, importOptions.license)
                : asset,
            },
          ]),
        onProgress: (progress) =>
          showProgress(
            progress.fileName,
            progress.index,
            progress.count,
            progress.fraction,
          ),
      });
      summarize(
        outcomes.filter(
          (item) =>
            !(item.assetId && restoredIds.has(item.assetId)) &&
            !(importOptions.quiet && item.status === 'duplicate'),
        ),
        cancelled,
      );
      if (restoredIds.size && !importOptions.quiet)
        options.toast(
          t('media.restored', { count: restoredIds.size }),
          'success',
        );
      // I2: frames saved with "Save to Media" are Designs.
      if (importOptions.design)
        for (const outcome of outcomes) {
          const asset = outcome.assetId ? assetById(outcome.assetId) : null;
          if (asset && !isDesign(asset))
            replaceAsset('Save to Media', {
              ...asset,
              metadata: { ...asset.metadata, design: true },
            });
        }
      for (const outcome of outcomes)
        if (outcome.assetId) ids.push(outcome.assetId);
      const last = [...outcomes].reverse().find((item) => item.assetId);
      if (last?.assetId)
        grid
          .querySelector<HTMLElement>(
            `[data-asset-id="${CSS.escape(last.assetId)}"]`,
          )
          ?.scrollIntoView({ block: 'nearest' });
    } catch (error) {
      if (!isAbort(error)) throw error;
    } finally {
      controller = null;
      find('#media-import').hidden = true;
      // Bytes may now exist for cards that had none: try their previews again.
      options.previews.retry();
      options.waveforms.retry();
      options.imported?.();
    }
    return ids;
  };

  /**
   * FIX7: takes media away at once (no Restore): what a cancelled build
   * had imported. Their stored files go too.
   */
  const discard = async (ids: readonly string[]) => {
    for (const id of ids) {
      if (!assetById(id)) continue;
      setRemoved(id, true);
      await purge(id);
    }
  };

  render();
  return {
    render,
    importFiles,
    discard,
    get importing() {
      return controller !== null;
    },
    filter(value: string) {
      shelf.filter(value);
    },
    dispose() {
      disposed = true;
      controller?.abort();
      unsubscribePreviews();
      unsubscribeWaveforms();
      unsubscribeFolders();
      unregisterFolders();
      shelf.dispose();
      for (const timer of purges.values()) window.clearTimeout(timer);
    },
  };
}
