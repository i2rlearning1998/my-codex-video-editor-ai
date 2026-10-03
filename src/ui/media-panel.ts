import { dragGhost, setAssetDrag } from './drag-state';
import type { EditorEngine } from '../core';
import {
  importMediaFiles,
  isAbort,
  probeMedia,
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
import { createMenu, type MenuEntry } from './context-menu';
import { iconSvg } from './icons';
import { mediaFolders } from './media-folders';
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
/** I2: the Media tabs. Designs are frames saved with "Save to Media". */
export type MediaTab =
  'all' | 'image' | 'video' | 'audio' | 'design' | 'folders';
const MEDIA_TABS: readonly MediaTab[] = [
  'all',
  'image',
  'video',
  'audio',
  'design',
  'folders',
];
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
  container.innerHTML = `
    <button type="button" class="media-dropzone" id="media-dropzone"></button>
    <div class="media-tabs" id="media-tabs" role="tablist"></div>
    <div class="media-toolbar" id="media-toolbar"><label class="media-sort-label"><span id="media-sort-caption"></span><select id="media-sort"></select></label></div>
    <div class="media-folder-head" id="media-folder-head" hidden><button type="button" class="icon-button" id="media-folder-back"></button><h3 id="media-folder-name"></h3></div>
    <div class="media-import" id="media-import" role="status" hidden>
      <div class="media-import-text"><span id="media-import-label"></span><span id="media-import-percent"></span></div>
      <progress id="media-import-bar" max="100" value="0"></progress>
      <button type="button" class="button" id="media-import-cancel"></button>
    </div>
    <div class="media-state" id="media-state" hidden><div class="placeholder-icon" aria-hidden="true">${iconSvg('media', 22)}</div><h3 id="media-state-title"></h3><p id="media-state-description"></p></div>
    <div class="available-assets media-grid" id="media-grid"></div>`;
  const find = <T extends HTMLElement>(selector: string) =>
    container.querySelector<T>(selector)!;
  const grid = find('#media-grid');
  let storeState: 'opening' | 'ready' | 'unavailable' = 'opening';
  let query = '';
  let tab: MediaTab = 'all';
  let sort: MediaSort = 'added';
  let openFolder: string | null = null;
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
      slot.replaceChildren(image);
    } else
      slot.innerHTML = `${iconSvg(KIND_ICON[asset.type] ?? 'media', 22)}${
        thumb.state === 'loading'
          ? `<span class="media-thumb-loading" aria-hidden="true"></span>`
          : ''
      }`;
  };
  const updateThumbnails = () => {
    for (const card of grid.querySelectorAll<HTMLElement>('.media-card')) {
      const asset = (session.source.assets as unknown as readonly Asset[]).find(
        (item) => item.id === card.dataset.assetId,
      );
      if (asset) setThumb(card, asset);
    }
  };
  const unsubscribePreviews = options.previews.onChange(updateThumbnails);
  const unsubscribeWaveforms = options.waveforms.onChange(updateThumbnails);

  const badge = (asset: Asset) =>
    asset.type === 'image'
      ? t('media.image')
      : asset.duration !== undefined
        ? formatDuration(asset.duration).replace(/^00:/, '')
        : t(`media.${asset.type}`);

  const matches = (asset: Asset) =>
    !query || asset.name.toLowerCase().includes(query);

  // I2: the drop zone, tabs, sort and folder header.
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
  find<HTMLButtonElement>('#media-folder-back').onclick = () => {
    openFolder = null;
    render();
  };
  const tabs = find('#media-tabs');
  const renderTabs = () => {
    tabs.setAttribute('aria-label', t('media.tabs'));
    tabs.replaceChildren(
      ...MEDIA_TABS.map((id) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'media-tab';
        button.dataset.mediaTab = id;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(tab === id));
        button.textContent = t(`media.tab.${id}`);
        button.onclick = () => {
          tab = id;
          openFolder = null;
          render();
        };
        return button;
      }),
    );
  };
  const sorted = (list: readonly Asset[]) => {
    const copy = [...list];
    if (sort === 'newest') copy.reverse();
    else if (sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'duration')
      copy.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
    return copy;
  };
  const inTab = (asset: Asset) => {
    if (openFolder)
      return mediaFolders.folderOf(engine.state.id, asset.id) === openFolder;
    if (tab === 'design') return isDesign(asset);
    if (tab === 'all') return true;
    if (tab === 'folders') return false;
    return asset.type === tab && !isDesign(asset);
  };
  /** Folder cards (the Folders tab): open, rename, delete, drop media in. */
  const folderCards = () => {
    const project = engine.state.id;
    const all = (session.source.assets as unknown as readonly Asset[]).filter(
      listed,
    );
    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'media-folder-new';
    create.id = 'media-folder-new';
    create.innerHTML = iconSvg('plus', 16);
    create.append(t('media.folder.new'));
    create.onclick = run(async () => {
      const name = await promptDialog(t('media.folder.newTitle'), '', {
        label: t('media.folder.name'),
        confirmLabel: t('media.folder.create'),
        cancelLabel: t('media.cancel'),
      });
      if (name) mediaFolders.create(project, name);
    });
    const cards = mediaFolders.list(project).map((folder) => {
      const card = document.createElement('div');
      card.className = 'media-folder';
      card.dataset.folderId = folder.id;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'media-folder-open';
      const count = all.filter(
        (asset) => mediaFolders.folderOf(project, asset.id) === folder.id,
      ).length;
      open.innerHTML = iconSvg('folder', 22);
      const label = document.createElement('span');
      label.className = 'media-folder-name';
      label.textContent = folder.name;
      const meta = document.createElement('span');
      meta.className = 'media-folder-count';
      meta.textContent = t('media.folder.count', { count });
      open.append(label, meta);
      open.onclick = () => {
        openFolder = folder.id;
        render();
      };
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'media-card-more icon-button';
      more.dataset.action = 'folder-more';
      more.setAttribute(
        'aria-label',
        t('media.menu.more', { name: folder.name }),
      );
      more.innerHTML = iconSvg('more', 16);
      const openMenuAt = (x: number, y: number) => {
        menu.open(() => [
          {
            id: 'folder-rename',
            label: t('media.menu.rename'),
            icon: 'edit',
            run: run(async () => {
              const name = await promptDialog(
                t('media.folder.renameTitle'),
                folder.name,
                {
                  label: t('media.folder.name'),
                  confirmLabel: t('media.rename.confirm'),
                  cancelLabel: t('media.cancel'),
                },
              );
              if (name) mediaFolders.rename(project, folder.id, name);
            }),
          },
          {
            id: 'folder-delete',
            label: t('media.folder.delete'),
            icon: 'delete',
            run: run(() => mediaFolders.remove(project, folder.id)),
          },
        ]);
        placeMenu(x, y);
      };
      more.onclick = (event) => {
        event.stopPropagation();
        const box = more.getBoundingClientRect();
        openMenuAt(box.left, box.bottom + 4);
      };
      card.oncontextmenu = (event) => {
        event.preventDefault();
        openMenuAt(event.clientX, event.clientY);
      };
      // Media cards dropped on a folder move into it.
      card.ondragover = (event) => {
        if (!event.dataTransfer?.types.includes('application/x-editor-asset'))
          return;
        event.preventDefault();
        card.classList.add('over');
      };
      card.ondragleave = () => card.classList.remove('over');
      card.ondrop = (event) => {
        card.classList.remove('over');
        const id = event.dataTransfer?.getData('application/x-editor-asset');
        if (!id) return;
        event.preventDefault();
        event.stopPropagation();
        mediaFolders.move(project, id, folder.id);
        options.toast(
          t('media.folder.moved', { name: folder.name }),
          'success',
        );
      };
      card.append(open, more);
      return card;
    });
    return [create, ...cards];
  };

  const hasAny = () =>
    (session.source.assets as unknown as readonly Asset[]).some(listed);
  function render() {
    if (disposed) return;
    renderTabs();
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
    const folder = openFolder
      ? mediaFolders
          .list(engine.state.id)
          .find((item) => item.id === openFolder)
      : undefined;
    if (openFolder && !folder) openFolder = null;
    find('#media-folder-head').hidden = !folder;
    if (folder) {
      find('#media-folder-name').textContent = folder.name;
      const back = find<HTMLButtonElement>('#media-folder-back');
      back.innerHTML = iconSvg('back', 16);
      back.setAttribute('aria-label', t('browse.back'));
    }
    find('#media-toolbar').hidden = tab === 'folders' && !openFolder;
    const showFolders = tab === 'folders' && !openFolder;
    grid.classList.toggle('media-folders', showFolders);
    if (showFolders) {
      grid.replaceChildren(...folderCards());
      find('#media-state').hidden = true;
      return;
    }
    const assets = sorted(
      (session.source.assets as unknown as readonly Asset[]).filter(listed),
    ).filter(inTab);
    grid.replaceChildren(
      ...assets.map((asset) => {
        const item = document.createElement('div');
        item.className = 'media-item';
        item.dataset.assetId = asset.id;
        const folderId = mediaFolders.folderOf(engine.state.id, asset.id);
        if (folderId) item.dataset.folderId = folderId;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'media-card';
        card.draggable = true;
        card.dataset.assetId = asset.id;
        card.dataset.name = asset.name;
        card.dataset.kind = asset.type;
        card.title = t('asset.drag', { name: asset.name });
        card.hidden = !matches(asset);
        card.innerHTML = `<span class="media-thumb"></span><span class="media-badge"></span><span class="media-name"></span>`;
        card.querySelector('.media-badge')!.textContent = badge(asset);
        card.querySelector('.media-name')!.textContent = asset.name;
        setThumb(card, asset);
        card.ondragstart = (event) => {
          event.dataTransfer?.setData('application/x-editor-asset', asset.id);
          // J9: the canvas and the timeline show where it would land.
          setAssetDrag({
            assetId: asset.id,
            type: asset.type as 'image' | 'video' | 'audio',
            name: asset.name,
            duration: asset.duration && asset.duration > 0 ? asset.duration : 5,
            ...(asset.width && asset.height
              ? { width: asset.width, height: asset.height }
              : {}),
          });
          const ghost = dragGhost(card, asset.name);
          event.dataTransfer?.setDragImage(ghost, 20, 20);
          requestAnimationFrame(() => ghost.remove());
        };
        card.ondragend = () => setAssetDrag(null);
        // I1.7: the item's menu, from its More button or a right-click.
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'media-card-more icon-button';
        more.dataset.action = 'media-more';
        more.setAttribute(
          'aria-label',
          t('media.menu.more', { name: asset.name }),
        );
        more.setAttribute('aria-haspopup', 'menu');
        more.title = t('media.menu.more', { name: asset.name });
        more.innerHTML = iconSvg('more', 16);
        more.onclick = (event) => {
          event.stopPropagation();
          const box = more.getBoundingClientRect();
          openMenu(asset.id, box.left, box.bottom + 4);
        };
        card.oncontextmenu = (event) => {
          event.preventDefault();
          openMenu(asset.id, event.clientX, event.clientY);
        };
        // I2: a video previews its filmstrip while hovered.
        if (asset.type === 'video') {
          let timer = 0;
          card.addEventListener('pointerenter', () => {
            const strip = options.previews.strip(asset);
            if (strip.state !== 'ready') return;
            const slot = card.querySelector<HTMLElement>('.media-thumb')!;
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
            timer = window.setInterval(step, 160);
          });
          card.addEventListener('pointerleave', () => {
            window.clearInterval(timer);
            card.querySelector('.media-hover')?.remove();
          });
        }
        item.hidden = card.hidden;
        item.append(card, more);
        return item;
      }),
    );
    const state = find('#media-state');
    const visible = assets.filter(matches).length;
    const [title, description] =
      storeState === 'unavailable'
        ? ['media.unavailableTitle', 'media.unavailableDescription']
        : storeState === 'opening' && !assets.length
          ? ['media.loadingTitle', 'media.loadingDescription']
          : !assets.length && (tab !== 'all' || openFolder) && hasAny()
            ? [
                'media.tabEmptyTitle',
                openFolder
                  ? 'media.folderEmptyDescription'
                  : tab === 'design'
                    ? 'media.designEmptyDescription'
                    : 'media.tabEmptyDescription',
              ]
            : !assets.length
              ? ['media.emptyTitle', 'media.emptyDescription']
              : !visible
                ? ['media.noMatchesTitle', 'media.noMatchesDescription']
                : [null, null];
    state.hidden = title === null;
    state.dataset.state =
      storeState === 'unavailable'
        ? 'error'
        : storeState === 'opening'
          ? 'loading'
          : !assets.length
            ? 'empty'
            : 'no-matches';
    if (title && description) {
      find('#media-state-title').textContent = t(title);
      find('#media-state-description').textContent = t(description);
    }
    find('#media-import-cancel').textContent = t('media.cancel');
  }

  // I1.7: the media item menu (Rename, Delete, Add to scene, Move to folder,
  // Details). Rename, Delete and folders are library changes: never on the
  // Undo stack (docs/UNDO-RULES.md).
  const menuElement = document.createElement('div');
  menuElement.className = 'media-menu';
  menuElement.id = 'media-menu';
  menuElement.hidden = true;
  document.body.append(menuElement);
  const menu = createMenu(menuElement, {
    report: (error) =>
      options.toast(
        error instanceof Error ? error.message : String(error),
        'error',
      ),
  });
  const closeOutside = (event: PointerEvent) => {
    if (!menuElement.hidden && !menuElement.contains(event.target as Node))
      menu.close();
  };
  document.addEventListener('pointerdown', closeOutside, true);
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
  const newFolder = async (id: string) => {
    const name = await promptDialog(t('media.folder.newTitle'), '', {
      label: t('media.folder.name'),
      confirmLabel: t('media.folder.create'),
      cancelLabel: t('media.cancel'),
    });
    if (!name) return;
    const folder = mediaFolders.create(engine.state.id, name);
    mediaFolders.move(engine.state.id, id, folder.id);
    options.toast(t('media.folder.moved', { name: folder.name }), 'success');
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
      },
    });
  };
  const run = (action: () => unknown) => () => {
    try {
      const result = action();
      if (result instanceof Promise)
        result.catch((error: unknown) =>
          options.toast(
            error instanceof Error ? error.message : String(error),
            'error',
          ),
        );
    } catch (error) {
      options.toast(
        error instanceof Error ? error.message : String(error),
        'error',
      );
    }
  };
  const placeMenu = (x: number, y: number) => {
    const width = menuElement.offsetWidth,
      height = menuElement.offsetHeight;
    menuElement.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
    menuElement.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
  };
  const openMenu = (id: string, x: number, y: number) => {
    const entries = (): MenuEntry[] => {
      const project = engine.state.id;
      const current = mediaFolders.folderOf(project, id);
      return [
        {
          id: 'media-rename',
          label: t('media.menu.rename'),
          icon: 'edit',
          run: run(() => rename(id)),
        },
        {
          id: 'media-add',
          label: t('media.menu.add'),
          icon: 'plus',
          ...(options.place ? { run: run(() => options.place!(id)) } : {}),
        },
        {
          id: 'media-folder',
          label: t('media.menu.folder'),
          icon: 'folder',
          submenu: () => [
            ...mediaFolders.list(project).map((folder) => ({
              id: 'media-folder-pick',
              label: folder.name,
              role: 'menuitemradio' as const,
              checked: folder.id === current,
              data: { folderId: folder.id },
              run: run(() => {
                mediaFolders.move(project, id, folder.id);
                options.toast(
                  t('media.folder.moved', { name: folder.name }),
                  'success',
                );
              }),
            })),
            ...(current
              ? [
                  {
                    id: 'media-folder-none',
                    label: t('media.folder.none'),
                    run: run(() => mediaFolders.move(project, id, null)),
                  },
                ]
              : []),
            {
              id: 'media-folder-new',
              label: t('media.folder.new'),
              icon: 'plus',
              divider: mediaFolders.list(project).length > 0,
              run: run(() => newFolder(id)),
            },
          ],
        },
        {
          id: 'media-details',
          label: t('media.menu.details'),
          icon: 'info',
          run: run(() => details(id)),
        },
        {
          id: 'media-delete',
          label: t('media.menu.delete'),
          icon: 'delete',
          divider: true,
          run: run(() => remove(id)),
        },
      ];
    };
    menu.open(entries);
    placeMenu(x, y);
  };
  const unsubscribeFolders = mediaFolders.onChange(() => render());

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
          t('media.unreadable', { name: outcome.fileName }),
          'error',
        );
      else if (outcome.status === 'failed')
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

  const importFiles = async (
    files: readonly File[],
    importOptions: { design?: boolean } = {},
  ) => {
    if (!files.length) return;
    if (controller) {
      options.toast(t('media.busy'), 'info');
      return;
    }
    const media = await store;
    if (!media) {
      options.toast(t('media.unavailableTitle'), 'error');
      return;
    }
    controller = new AbortController();
    const restoredIds = new Set<string>();
    try {
      const { outcomes, cancelled } = await importMediaFiles(files, {
        store: media,
        probe: probeMedia,
        signal: controller.signal,
        hasAsset: (id) => {
          const asset = assetById(id);
          // I1.7: importing a deleted file again brings it back.
          if (asset && removed(asset)) {
            restore(id);
            restoredIds.add(id);
          }
          return !!asset;
        },
        // I1.6: importing is a library change, not an undoable edit.
        addAsset: (asset) =>
          engine.library('Import media', [{ type: 'ADD_ASSET', asset }]),
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
          (item) => !(item.assetId && restoredIds.has(item.assetId)),
        ),
        cancelled,
      );
      if (restoredIds.size)
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
  };

  render();
  return {
    render,
    importFiles,
    get importing() {
      return controller !== null;
    },
    filter(value: string) {
      query = value.trim().toLowerCase();
      render();
    },
    dispose() {
      disposed = true;
      controller?.abort();
      unsubscribePreviews();
      unsubscribeWaveforms();
      unsubscribeFolders();
      document.removeEventListener('pointerdown', closeOutside, true);
      menu.close();
      menuElement.remove();
      for (const timer of purges.values()) window.clearTimeout(timer);
    },
  };
}
