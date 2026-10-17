// Q4: the left rail's AI category: everything imported into My library
// (Creator Packs and code animations), grouped by kind (S1: no AI chip,
// everything here is AI). R4: built on the shared library panel (search, New folder, tabs
// per kind that has items, big cards with "⋯" and "+"). A click inserts the
// item with the usual library insert (one undo step); a preset is applied to
// the selected layer; a theme is applied. The header holds Import and Copy
// AI brief. Rename, folders and Delete never touch layers already placed.
import { t } from '../i18n';
import { creatorLibraryId, type CreatorLibrary } from './creator-library';
import { briefThumbnail, styleThumbnail } from './style-card';
import type { BriefLibrary } from './brief-library';
import { libraryPreview, libraryThumb } from './library-thumb';
import { mountShelf, type Shelf } from './library-shelf';
import { shelfFolders } from './shelf-folders';

/** Kinds in the order the panel lists them (the brief's order). */
export const AI_KINDS = [
  // B1: styles first: they start a whole AI video; then saved briefs.
  'style',
  'brief',
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
  /** S1: a code animation's Duplicate and Export (absent for others). */
  readonly duplicate?: (id: string) => void;
  readonly exportItem?: (id: string) => void;
  readonly isCode?: (id: string) => boolean;
  /** B1: "Use this style" (opens the New AI video form with it). */
  readonly useStyle?: (id: string) => void;
  /** B1: the New AI video form; My briefs, opened prefilled by "+". */
  readonly newVideo?: () => void;
  readonly briefs?: BriefLibrary;
  readonly useBrief?: (id: string) => void;
  readonly details: (id: string) => void;
  readonly remove: (id: string) => void;
  readonly prompt: (title: string, value: string) => Promise<string | null>;
  readonly report: (error: unknown) => void;
  readonly toast?: (text: string) => void;
}

export const AI_FOLDERS = shelfFolders('ai');
/** B1: My briefs share the AI panel; their shelf ids are `brief:<id>`. */
export const isBriefId = (id: string) => id.startsWith('brief:');
export const briefIdOf = (id: string) => id.slice('brief:'.length);

export function mountAiPanel(host: HTMLElement, options: AiPanelOptions) {
  const entryOf = (id: string) =>
    options.library.list().find((entry) => creatorLibraryId(entry.key) === id);
  const add = (id: string) => {
    if (isBriefId(id)) return options.useBrief?.(briefIdOf(id));
    const entry = entryOf(id);
    if (!entry) return;
    if (entry.item.type === 'preset') options.applyPreset(id);
    else if (entry.item.type === 'style') options.useStyle?.(id);
    else options.insert(id);
  };
  const briefItems = () =>
    (options.briefs?.list() ?? []).map((brief) => {
      const id = `brief:${brief.id}`;
      const url = briefThumbnail(brief.name, brief.values.topic);
      return {
        id,
        name: brief.name,
        category: 'brief',
        folderId: AI_FOLDERS.folderOf(id),
        keywords: ['brief', brief.values.topic],
        data: { brief: brief.id, kind: 'brief' },
        addLabel: t('brief.open'),
        thumb: (slot: HTMLElement) =>
          libraryThumb(slot, { id, type: 'brief', name: brief.name, url }),
      };
    });
  const shelf: Shelf = mountShelf({
    host,
    prefix: 'ai',
    title: t('ai.title'),
    classes: { card: 'ai-card', section: 'ai-group' },
    searchLabel: t('shelf.searchAi'),
    actions: [
      ...(options.newVideo
        ? [
            {
              id: 'ai-new-video',
              label: t('briefForm.newVideo'),
              icon: 'magic',
              primary: true,
              wide: true,
              run: () => options.newVideo!(),
            },
          ]
        : []),
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
        primary: !options.newVideo,
        run: () => options.copyBrief(),
      },
    ],
    categoryLabel: (kind) => t(`ai.kind.${kind}`),
    categoryOrder: AI_KINDS,
    folders: AI_FOLDERS,
    items: () => [
      ...briefItems(),
      ...options.library.list().map((entry) => {
        const id = creatorLibraryId(entry.key);
        const kind = entry.item.type;
        const style = entry.item.type === 'style';
        const source = {
          id,
          type: kind,
          name: entry.name,
          data: entry.item.data,
          // B1: a style's card is its palette, category icon and name.
          url:
            entry.item.type === 'style'
              ? styleThumbnail(entry.item.data, entry.name)
              : (entry.thumbnail ?? null),
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
          // B1: a style is never placed: no drag; "+" uses it.
          ...(style
            ? { addLabel: t('style.use') }
            : {
                drag: () => ({
                  kind: 'creator' as const,
                  id,
                  name: entry.name,
                }),
              }),
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
    ],
    add,
    rename: options.rename,
    extraMenu: (id) =>
      options.isCode?.(id)
        ? [
            {
              id: 'ai-duplicate',
              label: t('shelf.duplicate'),
              icon: 'duplicate',
              run: () => options.duplicate?.(id),
            },
            {
              id: 'ai-export',
              label: t('shelf.export'),
              icon: 'download',
              run: () => options.exportItem?.(id),
            },
          ]
        : [],
    details: options.details,
    remove: options.remove,
    prompt: options.prompt,
    empty: () => ({ title: t('ai.emptyTitle'), description: t('ai.empty') }),
    report: options.report,
    ...(options.toast ? { toast: options.toast } : {}),
  });
  const offLibrary = options.library.onChange(() => shelf.render());
  const offBriefs = options.briefs?.onChange(() => shelf.render());
  const offFolders = AI_FOLDERS.onChange(() => shelf.render());
  return {
    render: () => shelf.render(),
    shelf,
    dispose: () => {
      offLibrary();
      offBriefs?.();
      offFolders();
      shelf.dispose();
    },
  };
}
