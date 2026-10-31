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
  /** FIX9: a saved scene's card opens its asset view (it never adds). */
  readonly open: (id: string) => void;
  /** FIX9: Review & swap for a saved scene (AI-made or with media files). */
  readonly review?: (id: string) => void;
  readonly hasReview?: (id: string) => boolean;
  readonly rename: (id: string) => void;
  /** S1: a code animation's Duplicate and Export (absent for others). */
  readonly duplicate?: (id: string) => void;
  readonly exportItem?: (id: string) => void;
  readonly isCode?: (id: string) => boolean;
  readonly details: (id: string) => void;
  readonly remove: (id: string) => void;
  readonly prompt: (title: string, value: string) => Promise<string | null>;
  readonly report: (error: unknown) => void;
  readonly toast?: (text: string) => void;
  /** FX10: copy templates from the user's other projects into this one. */
  readonly importLibrary?: () => void;
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
    ...(options.importLibrary
      ? {
          actions: [
            {
              id: 'mine-import-library',
              label: t('importLib.mine.button'),
              icon: 'download',
              wide: true,
              run: () => options.importLibrary!(),
            },
          ],
        }
      : {}),
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
          ...(item.kind === 'scene' ? { opens: true } : {}),
          folderId: MINE_FOLDERS.folderOf(item.id),
          keywords: [item.kind],
          data: { mine: item.id, kind: item.kind },
          drag: () => ({
            kind: 'saved' as const,
            id: item.id,
            name: item.name,
          }),
          thumb: (slot: HTMLElement) => libraryThumb(slot, source),
          ...(item.kind === 'animation'
            ? { preview: (slot: HTMLElement) => libraryPreview(slot, source) }
            : {}),
        };
      }),
    add: options.add,
    open: options.open,
    rename: options.rename,
    extraMenu: (id) => [
      // FIX9: an AI scene's menu is the AI category's (Review & swap), but
      // never Build again: a saved scene is a copy, not a plan.
      ...(options.hasReview?.(id)
        ? [
            {
              id: 'mine-review',
              label: t('plan.reviewMedia'),
              icon: 'replace',
              run: () => options.review?.(id),
            },
          ]
        : []),
      ...(options.isCode?.(id)
        ? [
            {
              id: 'mine-duplicate',
              label: t('shelf.duplicate'),
              icon: 'duplicate',
              run: () => options.duplicate?.(id),
            },
            {
              id: 'mine-export',
              label: t('shelf.export'),
              icon: 'download',
              run: () => options.exportItem?.(id),
            },
          ]
        : []),
    ],
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
