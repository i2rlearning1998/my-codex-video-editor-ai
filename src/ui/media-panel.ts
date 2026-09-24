import type { EditorEngine } from '../core';
import {
  assetFingerprint,
  importMediaFiles,
  isAbort,
  makeThumbnail,
  mediaKey,
  probeMedia,
  thumbnailKey,
  type ImportOutcome,
  type MediaKind,
  type MediaStore,
} from '../media';
import { formatDuration, formatNumber, t } from '../i18n';
import { iconSvg } from './icons';
import type { EditorSession } from './session';

export interface MediaPanelOptions {
  container: HTMLElement;
  engine: EditorEngine;
  session: EditorSession;
  store: Promise<MediaStore | null>;
  toast(text: string, kind: 'info' | 'success' | 'error'): void;
}

/** The asset fields the panel reads (structural, to keep the readonly types shallow). */
interface Asset {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly source: { readonly kind: string; readonly reference: string };
  readonly duration?: number | undefined;
  readonly metadata: { readonly mimeType?: unknown };
}

type Thumbnail =
  { state: 'loading' } | { state: 'ready'; url: string } | { state: 'none' };

const KIND_ICON: Record<string, string> = {
  video: 'media',
  audio: 'audio',
  image: 'graphics',
};
const listed = (asset: Asset) =>
  ['video', 'audio', 'image'].includes(asset.type) &&
  asset.source.kind !== 'generated';

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
  const thumbnails = new Map<string, Thumbnail>();
  let storeState: 'opening' | 'ready' | 'unavailable' = 'opening';
  let query = '';
  let controller: AbortController | null = null;
  let disposed = false;
  let thumbnailQueue = Promise.resolve();

  const store = options.store.then((value) => {
    storeState = value ? 'ready' : 'unavailable';
    render();
    return value;
  });

  const setThumb = (card: HTMLElement, asset: Asset) => {
    const slot = card.querySelector<HTMLElement>('.media-thumb')!;
    const thumb = thumbnails.get(asset.id);
    card.dataset.thumbnail = thumb?.state ?? 'none';
    if (thumb?.state === 'ready') {
      const image = document.createElement('img');
      image.src = thumb.url;
      image.alt = '';
      slot.replaceChildren(image);
    } else
      slot.innerHTML = `${iconSvg(KIND_ICON[asset.type] ?? 'media', 22)}${
        thumb?.state === 'loading'
          ? `<span class="media-thumb-loading" aria-hidden="true"></span>`
          : ''
      }`;
  };
  const updateCard = (asset: Asset) => {
    const card = grid.querySelector<HTMLElement>(
      `[data-asset-id="${CSS.escape(asset.id)}"]`,
    );
    if (card) setThumb(card, asset);
  };
  // MED-018: thumbnails are made in the background, one at a time, and cached in
  // the media store so a reload reads them back instead of decoding again.
  const requestThumbnail = (asset: Asset) => {
    if (thumbnails.has(asset.id)) return;
    const fingerprint = assetFingerprint(asset);
    if (!fingerprint || asset.type === 'audio') {
      thumbnails.set(asset.id, { state: 'none' });
      return;
    }
    thumbnails.set(asset.id, { state: 'loading' });
    thumbnailQueue = thumbnailQueue.then(async () => {
      let result: Thumbnail = { state: 'none' };
      try {
        const media = await store;
        if (media && !disposed) {
          let blob = await media.read(thumbnailKey(fingerprint));
          if (!blob) {
            const stored = await media.read(mediaKey(fingerprint));
            const source =
              stored &&
              !stored.type &&
              typeof asset.metadata.mimeType === 'string'
                ? stored.slice(0, stored.size, asset.metadata.mimeType)
                : stored;
            blob = source
              ? await makeThumbnail(source, asset.type as MediaKind)
              : null;
            if (blob) await media.write(thumbnailKey(fingerprint), blob);
          }
          if (blob) result = { state: 'ready', url: URL.createObjectURL(blob) };
        }
      } catch {
        // A thumbnail is optional: the card keeps its type icon.
      }
      if (disposed) {
        if (result.state === 'ready') URL.revokeObjectURL(result.url);
        return;
      }
      thumbnails.set(asset.id, result);
      updateCard(asset);
    });
  };

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
        requestThumbnail(asset);
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
        return card;
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
    try {
      const { outcomes, cancelled } = await importMediaFiles(files, {
        store: media,
        probe: probeMedia,
        signal: controller.signal,
        hasAsset: (id) => engine.state.assets.some((asset) => asset.id === id),
        addAsset: (asset) =>
          engine.commands.transaction('Import media', [
            { type: 'ADD_ASSET', asset },
          ]),
        onProgress: (progress) =>
          showProgress(
            progress.fileName,
            progress.index,
            progress.count,
            progress.fraction,
          ),
      });
      summarize(outcomes, cancelled);
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
      // Bytes may now exist for cards that had none: try their thumbnails again.
      for (const [id, thumb] of thumbnails)
        if (thumb.state === 'none') thumbnails.delete(id);
      render();
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
      for (const thumb of thumbnails.values())
        if (thumb.state === 'ready') URL.revokeObjectURL(thumb.url);
      thumbnails.clear();
    },
  };
}
