// FINAL2 U2: Elements › Photos, Videos, Icons, Stickers and Audio. Searches
// the stock providers of src/providers (debounced 400 ms; the providers keep
// their own cache), shows the shared two-column library cards with a licence
// badge, and adds an item through `deps.add` (download, import into Media
// with its licence, place at the playhead). Every failure is a plain sentence.
import { t } from '../i18n';
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
  add(item: StockItem, place: StockPlace, signal: AbortSignal): Promise<void>;
  openKeys(): void;
  report(error: unknown): void;
}

/** Items shown in any stock grid, by card id (a drag's payload id). */
const shown = new Map<string, StockItem>();
export const stockCardId = (item: StockItem) => `${item.providerId}:${item.id}`;
export const stockItem = (id: string) => shown.get(id);

/** The download a stock item uses: the largest file no wider than 1920 px. */
export function stockQuality(item: StockItem): string {
  const files = [...item.files].sort((a, b) => a.width - b.width);
  const fit = files.filter((f) => !f.width || f.width <= 1920);
  return (fit.at(-1) ?? files[0])!.quality;
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
  return t(`stock.error.${code}`, { provider });
}

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
  jobs: Map<string, AbortController>;
}
const states = new Map<StockTab, TabState>();
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
let audio: HTMLAudioElement | null = null;
let playing: string | null = null;

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
    const badge = document.createElement('span');
    badge.className = 'shelf-badge media-badge stock-licence';
    badge.textContent =
      item.license.attributionRequired && item.author
        ? t('stock.licenceBy', {
            licence: item.license.name,
            author: item.author,
          })
        : item.license.name;
    badge.title = item.license.commercialUse
      ? item.license.name
      : t('stock.notCommercial', { licence: item.license.name });
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
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'icon-button stock-play';
      play.dataset.action = 'stock-play';
      const sync = () => {
        const on = playing === id;
        play.setAttribute('aria-pressed', String(on));
        play.setAttribute('aria-label', t(on ? 'stock.pause' : 'stock.play'));
        play.title = t(on ? 'stock.pause' : 'stock.play');
        play.innerHTML = iconSvg(on ? 'pause' : 'play', 16);
      };
      play.onclick = (event) => {
        event.stopPropagation();
        if (playing === id) {
          audio?.pause();
          playing = null;
        } else {
          audio?.pause();
          audio = new Audio(item.previewUrl);
          audio.onended = () => {
            playing = null;
            sync();
          };
          playing = id;
          audio.play().catch(() => {
            playing = null;
            sync();
          });
        }
        for (const other of body.querySelectorAll<HTMLElement>('.stock-play'))
          other.dispatchEvent(new Event('stock-sync'));
      };
      play.addEventListener('stock-sync', sync);
      sync();
      wrap.append(play);
    }
    if (state.jobs.has(id)) showJob(wrap, id);
    return wrap;
  };

  const showJob = (wrap: HTMLElement, id: string) => {
    wrap.querySelector('.stock-progress')?.remove();
    const job = state.jobs.get(id);
    if (!job) return;
    const overlay = document.createElement('div');
    overlay.className = 'stock-progress';
    overlay.setAttribute('role', 'status');
    overlay.innerHTML = `<span class="stock-spinner" aria-hidden="true"></span><span>${escapeHtml(t('stock.adding'))}</span>`;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'button ghost sm stock-cancel';
    cancel.textContent = t('stock.cancel');
    cancel.onclick = (event) => {
      event.stopPropagation();
      job.abort();
    };
    overlay.append(cancel);
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
    state.jobs.set(id, controller);
    if (wrap) showJob(wrap, id);
    try {
      await deps.add(item, place, controller.signal);
    } catch (error) {
      if (!(error instanceof ProviderError && error.code === 'ABORTED'))
        deps.report(new Error(stockErrorText(error, provider().name, tab)));
    } finally {
      state.jobs.delete(id);
      body
        .querySelector(`[data-item-id="${CSS.escape(id)}"] .stock-progress`)
        ?.remove();
    }
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
      body.append(
        message(
          stockErrorText(state.error, p.name, tab),
          'error',
          code === 'KEY_INVALID'
            ? { label: t('stock.checkKey'), run: deps.openKeys }
            : { label: t('stock.retry'), run: () => void runSearch(true) },
        ),
      );
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
      const result = await p.search({
        kind: KIND[tab],
        query: state.query.trim() || defaultQuery(),
        page,
        perPage: 20,
        ...(state.orientation ? { orientation: state.orientation } : {}),
        signal: controller.signal,
      });
      if (state.controller !== controller) return;
      state.items = fresh
        ? [...result.items]
        : [...state.items, ...result.items];
      state.nextPage = result.nextPage;
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
