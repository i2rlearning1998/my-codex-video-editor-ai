// R5: the My Templates left-rail category, on the shared library panel. Tabs
// come from the kinds the user has saved (never pre-made); "⋯" offers
// Rename, Add to scene, Move to folder, Details and Delete; "+" adds to the
// scene. Nothing here is an undo step.
import { t } from '../i18n';
import { libraryPreview, libraryThumb } from './library-thumb';
import { mountShelf, type Shelf } from './library-shelf';
import { MINE_KINDS, type MyLibrary } from './my-library';
import { shelfFolders } from './shelf-folders';

export const MINE_FOLDERS = shelfFolders('mine');

export interface MyTemplatesPanelOptions {
  readonly library: MyLibrary;
  readonly add: (id: string) => void;
  readonly rename: (id: string) => void;
  readonly details: (id: string) => void;
  readonly remove: (id: string) => void;
  readonly prompt: (title: string, value: string) => Promise<string | null>;
  readonly report: (error: unknown) => void;
  readonly toast?: (text: string) => void;
}

export function mountMyTemplatesPanel(
  host: HTMLElement,
  options: MyTemplatesPanelOptions,
) {
  const shelf: Shelf = mountShelf({
    host,
    prefix: 'mine',
    title: t('mine.title'),
    classes: { card: 'mine-card', section: 'mine-group' },
    searchLabel: t('shelf.searchMine'),
    categoryLabel: (kind) => t(`mine.kind.${kind}`),
    categoryOrder: MINE_KINDS,
    folders: MINE_FOLDERS,
    items: () =>
      options.library.list().map((item) => {
        const source = {
          id: item.id,
          type: item.kind,
          name: item.name,
          url: item.poster ?? null,
        };
        return {
          id: item.id,
          name: item.name,
          category: item.kind,
          folderId: MINE_FOLDERS.folderOf(item.id),
          keywords: [item.kind],
          data: { mine: item.id, kind: item.kind },
          thumb: (slot: HTMLElement) => libraryThumb(slot, source),
          ...(item.kind === 'animation'
            ? { preview: (slot: HTMLElement) => libraryPreview(slot, source) }
            : {}),
        };
      }),
    add: options.add,
    rename: options.rename,
    details: options.details,
    remove: options.remove,
    prompt: options.prompt,
    empty: () => ({
      title: t('mine.emptyTitle'),
      description: t('mine.empty'),
    }),
    report: options.report,
    ...(options.toast ? { toast: options.toast } : {}),
  });
  const offLibrary = options.library.onChange(() => shelf.render());
  const offFolders = MINE_FOLDERS.onChange(() => shelf.render());
  return {
    shelf,
    render: () => shelf.render(),
    dispose: () => {
      offLibrary();
      offFolders();
      shelf.dispose();
    },
  };
}
