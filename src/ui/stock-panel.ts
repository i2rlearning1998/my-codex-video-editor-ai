// FINAL2 U2: Elements › Photos, Videos, Icons, Stickers and Audio. Searches
// the stock providers of src/providers (debounced 400 ms; the providers keep
// their own cache), shows the shared two-column library cards with a licence
// badge, and adds an item through `deps.add` (download, import into Media
// with its licence, place at the playhead). Every failure is a plain sentence.
import { t } from '../i18n';
import { audioPlayButton } from './components/audio-preview';
import {
  ProviderError,
  hasKeys,
  type Provider,
  type ProviderErrorCode,
  type StockItem,
  type StockKind,
} from '../providers';
import { iconSvg } from './icons';
import { drags } from './drag-controller';
import { createMenu, placeMenuAt, type MenuController } from './context-menu';
import { stockProvidersFor, KEYS_CHANGED } from './services';
import { openModal, type ModalHandle } from './components/modal';
import { diagnosticsButton } from './diagnostics';

export type StockTab = 'photos' | 'videos' | 'icons' | 'stickers' | 'audio';
export const STOCK_TABS: readonly StockTab[] = [
  'photos',
  'videos',
  'icons',
  'stickers',
  'audio',
];
const KIND: Record<StockTab, StockKind> = {
  photos: 'stock-image',
  videos: 'stock-video',
  icons: 'icon',
  stickers: 'sticker',
  audio: 'stock-audio',
};
type Orientation = '' | 'landscape' | 'portrait' | 'square';

export interface StockPlace {
  point?: [number, number] | null;
  time?: number;
}
export interface StockDeps {
  /** Downloads, imports into Media with the licence and places the item. */
  add(
    item: StockItem,
    place: StockPlace,
    signal: AbortSignal,
    /** FIX1 F2: the download's quality and its progress. */
    job?: {
      quality: string;
      onProgress: (loaded: number, total: number) => void;
    },
  ): Promise<void>;
  openKeys(): void;
  report(error: unknown): void;
}

/** Items shown in any stock grid, by card id (a drag's payload id). */
const shown = new Map<string, StockItem>();
export const stockCardId = (item: StockItem) => `${item.providerId}:${item.id}`;
export const stockItem = (id: string) => shown.get(id);

/** FIX1 F2: Pixabay's named video renditions, in the editor's preference. */
const VIDEO_PREFERENCE = ['medium', 'small', 'tiny'] as const;
/** The quality the user chose on an item's Details, by card id. */
const chosenQuality = new Map<string, string>();
/**
 * The download a stock item uses. Videos: Pixabay's medium (up to 1080p),
 * then small, then tiny, never `large` (4K) unless chosen in Details;
 * otherwise the largest MP4 whose shorter side is at most 1080. Pictures:
 * the largest file no wider than 1920 px. A quality chosen in Details wins.
 */
export function stockQuality(item: StockItem): string {
  const chosen = chosenQuality.get(stockCardId(item));
  if (chosen && item.files.some((f) => f.quality === chosen)) return chosen;
  const files = [...item.files]
    .filter((f) => !!f.url)
    .sort((a, b) => a.width * a.height - b.width * b.height);
  if (item.kind === 'stock-video') {
    for (const name of VIDEO_PREFERENCE)
      if (files.some((f) => f.quality === name)) return name;
    const fit = files.filter(
      (f) => f.quality !== 'large' && Math.min(f.width, f.height) <= 1080,
    );
    return (fit.at(-1) ?? files[0] ?? item.files[0])!.quality;
  }
  const fit = files.filter((f) => !f.width || f.width <= 1920);
  return (fit.at(-1) ?? files[0] ?? item.files[0])!.quality;
}
/** A byte count in plain words (KB, MB, GB). */
export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes,
    unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** A provider error as one plain sentence (never a code). */
export function stockErrorText(
  error: unknown,
  provider: string,
  tab: StockTab,
): string {
  const code: ProviderErrorCode =
    error instanceof ProviderError ? error.code : 'NETWORK';
  if (code === 'RATE_LIMITED') {
    const retryAt = error instanceof ProviderError ? error.retryAt : undefined;
    return retryAt
      ? t('stock.error.rateIn', {
          seconds: Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)),
        })
      : t('stock.error.rate');
  }
  if (code === 'KEY_MISSING')
    return t('stock.noKey', { provider, what: t(`stock.what.${tab}`) });
  // FIX1 F2: "No internet" only when the browser is offline.
  if (
    code === 'NETWORK' &&
    typeof navigator !== 'undefined' &&
    !navigator.onLine
  )
    return t('stock.error.OFFLINE', { provider });
  const status = error instanceof ProviderError ? error.status : undefined;
  if (code === 'HTTP')
    return t(
      status === 403 || status === 404 || status === 429 || (status ?? 0) >= 500
        ? `stock.error.HTTP_${(status ?? 0) >= 500 ? '5xx' : status}`
        : 'stock.error.HTTP',
      { provider, status: status ?? '' },
    );
  return t(`stock.error.${code}`, { provider });
}
const FEATURE: Record<StockTab, string> = {
  photos: 'Elements › Photos',
  videos: 'Elements › Videos',
  icons: 'Elements › Icons',
  stickers: 'Elements › Stickers',
  audio: 'Elements › Audio',
};

interface TabState {
  providerId: string;
  query: string;
  orientation: Orientation;
  items: StockItem[];
  nextPage: number | null;
  status: 'idle' | 'loading' | 'more' | 'done' | 'error';
  error: unknown;
  controller: AbortController | null;
  /** Import jobs by card id. */
  jobs: Map<string, StockJob>;
  /** FIX1 F2: the last failed import per card id (shown with Retry). */
  failed: Map<string, { error: unknown; place: StockPlace }>;
}
interface StockJob {
  controller: AbortController;
  loaded: number;
  total: number;
  started: number;
}
const states = new Map<StockTab, TabState>();
/** FIX1 F2: the seed words of the empty sticker search. */
export const STICKER_SEEDS = [
  'smiling',
  'heart',
  'star',
  'fire',
  'cat',
  'pizza',
  'hand',
  'party',
] as const;
/**
 * FIX1 F2: one card per name. Icon and emoji sets repeat the same symbol
 * (noto and noto-v1, many icon sets); the first allowed set wins.
 */
export function dedupe(
  items: readonly StockItem[],
  tab: StockTab,
): StockItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key =
      tab === 'icons' || tab === 'stickers'
        ? item.title.trim().toLowerCase()
        : `${item.providerId}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
const stateOf = (tab: StockTab, providers: readonly Provider[]): TabState => {
  let state = states.get(tab);
  if (!state || !providers.some((p) => p.id === state!.providerId)) {
    const withKey = providers.find((p) => hasKeys(p));
    state = {
      providerId: (withKey ?? providers[0])!.id,
      query: '',
      orientation: '',
      items: [],
      nextPage: null,
      status: 'idle',
      error: null,
      controller: null,
      jobs: new Map(),
      failed: new Map(),
    };
    states.set(tab, state);
  }
  return state;
};

/** Mounted stock pages; a saved or cleared key re-mounts them. */
const mounted = new Map<HTMLElement, { tab: StockTab; deps: StockDeps }>();
if (typeof document !== 'undefined')
  document.addEventListener(KEYS_CHANGED, () => {
    for (const [host, { tab, deps }] of [...mounted]) {
      if (!host.isConnected) {
        mounted.delete(host);
        continue;
      }
      const state = states.get(tab);
      if (state && state.status !== 'loading') state.status = 'idle';
      mountStock(host, tab, deps);
    }
  });
let menuElement: HTMLElement | null = null;
let menu: MenuController | null = null;

/** Mounts the stock page body for one tab into `host`. */
export function mountStock(
  host: HTMLElement,
  tab: StockTab,
  deps: StockDeps,
): void {
  const providers = stockProvidersFor(KIND[tab]);
  const state = stateOf(tab, providers);
  const provider = () =>
    providers.find((p) => p.id === state.providerId) ?? providers[0]!;
  mounted.set(host, { tab, deps });
  host.classList.add('shelf', 'stock-panel');
  host.dataset.stock = tab;
  host.replaceChildren();

  if (!menuElement) {
    menuElement = document.createElement('div');
    menuElement.className = 'media-menu shelf-menu';
    menuElement.id = 'stock-menu';
    menuElement.hidden = true;
    document.body.append(menuElement);
    menu = createMenu(menuElement, { report: deps.report });
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (
          !menuElement!.hidden &&
          !menuElement!.contains(event.target as Node)
        )
          menu!.close();
      },
      true,
    );
  }

  // Search, provider switch and orientation.
  const searchRow = document.createElement('div');
  searchRow.className = 'shelf-search-row';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'shelf-search library-search stock-search';
  search.placeholder = t(`stock.search.${tab}`);
  search.setAttribute('aria-label', t(`stock.search.${tab}`));
  search.value = state.query;
  searchRow.append(search);
  host.append(searchRow);
  const filters = document.createElement('div');
  filters.className = 'stock-filters';
  if (providers.length > 1) {
    const group = document.createElement('div');
    group.className = 'segmented stock-providers';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', t('stock.provider'));
    for (const p of providers) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.dataset.provider = p.id;
      button.textContent = p.name;
      button.setAttribute('aria-checked', String(p.id === state.providerId));
      button.onclick = () => {
        if (state.providerId === p.id) return;
        state.controller?.abort();
        state.providerId = p.id;
        state.items = [];
        state.status = 'idle';
        mountStock(host, tab, deps);
      };
      group.append(button);
    }
    filters.append(group);
  }
  if (tab === 'photos' || tab === 'videos') {
    const group = document.createElement('div');
    group.className = 'segmented stock-orientation';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', t('stock.orientation'));
    for (const value of ['', 'landscape', 'portrait', 'square'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.dataset.orientation = value || 'any';
      button.textContent = t(`stock.orientation.${value || 'any'}`);
      button.setAttribute('aria-checked', String(value === state.orientation));
      button.onclick = () => {
        state.orientation = value;
        for (const other of group.querySelectorAll('button'))
          other.setAttribute('aria-checked', String(other === button));
        void runSearch(true);
      };
      group.append(button);
    }
    filters.append(group);
  }
  if (filters.childElementCount) host.append(filters);

  const body = document.createElement('div');
  body.className = 'stock-body';
  const footer = document.createElement('p');
  footer.className = 'stock-attribution';
  const attribution = provider().attribution;
  footer.innerHTML = `<a href="${attribution.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(
    attribution.text,
  )}</a>`;
  host.append(body, footer);

  const message = (
    text: string,
    kind: 'empty' | 'error' | 'loading' | 'key',
    action?: { label: string; run: () => void },
  ) => {
    const card = document.createElement('div');
    card.className = `stock-message stock-${kind}`;
    card.dataset.state = kind;
    const p = document.createElement('p');
    p.textContent = text;
    card.append(p);
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button primary sm';
      button.textContent = action.label;
      button.onclick = action.run;
      card.append(button);
    }
    return card;
  };

  const card = (item: StockItem): HTMLElement => {
    const id = stockCardId(item);
    shown.set(id, item);
    const wrap = document.createElement('div');
    wrap.className = 'shelf-item stock-item';
    wrap.dataset.itemId = id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shelf-card stock-card';
    button.dataset.itemId = id;
    button.title = item.title;
    const thumb = document.createElement('span');
    thumb.className = 'shelf-thumb';
    if (item.thumbUrl) {
      const img = document.createElement('img');
      img.src = item.thumbUrl;
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      img.referrerPolicy = 'no-referrer';
      if (tab === 'icons' || tab === 'stickers') img.className = 'stock-icon';
      thumb.append(img);
    } else thumb.innerHTML = iconSvg(tab === 'audio' ? 'audio' : 'image', 28);
    // FIX1 F2: a small corner chip, never a bar over the picture; the full
    // licence and author are in its tooltip and in Details.
    const badge = document.createElement('span');
    badge.className = 'stock-licence';
    badge.setAttribute('role', 'img');
    badge.innerHTML = iconSvg('info', 12);
    const licenceText =
      item.license.attributionRequired && item.author
        ? t('stock.licenceBy', {
            licence: item.license.name,
            author: item.author,
          })
        : item.license.name;
    badge.title = item.license.commercialUse
      ? licenceText
      : t('stock.notCommercial', { licence: licenceText });
    badge.setAttribute('aria-label', badge.title);
    const name = document.createElement('span');
    name.className = 'shelf-name';
    name.textContent = item.title;
    button.append(thumb, badge, name);
    const add = () => void startImport(item, wrap, {});
    button.onclick = add;
    button.oncontextmenu = (event) => {
      event.preventDefault();
      openMenu(item, wrap, event.clientX, event.clientY);
    };
    drags().source(button, () => ({
      kind: 'stock',
      id,
      name: item.title,
      thumb: item.thumbUrl || null,
      media: tab === 'audio' ? 'audio' : tab === 'videos' ? 'video' : 'image',
      ...(item.durationSec ? { duration: item.durationSec } : {}),
      ...(item.width && item.height
        ? { width: item.width, height: item.height }
        : {}),
    }));
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'shelf-more icon-button';
    more.dataset.action = 'stock-more';
    more.setAttribute('aria-label', t('shelf.more'));
    more.setAttribute('aria-haspopup', 'menu');
    more.title = t('shelf.more');
    more.innerHTML = iconSvg('more', 16);
    more.onclick = (event) => {
      event.stopPropagation();
      const box = more.getBoundingClientRect();
      openMenu(item, wrap, box.left, box.bottom + 4);
    };
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'shelf-plus icon-button';
    plus.dataset.action = 'stock-plus';
    plus.setAttribute('aria-label', t('shelf.addToSceneShort'));
    plus.title = t('shelf.addToSceneShort');
    plus.innerHTML = iconSvg('plus', 16);
    plus.onclick = (event) => {
      event.stopPropagation();
      add();
    };
    wrap.append(button, more, plus);
    if (tab === 'audio' && item.previewUrl) {
      const previewUrl = item.previewUrl;
      const play = audioPlayButton(
        { id: `stock:${id}`, name: item.title, url: () => previewUrl },
        'stock-play',
      );
      play.dataset.action = 'stock-play';
      wrap.append(play);
    }
    if (state.jobs.has(id) || state.failed.has(id)) showJob(wrap, id);
    return wrap;
  };

  const showJob = (wrap: HTMLElement, id: string) => {
    wrap.querySelector('.stock-progress')?.remove();
    const job = state.jobs.get(id);
    const failure = state.failed.get(id);
    if (!job && !failure) return;
    const overlay = document.createElement('div');
    overlay.className = 'stock-progress';
    overlay.setAttribute('role', 'status');
    if (job) {
      const percent = job.total
        ? Math.min(100, Math.round((job.loaded / job.total) * 100))
        : null;
      overlay.dataset.state = 'busy';
      overlay.innerHTML = `<span class="stock-progress-text">${escapeHtml(
        percent === null
          ? job.loaded
            ? t('stock.downloadedSoFar', { size: formatBytes(job.loaded) })
            : t('stock.adding')
          : t('stock.downloading', {
              percent,
              size: formatBytes(job.total),
            }),
      )}</span><progress class="stock-progress-bar" max="100" ${
        percent === null ? '' : `value="${percent}"`
      }></progress>`;
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'button ghost sm stock-cancel';
      cancel.textContent = t('stock.cancel');
      cancel.onclick = (event) => {
        event.stopPropagation();
        job.controller.abort();
      };
      overlay.append(cancel);
    } else if (failure) {
      overlay.dataset.state = 'error';
      const text = document.createElement('span');
      text.className = 'stock-progress-text';
      text.textContent = stockErrorText(failure.error, provider().name, tab);
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'button primary sm stock-retry';
      retry.dataset.action = 'stock-retry';
      retry.textContent = t('stock.retry');
      const item = shown.get(id);
      retry.onclick = (event) => {
        event.stopPropagation();
        if (item) void startImport(item, wrap, failure.place);
      };
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'icon-button stock-dismiss';
      close.setAttribute('aria-label', t('stock.dismiss'));
      close.title = t('stock.dismiss');
      close.innerHTML = iconSvg('close', 14);
      close.onclick = (event) => {
        event.stopPropagation();
        state.failed.delete(id);
        overlay.remove();
      };
      overlay.append(
        text,
        retry,
        diagnosticsButton(() => ({
          feature: FEATURE[tab],
          providerId: item?.providerId ?? provider().id,
          step: 'download',
          error: failure.error,
          extra: {
            quality: item ? stockQuality(item) : undefined,
            size: item
              ? formatBytes(
                  item.files.find((f) => f.quality === stockQuality(item))
                    ?.bytes ?? 0,
                ) || 'unknown'
              : undefined,
          },
        })),
        close,
      );
    }
    wrap.append(overlay);
  };
  const startImport = async (
    item: StockItem,
    wrap: HTMLElement | null,
    place: StockPlace,
  ) => {
    const id = stockCardId(item);
    if (state.jobs.has(id)) return;
    const controller = new AbortController();
    const quality = stockQuality(item);
    const job: StockJob = {
      controller,
      loaded: 0,
      total: item.files.find((f) => f.quality === quality)?.bytes ?? 0,
      started: performance.now(),
    };
    state.jobs.set(id, job);
    state.failed.delete(id);
    const cardOf = () =>
      body.querySelector<HTMLElement>(
        `.stock-item[data-item-id="${CSS.escape(id)}"]`,
      ) ?? wrap;
    if (wrap) showJob(wrap, id);
    let frame = 0;
    try {
      await deps.add(item, place, controller.signal, {
        quality,
        onProgress: (loaded, total) => {
          job.loaded = loaded;
          if (total) job.total = total;
          if (frame) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            const card = cardOf();
            if (card && state.jobs.get(id) === job) showJob(card, id);
          });
        },
      });
    } catch (error) {
      if (!(error instanceof ProviderError && error.code === 'ABORTED')) {
        state.failed.set(id, { error, place });
        console.debug('[stock] import failed', FEATURE[tab], error);
        deps.report(new Error(stockErrorText(error, provider().name, tab)));
      }
    } finally {
      cancelAnimationFrame(frame);
      state.jobs.delete(id);
      const card = cardOf();
      card?.querySelector('.stock-progress')?.remove();
      if (card) showJob(card, id);
    }
  };
  /** FIX1 F2: Details: licence, author, source and the download quality. */
  const openDetails = (item: StockItem, wrap: HTMLElement) => {
    const id = stockCardId(item);
    const files = [...item.files]
      .filter((f) => !!f.url)
      .sort((a, b) => a.width * a.height - b.width * b.height);
    let handle: ModalHandle | null = null;
    handle = openModal({
      titleText: escapeHtml(item.title),
      bodyBuilder: (root) => {
        root.classList.add('stock-details');
        const facts = document.createElement('dl');
        facts.className = 'stock-details-facts';
        const fact = (label: string, value: string | HTMLElement) => {
          const dt = document.createElement('dt');
          dt.textContent = label;
          const dd = document.createElement('dd');
          dd.append(value);
          facts.append(dt, dd);
        };
        const link = (text: string, href: string) => {
          const a = document.createElement('a');
          a.href = href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = text;
          return a;
        };
        fact(
          t('stock.details.licence'),
          link(item.license.name, item.license.url),
        );
        fact(t('stock.details.author'), link(item.author, item.authorUrl));
        fact(
          t('stock.details.source'),
          link(
            t('stock.openSource', { provider: provider().name }),
            item.sourceUrl,
          ),
        );
        if (item.license.attributionRequired)
          fact(t('stock.details.credit'), t('stock.details.creditNeeded'));
        root.append(facts);
        if (files.length > 1) {
          const group = document.createElement('div');
          group.className = 'stock-quality';
          group.setAttribute('role', 'radiogroup');
          group.setAttribute('aria-label', t('stock.details.quality'));
          const title = document.createElement('p');
          title.className = 'settings-label';
          title.textContent = t('stock.details.quality');
          root.append(title, group);
          const current = stockQuality(item);
          for (const file of files) {
            const label = document.createElement('label');
            label.className = 'stock-quality-option';
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = `stock-quality-${id}`;
            radio.value = file.quality;
            radio.checked = file.quality === current;
            radio.onchange = () => chosenQuality.set(id, file.quality);
            const text = document.createElement('span');
            const size = formatBytes(file.bytes ?? 0);
            text.textContent = `${t(
              `stock.quality.${/^(tiny|small|medium|large|original)$/.test(file.quality) ? file.quality : 'other'}`,
            )} · ${file.width} × ${file.height}${size ? ` · ${size}` : ''}`;
            label.append(radio, text);
            group.append(label);
          }
        }
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'button primary';
        add.dataset.action = 'stock-details-add';
        add.textContent = t('shelf.addToSceneShort');
        add.onclick = () => {
          handle?.close();
          void startImport(item, wrap, {});
        };
        actions.append(add);
        root.append(actions);
      },
    });
  };
  const openMenu = (
    item: StockItem,
    wrap: HTMLElement,
    x: number,
    y: number,
  ) => {
    menu!.open(() => [
      {
        id: 'stock-add',
        label: t('shelf.addToSceneShort'),
        icon: 'plus',
        run: () => void startImport(item, wrap, {}),
      },
      {
        id: 'stock-details',
        label: t('stock.details'),
        icon: 'info',
        run: () => openDetails(item, wrap),
      },
      {
        id: 'stock-source',
        label: t('stock.openSource', { provider: provider().name }),
        icon: 'link',
        run: () => window.open(item.sourceUrl, '_blank', 'noopener'),
      },
      {
        id: 'stock-licence',
        label: t('stock.licence', { licence: item.license.name }),
        icon: 'info',
        run: () => window.open(item.license.url, '_blank', 'noopener'),
      },
    ]);
    placeMenuAt(menuElement!, x, y);
  };

  const render = () => {
    body.replaceChildren();
    const p = provider();
    if (!hasKeys(p)) {
      body.append(
        message(
          t('stock.noKey', { provider: p.name, what: t(`stock.what.${tab}`) }),
          'key',
          { label: t('stock.addKey'), run: deps.openKeys },
        ),
      );
      return;
    }
    if (state.status === 'loading') {
      body.append(message(t('stock.loading'), 'loading'));
      return;
    }
    if (state.status === 'error') {
      const code =
        state.error instanceof ProviderError ? state.error.code : 'NETWORK';
      const card = message(
        stockErrorText(state.error, p.name, tab),
        'error',
        code === 'KEY_INVALID'
          ? { label: t('stock.checkKey'), run: deps.openKeys }
          : { label: t('stock.retry'), run: () => void runSearch(true) },
      );
      // FIX1 F4: what failed, where, and the HTTP status (never the key).
      const error = state.error;
      card.append(
        diagnosticsButton(() => ({
          feature: FEATURE[tab],
          providerId: p.id,
          step: 'search',
          error,
          extra: { query: state.query.trim() || defaultQuery() },
        })),
      );
      body.append(card);
      return;
    }
    if (!state.items.length) {
      body.append(
        message(
          state.status === 'idle'
            ? t('stock.loading')
            : t('stock.noResults', { query: state.query || defaultQuery() }),
          'empty',
        ),
      );
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'shelf-cards stock-grid';
    grid.append(...state.items.map(card));
    body.append(grid);
    if (state.nextPage !== null) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'button secondary sm stock-load-more';
      more.disabled = state.status === 'more';
      more.textContent = t(
        state.status === 'more' ? 'stock.loading' : 'stock.loadMore',
      );
      more.onclick = () => void runSearch(false);
      body.append(more);
    }
  };
  const defaultQuery = () => t(`stock.defaultQuery.${tab}`);
  const runSearch = async (fresh: boolean) => {
    const p = provider();
    if (!hasKeys(p)) return render();
    state.controller?.abort();
    const controller = new AbortController();
    state.controller = controller;
    const page = fresh ? 1 : (state.nextPage ?? 1);
    state.status = fresh ? 'loading' : 'more';
    if (fresh) state.items = [];
    render();
    try {
      // FIX1 F2: an empty sticker search shows a mixed set from several
      // seed words (one word alone gives near-identical results).
      const typed = state.query.trim();
      const queries =
        !typed && tab === 'stickers'
          ? STICKER_SEEDS
          : [typed || defaultQuery()];
      const results = await Promise.allSettled(
        queries.map((query) =>
          p.search({
            kind: KIND[tab],
            query,
            page,
            perPage: queries.length > 1 ? 32 : 20,
            ...(state.orientation ? { orientation: state.orientation } : {}),
            signal: controller.signal,
          }),
        ),
      );
      if (state.controller !== controller) return;
      const ok = results.flatMap((r) =>
        r.status === 'fulfilled' ? [r.value] : [],
      );
      if (!ok.length)
        throw (results[0] as PromiseRejectedResult).reason as unknown;
      // Interleave the seeds so the first rows are mixed.
      const merged: StockItem[] = [];
      for (let i = 0; ok.some((r) => i < r.items.length); i++)
        for (const r of ok) if (r.items[i]) merged.push(r.items[i]!);
      state.items = dedupe(fresh ? merged : [...state.items, ...merged], tab);
      state.nextPage = ok.some((r) => r.nextPage !== null) ? page + 1 : null;
      state.status = 'done';
    } catch (error) {
      if (state.controller !== controller) return;
      if (error instanceof ProviderError && error.code === 'ABORTED') return;
      state.status = 'error';
      state.error = error;
    }
    if (host.isConnected) render();
  };
  let timer = 0;
  search.oninput = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      state.query = search.value;
      void runSearch(true);
    }, 400);
  };
  search.onkeydown = (event) => {
    if (event.key === 'Enter') {
      window.clearTimeout(timer);
      state.query = search.value;
      void runSearch(true);
    }
  };
  if (
    state.status === 'idle' ||
    (state.status === 'error' && hasKeys(provider()))
  )
    void runSearch(true);
  else render();
  // A drop elsewhere (canvas, timeline) imports through the same job list.
  host.addEventListener('stock-drop', ((event: CustomEvent) => {
    const { item, place } = event.detail as {
      item: StockItem;
      place: StockPlace;
    };
    const wrap = body.querySelector<HTMLElement>(
      `.stock-item[data-item-id="${CSS.escape(stockCardId(item))}"]`,
    );
    void startImport(item, wrap, place);
  }) as EventListener);
}

/** A drop of a stock card: imports and places it, with the card's progress. */
export function dropStock(id: string, place: StockPlace): boolean {
  const item = shown.get(id);
  if (!item) return false;
  const host = document
    .querySelector<HTMLElement>(
      `.stock-panel[data-stock] [data-item-id="${CSS.escape(id)}"]`,
    )
    ?.closest<HTMLElement>('.stock-panel');
  if (!host) return false;
  host.dispatchEvent(
    new CustomEvent('stock-drop', { detail: { item, place } }),
  );
  return true;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
