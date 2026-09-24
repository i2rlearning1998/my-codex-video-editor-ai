import type { EditorEngine } from '../core';
import {
  importMediaFiles,
  isAbort,
  probeMedia,
  type ImportOutcome,
  type MediaPreviews,
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
  previews: MediaPreviews;
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
  const setThumb = (card: HTMLElement, asset: Asset) => {
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
      // Bytes may now exist for cards that had none: try their previews again.
      options.previews.retry();
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
    },
  };
}
