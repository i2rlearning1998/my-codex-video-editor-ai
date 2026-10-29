// R3: the shared Clipchamp-style library panel, used by Media, AI and My
// Templates. Top to bottom (under the shared panel header): a search box
// with a New folder icon button on the same row; the panel's primary actions;
// a row of chips (All, one per category that has items or is fixed, then the user's
// folders); a two-column grid of big cards (16:9 thumbnail, one-line name).
// A card's click adds it to the scene; its "⋯" button opens the same menu as
// a right-click (Rename, Add to scene, Move to folder, Details, Delete) and
// its "+" button adds it to the scene. Categories come only from items:
// there are no empty automatic tabs, while user folders may be empty.
// Nothing here is an undo step: the panels' owners keep library state
// outside the project history.
import { t } from '../i18n';
import { drags, type DragPayload } from './drag-controller';
import { createMenu, placeMenuAt, type MenuEntry } from './context-menu';
import { iconSvg } from './icons';

export interface ShelfItem {
  readonly id: string;
  readonly name: string;
  /** The automatic category (a tab exists only while it has items). */
  readonly category: string;
  readonly folderId?: string | null;
  readonly title?: string;
  /** B1: the "+" and menu label when it is not Add to scene ("Use this
   *  style"). */
  readonly addLabel?: string;
  /** S1 Part 3: what a drag of the card carries (canvas and timeline). */
  readonly drag?: () => DragPayload | null;
  /** A small badge over the thumbnail (a duration). */
  readonly badge?: string;
  /** Extra data-* attributes on the card button. */
  readonly data?: Readonly<Record<string, string>>;
  /** Extra search words. */
  readonly keywords?: readonly string[];
  /** Fills the 16:9 thumbnail slot. */
  thumb(slot: HTMLElement): void;
  /** A short looping preview while hovered (one card at a time). */
  readonly preview?: (slot: HTMLElement) => () => void;
  /** FIX9: a click opens the item's own view (options.open) instead of
   *  adding it; the "+" and the menu's Add still add. */
  readonly opens?: boolean;
  /** Wires a drag source or other behaviour onto the card button. */
  readonly decorate?: (card: HTMLButtonElement) => void;
}
export interface ShelfFolder {
  readonly id: string;
  readonly name: string;
}
export interface ShelfAction {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly primary?: boolean;
  /** B1: the action takes the whole row (above the others). */
  readonly wide?: boolean;
  readonly run: () => void;
}
export interface ShelfOptions {
  readonly host: HTMLElement;
  /** Prefix for ids and menu entries (media, ai, mine). */
  readonly prefix: string;
  readonly title: string;
  /** Classes added to each part, so a panel can keep its own names. */
  readonly classes?: {
    readonly item?: string;
    readonly card?: string;
    readonly thumb?: string;
    readonly name?: string;
    readonly section?: string;
  };
  readonly searchId?: string;
  readonly searchLabel: string;
  readonly actions?: readonly ShelfAction[];
  /** Extra elements placed after the action row (a drop zone, progress). */
  readonly extra?: readonly HTMLElement[];
  readonly categoryLabel: (category: string) => string;
  /** All shows one flat grid (in the panel's sort order), not sections. */
  readonly flatAll?: boolean;
  /** Category order (others follow in first-seen order). */
  readonly categoryOrder?: readonly string[];
  /** S1: extra item-menu entries after Add to scene (Duplicate, Export). */
  readonly extraMenu?: (id: string) => readonly MenuEntry[];
  /** S1: categories whose chip shows even with no items (Media's types). */
  readonly fixedCategories?: readonly string[];
  readonly folders?: {
    list(): readonly ShelfFolder[];
    create(name: string): ShelfFolder | void;
    move(itemId: string, folderId: string | null): void;
    rename(folderId: string, name: string): void;
    remove(folderId: string): void;
  };
  readonly items: () => readonly ShelfItem[];
  readonly add: (id: string) => void;
  /** FIX9: opens an item's own view (a card marked `opens`). */
  readonly open?: (id: string) => void;
  readonly rename: (id: string) => void;
  readonly details: (id: string) => void;
  readonly remove: (id: string) => void;
  /** A name for a new or renamed folder (null: cancelled). */
  readonly prompt: (title: string, value: string) => Promise<string | null>;
  /** An illustration (inline SVG markup) above the empty state's text. */
  readonly illustration?: string;
  /** Shown when the panel (or the open tab) has nothing to show. */
  readonly empty: () => { title: string; description: string };
  /** Loading and error states (null: ready). */
  readonly status?: () => {
    kind: 'loading' | 'error';
    title: string;
    description: string;
  } | null;
  readonly report: (error: unknown) => void;
  readonly toast?: (text: string) => void;
}
export interface Shelf {
  render(): void;
  filter(query: string): void;
  setTab(tab: string): void;
  readonly tab: string;
  readonly grid: HTMLElement;
  openMenu(id: string, x: number, y: number): void;
  /** FIX9: shows a view in the same panel in place of the shelf (Back
   *  restores it). */
  openDetail(view: HTMLElement): void;
  closeDetail(): void;
  readonly detailOpen: boolean;
  dispose(): void;
}

const ALL = 'all';
/** The HTML5 drag type a library card carries (its id). */
const DRAG_TYPE = 'application/x-editor-asset';
const folderTab = (id: string) => `folder:${id}`;

export function mountShelf(options: ShelfOptions): Shelf {
  const { host, prefix } = options;
  host.classList.add('shelf');
  host.dataset.shelf = prefix;
  let query = '';
  let tab = ALL;
  let disposed = false;
  let stopPreview: (() => void) | null = null;

  // S1 Part 1: the panel's title and collapse button are the shared panel
  // header's (panel-header.ts); the shelf only names its region.
  host.setAttribute('aria-label', options.title);
  // Search with New folder on the same row.
  const searchRow = document.createElement('div');
  searchRow.className = 'shelf-search-row';
  const searchBox = document.createElement('label');
  searchBox.className = 'shelf-search library-search';
  searchBox.innerHTML = iconSvg('search', 16);
  const search = document.createElement('input');
  search.type = 'text';
  search.id = options.searchId ?? `${prefix}-search`;
  search.placeholder = options.searchLabel;
  search.setAttribute('aria-label', options.searchLabel);
  search.oninput = () => {
    query = search.value.trim().toLowerCase();
    render();
  };
  searchBox.append(search);
  searchRow.append(searchBox);
  if (options.folders) {
    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'icon-button shelf-new-folder';
    create.id = `${prefix}-folder-new`;
    create.innerHTML = iconSvg('folderPlus', 16);
    create.setAttribute('aria-label', t('shelf.newFolder'));
    create.title = t('shelf.newFolder');
    create.onclick = () =>
      void newFolder().then((folder) => {
        if (folder) setTab(folderTab(folder.id));
      });
    searchRow.append(create);
  }
  const actions = document.createElement('div');
  actions.className = 'shelf-actions';
  actions.id = `${prefix}-actions`;
  for (const action of options.actions ?? []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      `button ${action.primary ? 'primary' : ''} ${action.wide ? 'shelf-action-wide' : ''}`
        .replace(/\s+/g, ' ')
        .trim();
    button.id = action.id;
    button.innerHTML = `${iconSvg(action.icon, 16)}<span></span>`;
    button.querySelector('span')!.textContent = action.label;
    button.onclick = () => {
      try {
        action.run();
      } catch (error) {
        options.report(error);
      }
    };
    actions.append(button);
  }
  const tabs = document.createElement('div');
  tabs.className = 'shelf-tabs';
  tabs.id = `${prefix}-tabs`;
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', options.title);
  const state = document.createElement('div');
  state.className = 'shelf-state';
  state.id = `${prefix}-state`;
  state.hidden = true;
  state.innerHTML = `${options.illustration ?? ''}<h3 class="shelf-state-title" id="${prefix}-state-title"></h3><p class="shelf-state-description" id="${prefix}-state-description"></p>`;
  const grid = document.createElement('div');
  grid.className = 'shelf-grid';
  grid.id = `${prefix}-grid`;
  // FIX1 F1: the search, actions, extras and chips stay fixed; only the
  // body (a panel's sort row, the state and the cards) scrolls.
  const body = document.createElement('div');
  body.className = 'shelf-body';
  body.id = `${prefix}-body`;
  body.append(state, grid);
  // FIX9: an item's own view (the asset view) takes the panel's place.
  const detail = document.createElement('div');
  detail.className = 'shelf-body shelf-detail';
  detail.id = `${prefix}-detail`;
  detail.hidden = true;
  host.replaceChildren(
    searchRow,
    ...(options.actions?.length ? [actions] : []),
    ...(options.extra ?? []),
    tabs,
    body,
    detail,
  );
  const openDetail = (view: HTMLElement) => {
    detail.replaceChildren(view);
    detail.hidden = false;
    host.classList.add('shelf-detail-open');
    detail.scrollTop = 0;
  };
  const closeDetail = () => {
    detail.replaceChildren();
    detail.hidden = true;
    host.classList.remove('shelf-detail-open');
  };

  // The item menu (also the "⋯" button's).
  const menuElement = document.createElement('div');
  menuElement.className = 'media-menu shelf-menu';
  menuElement.id = `${prefix}-menu`;
  menuElement.hidden = true;
  document.body.append(menuElement);
  const menu = createMenu(menuElement, { report: options.report });
  const closeOutside = (event: PointerEvent) => {
    if (!menuElement.hidden && !menuElement.contains(event.target as Node))
      menu.close();
  };
  document.addEventListener('pointerdown', closeOutside, true);
  const placeMenu = (x: number, y: number) => placeMenuAt(menuElement, x, y);
  const run = (action: () => unknown) => () => {
    try {
      const result = action();
      if (result instanceof Promise)
        result.catch((error: unknown) => options.report(error));
    } catch (error) {
      options.report(error);
    }
  };
  const newFolder = async (): Promise<ShelfFolder | null> => {
    if (!options.folders) return null;
    const name = await options.prompt(t('shelf.newFolderTitle'), '');
    if (!name?.trim()) return null;
    return options.folders.create(name.trim()) ?? null;
  };
  const itemMenu = (id: string): MenuEntry[] => {
    const item = options.items().find((entry) => entry.id === id);
    const folders = options.folders;
    const current = item?.folderId ?? null;
    return [
      {
        id: `${prefix}-rename`,
        label: t('shelf.rename'),
        icon: 'edit',
        run: run(() => options.rename(id)),
      },
      {
        id: `${prefix}-add`,
        label: item?.addLabel ?? t('shelf.addToScene'),
        icon: 'plus',
        run: run(() => options.add(id)),
      },
      ...(options.extraMenu?.(id) ?? []),
      ...(folders
        ? [
            {
              id: `${prefix}-folder`,
              label: t('shelf.moveToFolder'),
              icon: 'folder',
              submenu: () => [
                {
                  id: `${prefix}-folder-new`,
                  label: t('shelf.newFolderMenu'),
                  icon: 'plus',
                  run: run(async () => {
                    const folder = await newFolder();
                    if (!folder) return;
                    folders.move(id, folder.id);
                    options.toast?.(
                      t('media.folder.moved', { name: folder.name }),
                    );
                  }),
                },
                ...folders.list().map((folder, index) => ({
                  id: `${prefix}-folder-pick`,
                  label: folder.name,
                  role: 'menuitemradio' as const,
                  checked: folder.id === current,
                  divider: index === 0,
                  data: { folderId: folder.id },
                  run: run(() => {
                    folders.move(id, folder.id);
                    options.toast?.(
                      t('media.folder.moved', { name: folder.name }),
                    );
                  }),
                })),
                ...(current
                  ? [
                      {
                        id: `${prefix}-folder-none`,
                        label: t('media.folder.none'),
                        run: run(() => folders.move(id, null)),
                      },
                    ]
                  : []),
              ],
            },
          ]
        : []),
      {
        id: `${prefix}-details`,
        label: t('shelf.details'),
        icon: 'info',
        run: run(() => options.details(id)),
      },
      {
        id: `${prefix}-delete`,
        label: t('shelf.delete'),
        icon: 'delete',
        divider: true,
        run: run(() => options.remove(id)),
      },
    ];
  };
  const openMenu = (id: string, x: number, y: number) => {
    menu.open(() => itemMenu(id));
    placeMenu(x, y);
  };
  const folderMenu = (folder: ShelfFolder, x: number, y: number) => {
    const folders = options.folders!;
    menu.open(() => [
      {
        id: `${prefix}-folder-rename`,
        label: t('media.menu.rename'),
        icon: 'edit',
        run: run(async () => {
          const name = await options.prompt(
            t('media.folder.renameTitle'),
            folder.name,
          );
          if (name?.trim()) folders.rename(folder.id, name.trim());
        }),
      },
      {
        id: `${prefix}-folder-delete`,
        label: t('media.folder.delete'),
        icon: 'delete',
        run: run(() => {
          folders.remove(folder.id);
          if (tab === folderTab(folder.id)) tab = ALL;
          render();
        }),
      },
    ]);
    placeMenu(x, y);
  };

  const matches = (item: ShelfItem) =>
    !query ||
    [item.name, ...(item.keywords ?? [])].some((word) =>
      word.toLowerCase().includes(query),
    );
  /** Categories with at least one item, in the panel's order. */
  const categories = (items: readonly ShelfItem[], fixed = false) => {
    const seen = [
      ...new Set([
        ...(fixed ? (options.fixedCategories ?? []) : []),
        ...items.map((item) => item.category),
      ]),
    ];
    const order = options.categoryOrder ?? [];
    return [
      ...order.filter((key) => seen.includes(key)),
      ...seen.filter((key) => !order.includes(key)),
    ];
  };
  const chip = (id: string, label: string, folder?: ShelfFolder) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shelf-tab';
    button.dataset.tab = id;
    button.dataset[`${prefix}Tab`] = id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab === id));
    if (folder) {
      button.dataset.folderId = folder.id;
      button.classList.add('shelf-folder-tab');
      button.innerHTML = iconSvg('folder', 14);
      button.oncontextmenu = (event) => {
        event.preventDefault();
        folderMenu(folder, event.clientX, event.clientY);
      };
      // A card dragged (HTML5) onto a folder tab moves into it.
      button.ondragover = (event) => {
        if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        button.classList.add('over');
      };
      button.ondragleave = () => button.classList.remove('over');
      button.ondrop = (event) => {
        button.classList.remove('over');
        const id = event.dataTransfer?.getData(DRAG_TYPE);
        if (!id) return;
        event.preventDefault();
        event.stopPropagation();
        options.folders!.move(id, folder.id);
        options.toast?.(t('media.folder.moved', { name: folder.name }));
      };
    }
    button.append(label);
    button.onclick = () => setTab(id);
    return button;
  };
  const card = (item: ShelfItem) => {
    const wrap = document.createElement('div');
    wrap.className = `shelf-item ${options.classes?.item ?? ''}`.trim();
    wrap.dataset.itemId = item.id;
    if (item.folderId) wrap.dataset.folderId = item.folderId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `shelf-card ${options.classes?.card ?? ''}`.trim();
    button.dataset.itemId = item.id;
    button.dataset.category = item.category;
    for (const [key, value] of Object.entries(item.data ?? {}))
      button.dataset[key] = value;
    button.title = item.title ?? item.name;
    const thumb = document.createElement('span');
    thumb.className = `shelf-thumb ${options.classes?.thumb ?? ''}`.trim();
    item.thumb(thumb);
    if (item.badge) {
      const badge = document.createElement('span');
      badge.className = 'shelf-badge media-badge';
      badge.textContent = item.badge;
      button.append(badge);
    }
    const name = document.createElement('span');
    name.className = `shelf-name ${options.classes?.name ?? ''}`.trim();
    name.textContent = item.name;
    button.prepend(thumb);
    button.append(name);
    button.addEventListener('click', () => {
      try {
        if (item.opens && options.open) options.open(item.id);
        else options.add(item.id);
      } catch (error) {
        options.report(error);
      }
    });
    button.oncontextmenu = (event) => {
      event.preventDefault();
      openMenu(item.id, event.clientX, event.clientY);
    };
    if (item.preview) {
      const start = () => {
        stopPreview?.();
        stopPreview = item.preview!(thumb);
      };
      const stop = () => {
        stopPreview?.();
        stopPreview = null;
      };
      button.addEventListener('pointerenter', start);
      button.addEventListener('pointerleave', stop);
      button.addEventListener('focus', start);
      button.addEventListener('blur', stop);
    }
    item.decorate?.(button);
    // S1 Part 3: every library card drags the same way (one pointer-driven
    // controller); the ghost shows the card's thumbnail.
    if (item.drag)
      drags().source(button, () => {
        const value = item.drag!();
        const src = button.querySelector('img')?.getAttribute('src') ?? null;
        return value && !value.thumb && src ? { ...value, thumb: src } : value;
      });
    const more = document.createElement('button');
    more.type = 'button';
    more.className =
      `shelf-more icon-button ${prefix === 'media' ? 'media-card-more' : ''}`.trim();
    more.dataset.action = `${prefix}-more`;
    more.setAttribute('aria-label', t('shelf.more'));
    more.setAttribute('aria-haspopup', 'menu');
    more.title = t('shelf.more');
    more.innerHTML = iconSvg('more', 16);
    more.onclick = (event) => {
      event.stopPropagation();
      const box = more.getBoundingClientRect();
      openMenu(item.id, box.left, box.bottom + 4);
    };
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'shelf-plus icon-button';
    plus.dataset.action = `${prefix}-plus`;
    plus.setAttribute(
      'aria-label',
      item.addLabel ?? t('shelf.addToSceneShort'),
    );
    plus.title = item.addLabel ?? t('shelf.addToSceneShort');
    plus.innerHTML = iconSvg('plus', 16);
    plus.onclick = (event) => {
      event.stopPropagation();
      try {
        options.add(item.id);
      } catch (error) {
        options.report(error);
      }
    };
    wrap.append(button, more, plus);
    return wrap;
  };
  const section = (key: string, items: readonly ShelfItem[]) => {
    const wrap = document.createElement('section');
    wrap.className = `shelf-section ${options.classes?.section ?? ''}`.trim();
    wrap.dataset.kind = key;
    const heading = document.createElement('h3');
    heading.className = 'shelf-section-title';
    heading.textContent = `${options.categoryLabel(key)} (${items.length})`;
    const cards = document.createElement('div');
    cards.className = 'shelf-cards';
    cards.append(...items.map(card));
    wrap.append(heading, cards);
    return wrap;
  };

  function render() {
    if (disposed) return;
    stopPreview?.();
    stopPreview = null;
    const items = options.items();
    const folders = options.folders?.list() ?? [];
    const keys = categories(items, true);
    // A tab whose last item went disappears; the panel falls back to All.
    if (tab.startsWith('folder:')) {
      if (!folders.some((folder) => folderTab(folder.id) === tab)) tab = ALL;
    } else if (tab !== ALL && !keys.includes(tab)) tab = ALL;
    tabs.replaceChildren(
      ...(keys.length || folders.length ? [chip(ALL, t('shelf.all'))] : []),
      ...keys.map((key) => chip(key, options.categoryLabel(key))),
      ...folders.map((folder) =>
        chip(folderTab(folder.id), folder.name, folder),
      ),
    );
    tabs.hidden = !tabs.childElementCount;
    host.dataset.tab = tab;
    const visible = items.filter(matches);
    let shown: HTMLElement[];
    if (tab === ALL && options.flatAll) {
      const cards = document.createElement('div');
      cards.className = 'shelf-cards';
      cards.append(...visible.map(card));
      shown = visible.length ? [cards] : [];
    } else if (tab === ALL)
      shown = categories(visible).map((key) =>
        section(
          key,
          visible.filter((item) => item.category === key),
        ),
      );
    else {
      const list = tab.startsWith('folder:')
        ? visible.filter((item) => folderTab(item.folderId ?? '') === tab)
        : visible.filter((item) => item.category === tab);
      const cards = document.createElement('div');
      cards.className = 'shelf-cards';
      cards.append(...list.map(card));
      shown = list.length ? [cards] : [];
    }
    grid.replaceChildren(...shown);
    const status = options.status?.() ?? null;
    const empty = !shown.length;
    state.hidden = !status && !empty;
    state.dataset.state =
      status?.kind ?? (items.length ? 'no-matches' : 'empty');
    const text =
      status ??
      (items.length && query
        ? {
            title: t('media.noMatchesTitle'),
            description: t('media.noMatchesDescription'),
          }
        : options.empty());
    state.querySelector('.shelf-state-title')!.textContent = text.title;
    state.querySelector('.shelf-state-description')!.textContent =
      text.description;
  }
  const setTab = (next: string) => {
    tab = next;
    render();
  };
  render();
  return {
    render,
    filter(value: string) {
      search.value = value;
      query = value.trim().toLowerCase();
      render();
    },
    setTab,
    get tab() {
      return tab;
    },
    grid,
    openMenu,
    openDetail,
    closeDetail,
    get detailOpen() {
      return !detail.hidden;
    },
    dispose() {
      disposed = true;
      stopPreview?.();
      document.removeEventListener('pointerdown', closeOutside, true);
      menu.close();
      menuElement.remove();
    },
  };
}
