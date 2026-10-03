// I2: the one browse panel every left-rail library uses (Templates,
// Elements, Text, Transitions). A header with Back, the title and Close; a
// sticky search; sections with a title, "See all ›" and a horizontal strip
// (or a grid, tiles or a list); a drill-down stack that slides in 180 ms
// (Back only, no breadcrumb). Grids render in chunks as they scroll into view,
// with skeleton cards until a preview is drawn, and every page has empty and
// error states. Cards are buttons: Tab reaches them, arrows move along a
// strip or grid, Enter adds.
import { t } from '../i18n';
import { iconSvg } from './icons';

export interface BrowseCard {
  readonly id: string;
  readonly label: string;
  /** Extra words search matches (tags). */
  readonly keywords?: readonly string[];
  /** An image URL now, or a promise of one; null keeps the icon. */
  readonly preview?: () => string | null | Promise<string | null>;
  /** Shown while there is no preview (and for tiles). */
  readonly icon?: string;
  /** Width ÷ height of the thumbnail (default 16:9). */
  readonly aspect?: number;
  /** Disabled with this tooltip ("Planned: …"). */
  readonly disabled?: string;
  readonly activate?: () => void;
  /** A drag carrying `type` = `data` (never a file). */
  readonly drag?: { readonly type: string; readonly data: string };
  /** data-* attributes (for example data-item-id). */
  readonly data?: Readonly<Record<string, string>>;
  readonly className?: string;
  /** Hover preview (for example an animated title). */
  readonly hover?: (thumb: HTMLElement, on: boolean) => void;
  /** Right-click or the More button. */
  readonly menu?: (x: number, y: number) => void;
  /** A small badge over the thumbnail (for example a size). */
  readonly badge?: string;
}
export type BrowseLayout = 'strip' | 'grid' | 'tiles' | 'list';
export interface BrowseSection {
  readonly id: string;
  readonly title?: string;
  readonly layout: BrowseLayout;
  readonly cards?: () => readonly BrowseCard[];
  /** Custom content (a button row, a tip card, a control). */
  readonly render?: (host: HTMLElement) => void;
  /** Opens the full list as its own page. */
  readonly seeAll?: () => BrowsePage;
  /** Shown when there are no cards; null hides the section instead. */
  readonly empty?: { title: string; hint?: string } | null;
  /** Grid columns (default 2). */
  readonly columns?: number;
}
export interface BrowseChip {
  readonly id: string;
  readonly label: string;
  readonly title?: string;
}
export interface BrowsePage {
  readonly id: string;
  readonly title: string;
  /** Search placeholder; absent hides the search box. */
  readonly search?: string;
  readonly chips?: readonly BrowseChip[];
  readonly sections: (state: {
    readonly query: string;
    readonly chip: string | null;
  }) => readonly BrowseSection[];
  /** Status shown instead of the sections (loading or error). */
  readonly status?: () => { kind: 'loading' | 'error'; text: string } | null;
}

const CHUNK = 48;
const STRIP_LIMIT = 24;

export interface BrowsePanel {
  /** Re-renders the current page (data arrived or changed). */
  refresh(): void;
  push(page: BrowsePage): void;
  back(): void;
  /** Returns to the root page. */
  reset(): void;
  readonly depth: number;
  readonly element: HTMLElement;
}

export function createBrowsePanel(
  host: HTMLElement,
  root: BrowsePage,
  options: { close?: () => void; id: string },
): BrowsePanel {
  host.classList.add('browse-panel');
  host.dataset.browse = options.id;
  const header = document.createElement('div');
  header.className = 'browse-header';
  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'icon-button browse-back';
  backButton.dataset.action = 'browse-back';
  backButton.setAttribute('aria-label', t('browse.back'));
  backButton.title = t('browse.back');
  backButton.innerHTML = iconSvg('back', 18);
  const title = document.createElement('h2');
  title.className = 'browse-title';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'icon-button browse-close';
  closeButton.dataset.action = 'browse-close';
  closeButton.setAttribute('aria-label', t('browse.close'));
  closeButton.title = t('browse.close');
  closeButton.innerHTML = iconSvg('close', 18);
  closeButton.hidden = !options.close;
  closeButton.onclick = () => options.close?.();
  header.append(backButton, title, closeButton);
  const searchRow = document.createElement('div');
  searchRow.className = 'browse-search';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'browse-search-input';
  search.id = `browse-search-${options.id}`;
  searchRow.append(search);
  const viewport = document.createElement('div');
  viewport.className = 'browse-viewport';
  host.replaceChildren(header, searchRow, viewport);

  interface Frame {
    page: BrowsePage;
    query: string;
    chip: string | null;
    scroll: number;
  }
  const stack: Frame[] = [{ page: root, query: '', chip: null, scroll: 0 }];
  const top = () => stack.at(-1)!;
  let observer: IntersectionObserver | null = null;
  const lazy = new WeakMap<Element, () => void>();
  const watch = (element: Element, run: () => void) => {
    if (typeof IntersectionObserver === 'undefined') return run();
    observer ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            observer!.unobserve(entry.target);
            lazy.get(entry.target)?.();
            lazy.delete(entry.target);
          }
      },
      { root: null, rootMargin: '120px' },
    );
    lazy.set(element, run);
    observer.observe(element);
  };

  const cardElement = (card: BrowseCard, layout: BrowseLayout) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `browse-card browse-card-${layout}${
      card.className ? ` ${card.className}` : ''
    }`;
    button.dataset.cardId = card.id;
    for (const [key, value] of Object.entries(card.data ?? {}))
      button.dataset[key] = value;
    button.title = card.disabled ?? card.label;
    button.setAttribute('aria-label', card.label);
    const thumb = document.createElement('span');
    thumb.className = 'browse-thumb';
    if (layout !== 'list' && layout !== 'tiles')
      thumb.style.aspectRatio = String(card.aspect ?? 16 / 9);
    if (card.icon) thumb.innerHTML = iconSvg(card.icon, 22);
    const label = document.createElement('span');
    label.className = 'browse-label';
    label.textContent = card.label;
    button.append(thumb, label);
    if (card.badge) {
      const badge = document.createElement('span');
      badge.className = 'browse-badge';
      badge.textContent = card.badge;
      thumb.append(badge);
    }
    if (card.disabled) button.setAttribute('aria-disabled', 'true');
    button.onclick = () => {
      if (card.disabled) return;
      card.activate?.();
    };
    if (card.drag && !card.disabled) {
      button.draggable = true;
      button.ondragstart = (event) => {
        event.dataTransfer?.setData(card.drag!.type, card.drag!.data);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      };
    }
    if (card.hover) {
      button.addEventListener('pointerenter', () => card.hover!(thumb, true));
      button.addEventListener('pointerleave', () => card.hover!(thumb, false));
      button.addEventListener('focus', () => card.hover!(thumb, true));
      button.addEventListener('blur', () => card.hover!(thumb, false));
    }
    if (card.menu)
      button.oncontextmenu = (event) => {
        event.preventDefault();
        card.menu!(event.clientX, event.clientY);
      };
    if (card.preview) {
      thumb.classList.add('skeleton');
      watch(button, () => {
        const settle = (url: string | null) => {
          thumb.classList.remove('skeleton');
          if (!url) return;
          const image = document.createElement('img');
          image.alt = '';
          image.draggable = false;
          image.setAttribute('aria-hidden', 'true');
          image.src = url;
          thumb.replaceChildren(
            image,
            ...thumb.querySelectorAll('.browse-badge'),
          );
        };
        try {
          const result = card.preview!();
          if (result instanceof Promise)
            result.then(settle, () => settle(null));
          else settle(result);
        } catch {
          settle(null);
        }
      });
    }
    return button;
  };
  /** Arrow keys move along a strip, grid or list. */
  const arrowKeys = (list: HTMLElement, columns: number) => {
    list.addEventListener('keydown', (event) => {
      const cards = [
        ...list.querySelectorAll<HTMLButtonElement>(':scope > .browse-card'),
      ];
      const at = cards.indexOf(document.activeElement as HTMLButtonElement);
      if (at < 0) return;
      const step =
        event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowLeft'
            ? -1
            : event.key === 'ArrowDown'
              ? columns
              : event.key === 'ArrowUp'
                ? -columns
                : 0;
      if (!step) return;
      const next = cards[at + step];
      if (!next) return;
      event.preventDefault();
      next.focus();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };
  const sectionElement = (section: BrowseSection) => {
    const wrap = document.createElement('section');
    wrap.className = `browse-section browse-section-${section.layout}`;
    wrap.dataset.section = section.id;
    const cards = section.cards?.() ?? [];
    if (section.title || section.seeAll) {
      const head = document.createElement('div');
      head.className = 'browse-section-head';
      const heading = document.createElement('h3');
      heading.textContent = section.title ?? '';
      head.append(heading);
      if (section.seeAll && cards.length) {
        const all = document.createElement('button');
        all.type = 'button';
        all.className = 'browse-see-all';
        all.dataset.action = 'see-all';
        all.dataset.seeAll = section.id;
        all.textContent = t('browse.seeAll');
        all.setAttribute(
          'aria-label',
          t('browse.seeAllOf', { name: section.title ?? '' }),
        );
        all.onclick = () => panel.push(section.seeAll!());
        head.append(all);
      }
      wrap.append(head);
    }
    if (section.render) {
      const custom = document.createElement('div');
      custom.className = 'browse-custom';
      section.render(custom);
      wrap.append(custom);
    }
    if (!section.cards) return wrap;
    if (!cards.length) {
      if (section.empty === null) return null;
      const empty = document.createElement('div');
      empty.className = 'browse-empty';
      const heading = document.createElement('p');
      heading.className = 'browse-empty-title';
      heading.textContent = section.empty?.title ?? t('browse.empty');
      empty.append(heading);
      if (section.empty?.hint) {
        const hint = document.createElement('p');
        hint.className = 'browse-empty-hint';
        hint.textContent = section.empty.hint;
        empty.append(hint);
      }
      wrap.append(empty);
      return wrap;
    }
    const list = document.createElement('div');
    list.className = `browse-list browse-${section.layout}`;
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', section.title ?? title.textContent ?? '');
    const columns = section.columns ?? (section.layout === 'tiles' ? 3 : 2);
    if (section.layout === 'grid' || section.layout === 'tiles')
      list.style.setProperty('--browse-columns', String(columns));
    arrowKeys(
      list,
      section.layout === 'strip' ? 1 : section.layout === 'list' ? 1 : columns,
    );
    wrap.append(list);
    const shown =
      section.layout === 'strip' ? cards.slice(0, STRIP_LIMIT) : cards;
    // Virtualised: the first chunk now, the next when its sentinel shows.
    let rendered = 0;
    const more = () => {
      const next = shown.slice(rendered, rendered + CHUNK);
      rendered += next.length;
      list.append(...next.map((card) => cardElement(card, section.layout)));
      if (rendered < shown.length) {
        const sentinel = document.createElement('span');
        sentinel.className = 'browse-sentinel';
        sentinel.setAttribute('aria-hidden', 'true');
        list.append(sentinel);
        watch(sentinel, () => {
          sentinel.remove();
          more();
        });
      }
    };
    more();
    return wrap;
  };

  // A hidden panel renders when it is next shown, so loading the library
  // never builds pages nobody sees.
  let dirty = false;
  const hiddenNow = () => !host.isConnected || host.offsetParent === null;
  if (typeof ResizeObserver !== 'undefined')
    new ResizeObserver(() => {
      if (dirty && !hiddenNow()) render();
    }).observe(host);
  const render = (direction: 'forward' | 'back' | 'none' = 'none') => {
    if (hiddenNow() && typeof ResizeObserver !== 'undefined') {
      dirty = true;
      return;
    }
    dirty = false;
    const frame = top();
    const page = frame.page;
    title.textContent = page.title;
    backButton.hidden = stack.length < 2;
    host.dataset.page = page.id;
    searchRow.hidden = !page.search;
    search.placeholder = page.search ?? '';
    search.setAttribute('aria-label', page.search ?? '');
    if (search.value !== frame.query) search.value = frame.query;
    // Cards of the old page no longer need drawing.
    observer?.disconnect();
    observer = null;
    const body = document.createElement('div');
    body.className = 'browse-page';
    body.dataset.page = page.id;
    if (direction !== 'none') body.classList.add(`browse-enter-${direction}`);
    if (page.chips?.length) {
      const chips = document.createElement('div');
      chips.className = 'browse-chips';
      chips.setAttribute('role', 'tablist');
      chips.setAttribute('aria-label', page.title);
      for (const chip of [
        { id: '', label: t('browse.chipAll') },
        ...page.chips,
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'browse-chip';
        button.dataset.chip = chip.id;
        button.setAttribute('role', 'tab');
        button.setAttribute(
          'aria-selected',
          String((frame.chip ?? '') === chip.id),
        );
        button.textContent = chip.label;
        if ('title' in chip && chip.title) button.title = chip.title;
        button.onclick = () => {
          frame.chip = chip.id || null;
          render();
          host
            .querySelector<HTMLElement>(
              `.browse-chip[data-chip="${CSS.escape(chip.id)}"]`,
            )
            ?.focus();
        };
        chips.append(button);
      }
      body.append(chips);
    }
    const status = page.status?.();
    if (status) {
      const box = document.createElement('div');
      box.className = `browse-status browse-status-${status.kind}`;
      box.setAttribute('role', status.kind === 'error' ? 'alert' : 'status');
      if (status.kind === 'error') box.innerHTML = iconSvg('warning', 16);
      const text = document.createElement('span');
      text.textContent = status.text;
      box.append(text);
      body.append(box);
      if (status.kind === 'loading') {
        const skeletons = document.createElement('div');
        skeletons.className = 'browse-list browse-grid';
        for (let i = 0; i < 6; i++) {
          const card = document.createElement('span');
          card.className = 'browse-card browse-card-grid';
          card.innerHTML = '<span class="browse-thumb skeleton"></span>';
          skeletons.append(card);
        }
        body.append(skeletons);
      }
    } else {
      const sections = page.sections({
        query: frame.query.trim().toLowerCase(),
        chip: frame.chip,
      });
      let any = false;
      for (const section of sections) {
        const element = sectionElement(section);
        if (element) {
          any = true;
          body.append(element);
        }
      }
      if (!any && frame.query.trim()) {
        const none = document.createElement('p');
        none.className = 'browse-empty browse-no-results';
        none.setAttribute('role', 'status');
        none.textContent = t('library.noResults', {
          query: frame.query.trim(),
        });
        body.append(none);
      }
    }
    viewport.replaceChildren(body);
    viewport.scrollTop = direction === 'back' ? frame.scroll : 0;
  };
  search.oninput = () => {
    top().query = search.value;
    render();
  };
  backButton.onclick = () => panel.back();

  const panel: BrowsePanel = {
    refresh: () => render(),
    push(page) {
      top().scroll = viewport.scrollTop;
      stack.push({ page, query: '', chip: null, scroll: 0 });
      render('forward');
      backButton.focus();
    },
    back() {
      if (stack.length < 2) return;
      stack.pop();
      render('back');
    },
    reset() {
      stack.splice(1);
      top().query = '';
      render();
    },
    get depth() {
      return stack.length;
    },
    element: host,
  };
  render();
  return panel;
}

/** Search: cards whose label or keywords contain the query. */
export function matchesQuery(card: BrowseCard, query: string) {
  if (!query) return true;
  return (
    card.label.toLowerCase().includes(query) ||
    (card.keywords ?? []).some((word) => word.toLowerCase().includes(query))
  );
}
