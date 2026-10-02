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
import { confirmDialog, escapeHtml, openModal, promptDialog } from './components/modal';
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

  function render() {
    if (disposed) return;
    const assets = (
      session.source.assets as unknown as readonly Asset[]
    ).filter(listed);
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
        card.ondragstart = (event) =>
          event.dataTransfer?.setData('application/x-editor-asset', asset.id);
        // I1.7: the item's menu, from its More button or a right-click.
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'media-card-more icon-button';
        more.dataset.action = 'media-more';
        more.setAttribute('aria-label', t('media.menu.more', { name: asset.name }));
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
  menuElement.className = 'canvas-context-menu media-menu';
  menuElement.id = 'media-menu';
  menuElement.hidden = true;
  document.body.append(menuElement);
  const menu = createMenu(menuElement, {
    report: (error) =>
      options.toast(error instanceof Error ? error.message : String(error), 'error'),
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
          if (clip.assetId === id || (clip.assetId && derived.has(clip.assetId)))
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
    showToast(t('media.deleted', { name: asset.name }), 'info', MEDIA_RESTORE_MS, {
      label: t('media.restore'),
      run: () => restore(id),
    });
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
    rows.push([t('media.details.used'), t('media.details.clips', { count: usage(id) })]);
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
          options.toast(error instanceof Error ? error.message : String(error), 'error'),
        );
    } catch (error) {
      options.toast(error instanceof Error ? error.message : String(error), 'error');
    }
  };
  const openMenu = (id: string, x: number, y: number) => {
    const entries = (): MenuEntry[] => {
      const project = engine.state.id;
      const current = mediaFolders.folderOf(project, id);
      return [
        { id: 'media-rename', label: t('media.menu.rename'), icon: 'edit', run: run(() => rename(id)) },
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
                options.toast(t('media.folder.moved', { name: folder.name }), 'success');
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
        { id: 'media-details', label: t('media.menu.details'), icon: 'info', run: run(() => details(id)) },
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
    const width = menuElement.offsetWidth,
      height = menuElement.offsetHeight;
    menuElement.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
    menuElement.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
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

  const importFiles = async (files: readonly File[]) => {
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
        options.toast(t('media.restored', { count: restoredIds.size }), 'success');
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
