// Q4: the left rail's AI category: everything imported into My library
// (Creator Packs and code animations), grouped by kind (S1: no AI chip,
// everything here is AI). R4: built on the shared library panel (search, New folder, tabs
// per kind that has items, big cards with "⋯" and "+"). A click inserts the
// item with the usual library insert (one undo step); a preset is applied to
// the selected layer; a theme is applied. The header holds Import and Copy
// AI brief. Rename, folders and Delete never touch layers already placed.
import { getLanguage, t } from '../i18n';
import { developerMode } from './developer-mode';
import {
  creatorLibraryId,
  type CreatorEntry,
  type CreatorLibrary,
} from './creator-library';
import { creatorPlaces } from './placement';
import { libraryClient } from '../library-client';
import { mergeTaxonomy } from '../library-client/taxonomy';
import type { BrowseCard } from './browse-panel';
import { briefThumbnail, styleThumbnail } from './style-card';
import type { BriefLibrary } from './brief-library';
import { libraryPreview, libraryThumb, libraryThumbUrl } from './library-thumb';
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
  // FINAL3 V3.5: the plan builder's starter kit.
  'kit',
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
  /** The ⋯ menu of an AI card shown in another category. */
  readonly menu?: (id: string, x: number, y: number) => void;
  readonly details: (id: string) => void;
  readonly remove: (id: string) => void;
  readonly prompt: (title: string, value: string) => Promise<string | null>;
  readonly report: (error: unknown) => void;
  readonly toast?: (text: string) => void;
  /** FINAL3 V3.5: a plan's build status (shown as a coloured badge). */
  readonly planStatus?: (
    id: string,
    data: unknown,
  ) => 'built' | 'needs-assets' | 'not-built' | null;
  /** FIX4 A4: a built plan's card: status, scene count and a poster drawn
   *  from its first built scene (null when nothing was built). */
  readonly planCard?: (
    id: string,
    data: unknown,
  ) => {
    status: 'built' | 'needs-assets' | 'not-built';
    scenes: number;
    poster?: string;
  } | null;
  /** FIX4 A4: runs the build again for a composition card. */
  readonly rebuild?: (id: string) => void;
  /** FIX6: opens Review & swap for the plan a composition card built. */
  readonly review?: (id: string) => void;
  /** FINAL3 V3.5: the starter kit's items, added to the open scene. */
  readonly kit?: {
    readonly items: () => readonly { id: string; name: string }[];
    readonly insert: (id: string) => void;
    /** FIX4 A10: a picture of the item (null: the soft placeholder). */
    readonly preview?: (id: string) => string | null;
  };
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
    if (id.startsWith('kit:')) return options.kit?.insert(id.slice(4));
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
  /** What a creator entry's card shows (shared by the AI panel's shelf and
   *  by the same card listed in another category). */
  const describe = (entry: CreatorEntry) => {
    const id = creatorLibraryId(entry.key);
    const kind = entry.item.type;
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
    const card =
      kind === 'composition'
        ? (options.planCard?.(id, entry.item.data) ?? null)
        : null;
    const status =
      card?.status ??
      (kind === 'composition'
        ? (options.planStatus?.(id, entry.item.data) ?? null)
        : null);
    if (card?.poster) source.url = card.poster;
    const badge = status
      ? card && card.scenes > 0 && status !== 'not-built'
        ? `${t(`plan.status.${status}`)} · ${t('plan.status.scenes', { count: String(card.scenes) })}`
        : t(`plan.status.${status}`)
      : undefined;
    return { id, kind, source, status, badge };
  };
  /** The same card for another category's panel (Templates, Audio …). */
  const cardFor = (entry: CreatorEntry): BrowseCard => {
    const { id, kind, source, badge } = describe(entry);
    return {
      id,
      label: entry.name,
      keywords: [entry.packName.en, kind, ...entry.item.tags],
      preview: () => libraryThumbUrl(source),
      ...(badge ? { badge } : {}),
      className: 'library-card creator-card',
      data: { itemId: id, creator: 'true', kind },
      activate: () => add(id),
      ...(kind === 'style'
        ? {}
        : {
            drag: () => ({
              kind: 'creator' as const,
              id,
              name: entry.name,
            }),
          }),
      menu: (x: number, y: number) => options.menu?.(id, x, y),
    };
  };
  // The owner's own sub-categories inside AI become groups of their own.
  const order: string[] = [...AI_KINDS];
  const aiSub = (entry: CreatorEntry) => {
    const place = creatorPlaces(entry).find((item) => item.category === 'AI');
    if (!place?.sub) return null;
    const known = mergeTaxonomy(libraryClient().config())
      .find((c) => c.id === 'AI')
      ?.subs.find((s) => s.id === place.sub);
    return known && !['styles', 'plans', 'motion', 'effects'].includes(known.id)
      ? known
      : null;
  };
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
      ...(developerMode()
        ? [
            {
              id: 'ai-import',
              label: t('aiImport.button'),
              icon: 'upload',
              run: () => options.importPack(),
            },
          ]
        : []),
      {
        id: 'ai-copy-brief',
        label: t('brief.copy'),
        icon: 'copy',
        primary: !options.newVideo,
        run: () => options.copyBrief(),
      },
    ],
    categoryLabel: (kind) => {
      if (kind.startsWith('sub:')) {
        const node = mergeTaxonomy(libraryClient().config())
          .find((c) => c.id === 'AI')
          ?.subs.find((s) => s.id === kind.slice(4));
        return node
          ? getLanguage() === 'hi'
            ? node.name.hi
            : node.name.en
          : kind.slice(4);
      }
      return t(`ai.kind.${kind}`);
    },
    categoryOrder: order,
    folders: AI_FOLDERS,
    items: () => [
      ...briefItems(),
      ...(options.kit?.items() ?? []).map((item) => {
        const id = `kit:${item.id}`;
        return {
          id,
          name: item.name,
          category: 'kit',
          folderId: AI_FOLDERS.folderOf(id),
          keywords: ['kit', 'starter', item.id],
          data: { kit: item.id, kind: 'kit' },
          thumb: (slot: HTMLElement) =>
            libraryThumb(slot, {
              id,
              type: 'kit',
              name: item.name,
              url: options.kit?.preview?.(item.id) ?? null,
            }),
        };
      }),
      ...options.library
        .list()
        .filter((entry) =>
          creatorPlaces(entry).some((place) => place.category === 'AI'),
        )
        .map((entry) => {
          const { id, kind, source, status, badge } = describe(entry);
          const style = kind === 'style';
          const live = kind === 'motion' || kind === 'preset';
          const sub = aiSub(entry);
          const group = sub ? `sub:${sub.id}` : kind;
          if (!order.includes(group)) order.push(group);
          return {
            id,
            name: entry.name,
            category: group,
            folderId: AI_FOLDERS.folderOf(id),
            title: `${entry.name} · ${entry.packName.en}`,
            keywords: [entry.packName.en, kind, ...entry.item.tags],
            data: { item: id, kind, ...(status ? { planStatus: status } : {}) },
            ...(badge ? { badge } : {}),
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
    extraMenu: (id) => [
      ...(options.rebuild &&
      options.library
        .list()
        .some(
          (e) =>
            creatorLibraryId(e.key) === id &&
            e.item.type === 'composition' &&
            options.planStatus?.(id, e.item.data) &&
            options.planStatus(id, e.item.data) !== 'not-built',
        )
        ? [
            {
              id: 'ai-review',
              label: t('plan.reviewMedia'),
              icon: 'replace',
              run: () => options.review?.(id),
            },
            {
              id: 'ai-rebuild',
              label: t('plan.rebuild'),
              icon: 'duplicate',
              run: () => options.rebuild?.(id),
            },
          ]
        : []),
      ...(options.isCode?.(id)
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
        : []),
    ],
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
    cardFor,
    shelf,
    dispose: () => {
      offLibrary();
      offBriefs?.();
      offFolders();
      shelf.dispose();
    },
  };
}
