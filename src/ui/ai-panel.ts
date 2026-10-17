// Q4: the left rail's AI category: everything imported into My library
// (Creator Packs and code animations), grouped by kind (S1: no AI chip,
// everything here is AI). R4: built on the shared library panel (search, New folder, tabs
// per kind that has items, big cards with "⋯" and "+"). A click inserts the
// item with the usual library insert (one undo step); a preset is applied to
// the selected layer; a theme is applied. The header holds Import and Copy
// AI brief. Rename, folders and Delete never touch layers already placed.
import { t } from '../i18n';
import { creatorLibraryId, type CreatorLibrary } from './creator-library';
import { libraryPreview, libraryThumb } from './library-thumb';
import { mountShelf, type Shelf } from './library-shelf';
import { shelfFolders } from './shelf-folders';

/** Kinds in the order the panel lists them (the brief's order). */
export const AI_KINDS = [
  'shape',
  'background',
  'text',
  'template',
  'motion',
  'preset',
  'composition',
  'effect',
  'theme',
] as const;

export interface AiPanelOptions {
  readonly library: CreatorLibrary;
  /** Inserts a native or motion item (library id). */
  readonly insert: (id: string) => void;
  /** Applies a preset to the selected layer (library id). */
  readonly applyPreset: (id: string) => void;
  readonly importPack: () => void;
  readonly copyBrief: () => void;
  /** A motion item's live hover preview (returns its stop), if any. */
  readonly motionPreview?: (
    id: string,
    slot: HTMLElement,
  ) => (() => void) | null;
  readonly rename: (id: string) => void;
  readonly details: (id: string) => void;
  readonly remove: (id: string) => void;
  readonly prompt: (title: string, value: string) => Promise<string | null>;
  readonly report: (error: unknown) => void;
  readonly toast?: (text: string) => void;
}

export const AI_FOLDERS = shelfFolders('ai');

export function mountAiPanel(host: HTMLElement, options: AiPanelOptions) {
  const entryOf = (id: string) =>
    options.library.list().find((entry) => creatorLibraryId(entry.key) === id);
  const add = (id: string) => {
    const entry = entryOf(id);
    if (!entry) return;
    if (entry.item.type === 'preset') options.applyPreset(id);
    else options.insert(id);
  };
  const shelf: Shelf = mountShelf({
    host,
    prefix: 'ai',
    title: t('ai.title'),
    classes: { card: 'ai-card', section: 'ai-group' },
    searchLabel: t('shelf.searchAi'),
    actions: [
      {
        id: 'ai-import',
        label: t('aiImport.button'),
        icon: 'upload',
        run: () => options.importPack(),
      },
      {
        id: 'ai-copy-brief',
        label: t('brief.copy'),
        icon: 'copy',
        primary: true,
        run: () => options.copyBrief(),
      },
    ],
    categoryLabel: (kind) => t(`ai.kind.${kind}`),
    categoryOrder: AI_KINDS,
    folders: AI_FOLDERS,
    items: () =>
      options.library.list().map((entry) => {
        const id = creatorLibraryId(entry.key);
        const kind = entry.item.type;
        const source = {
          id,
          type: kind,
          name: entry.name,
          data: entry.item.data,
          url: entry.thumbnail ?? null,
        };
        const live = kind === 'motion' || kind === 'preset';
        return {
          id,
          name: entry.name,
          category: kind,
          folderId: AI_FOLDERS.folderOf(id),
          title: `${entry.name} · ${entry.packName.en}`,
          keywords: [entry.packName.en, kind, ...entry.item.tags],
          data: { item: id, kind },
          thumb: (slot: HTMLElement) => libraryThumb(slot, source),
          ...(live
            ? {
                preview: (slot: HTMLElement) =>
                  options.motionPreview?.(id, slot) ??
                  libraryPreview(slot, source),
              }
            : {}),
        };
      }),
    add,
    rename: options.rename,
    details: options.details,
    remove: options.remove,
    prompt: options.prompt,
    empty: () => ({ title: t('ai.emptyTitle'), description: t('ai.empty') }),
    report: options.report,
    ...(options.toast ? { toast: options.toast } : {}),
  });
  const offLibrary = options.library.onChange(() => shelf.render());
  const offFolders = AI_FOLDERS.onChange(() => shelf.render());
  return {
    render: () => shelf.render(),
    shelf,
    dispose: () => {
      offLibrary();
      offFolders();
      shelf.dispose();
    },
  };
}
