// H5: the library in the left panel. I2: Templates, Elements (shapes and
// graphics), Text and Transitions are browse panels (browse-panel.ts) over
// Starter Pack 1, with drawn previews; a click or a drop adds the item
// through the Command Bus.
import { createNumberField } from './components/number-field';
import type { EditorEngine } from '../core';
import { getLanguage, t } from '../i18n';
import { loadLibrary } from '../library/loader';
import type { LibraryItem, TemplateCategory } from '../library/schema';
import type { RenderSource } from '../render/adapter';
import type { TextMeasurer } from '../render/text-layout';
import { drawComposition } from '../render/canvas';
import {
  createBrowsePanel,
  matchesQuery,
  type BrowseCard,
  type BrowsePage,
  type BrowseSection,
} from './browse-panel';
import { iconSvg } from './icons';
import { confirmDialog, escapeHtml } from './components/modal';
import { itemName, libraryCommands } from './library-insert';
import {
  LIBRARY_DRAG_TYPE,
  recent,
  type LibraryActions,
} from './library-actions';
import { myTemplates, type MyTemplate } from './my-templates';
import type { EditorSession } from './session';
import {
  addShapeCommands,
  BASIC_PRESETS,
  LINE_PRESETS,
  type ShapePreset,
} from './shapes';

const PREVIEW = { width: 1280, height: 720 };
const THUMB = { width: 144, height: 81 };

function previewComposition() {
  return {
    id: 'library-preview',
    name: 'Preview',
    width: PREVIEW.width,
    height: PREVIEW.height,
    fps: 30,
    duration: 10,
    layers: [],
    tracks: [],
    markers: [],
    metadata: {},
  } as unknown as RenderSource['composition'];
}

/** Draws an item into a small canvas with the editor's own renderer. */
export function drawLibraryPreview(
  canvas: HTMLCanvasElement,
  item: LibraryItem | { type: 'layers'; layers: unknown[] },
  measureText?: TextMeasurer,
) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(THUMB.width * ratio);
  canvas.height = Math.round(THUMB.height * ratio);
  const context = canvas.getContext('2d');
  if (!context) return;
  if (item.type === 'transition')
    return drawTransitionPoster(context, canvas, item);
  const composition = previewComposition();
  const base: RenderSource = {
    composition,
    assets: [],
    background: '#ffffff',
    ...(measureText ? { measureText } : {}),
  };
  const insert =
    item.type === 'layers'
      ? { commands: [] }
      : libraryCommands({ compositions: [composition] }, base, item, 0);
  let layers: unknown[] = item.type === 'layers' ? item.layers : [];
  let background = item.type === 'template' ? item.data.background : '#ffffff';
  for (const command of insert.commands as unknown as {
    type: string;
    layer?: unknown;
    composition?: { layers: unknown[] };
  }[]) {
    if (command.type === 'CREATE_LAYER' && command.layer)
      layers.push(command.layer);
    if (command.type === 'CREATE_COMPOSITION' && command.composition)
      layers = command.composition.layers;
  }
  if (item.type === 'text') background = '#f4f4f6';
  // Shapes and text are zoomed to their own box; scenes show the canvas.
  let scale = canvas.width / PREVIEW.width;
  let offset: [number, number] = [0, 0];
  if (item.type === 'shape' || item.type === 'text' || item.type === 'layers') {
    const top = layers[0] as {
      transform: { position: { value: [number, number] } };
      properties: Record<string, { value: unknown }>;
      children: {
        properties: Record<string, { value: unknown }>;
        transform: { position: { value: [number, number] } };
      }[];
    };
    const boxes = (top.children.length ? top.children : [top]).map((layer) => ({
      x:
        layer.transform.position.value[0] +
        (top.children.length ? top.transform.position.value[0] : 0),
      y:
        layer.transform.position.value[1] +
        (top.children.length ? top.transform.position.value[1] : 0),
      w: Number(layer.properties.width?.value ?? 0),
      h: Number(layer.properties.height?.value ?? 0),
    }));
    const left = Math.min(...boxes.map((b) => b.x)),
      topY = Math.min(...boxes.map((b) => b.y)),
      right = Math.max(...boxes.map((b) => b.x + b.w)),
      bottom = Math.max(...boxes.map((b) => b.y + b.h));
    if (right > left && bottom > topY) {
      scale = Math.min(
        (canvas.width * 0.8) / (right - left),
        (canvas.height * 0.8) / (bottom - topY),
      );
      offset = [
        canvas.width / 2 - ((left + right) / 2) * scale,
        canvas.height / 2 - ((topY + bottom) / 2) * scale,
      ];
    }
  }
  drawComposition(
    context,
    {
      ...base,
      background,
      composition: { ...composition, layers } as RenderSource['composition'],
      currentTime: 0,
    },
    {
      width: canvas.width,
      height: canvas.height,
      pixelRatio: 1,
      matrix: [scale, 0, 0, scale, offset[0], offset[1]],
    },
    null,
    { overlays: false },
  );
}

/** I2: a static poster for a transition (two scenes mid-change). */
function drawTransitionPoster(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  item: Extract<LibraryItem, { type: 'transition' }>,
) {
  const { width: w, height: h } = canvas;
  const { from, to, poster } = item.data;
  context.fillStyle = from;
  context.fillRect(0, 0, w, h);
  context.save();
  context.fillStyle = to;
  switch (poster) {
    case 'fade':
    case 'dissolve':
      context.globalAlpha = 0.5;
      context.fillRect(0, 0, w, h);
      break;
    case 'blur':
      context.filter = 'blur(6px)';
      context.globalAlpha = 0.6;
      context.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
      break;
    case 'wipe-left':
      context.fillRect(w * 0.45, 0, w * 0.55, h);
      break;
    case 'wipe-up':
      context.fillRect(0, h * 0.45, w, h * 0.55);
      break;
    case 'wipe-circle':
      context.beginPath();
      context.arc(w / 2, h / 2, h * 0.38, 0, Math.PI * 2);
      context.fill();
      break;
    case 'push-left':
    case 'slide':
      context.fillRect(w * 0.55, 0, w * 0.45, h);
      context.fillStyle = '#ffffff55';
      context.fillRect(w * 0.52, 0, w * 0.03, h);
      break;
    case 'push-up':
      context.fillRect(0, h * 0.55, w, h * 0.45);
      break;
    case 'cartoon-pop':
    case 'cartoon-zoom': {
      context.beginPath();
      const spikes = poster === 'cartoon-pop' ? 10 : 16;
      for (let i = 0; i <= spikes * 2; i++) {
        const angle = (i / (spikes * 2)) * Math.PI * 2;
        const r = (i % 2 ? 0.22 : 0.4) * h;
        context.lineTo(
          w / 2 + Math.cos(angle) * r,
          h / 2 + Math.sin(angle) * r,
        );
      }
      context.fill();
      break;
    }
    case 'glitch':
    case 'rgb-split':
      for (let i = 0; i < 6; i++) {
        context.globalAlpha = 0.8;
        context.fillRect(
          ((i * 37) % 60) * (w / 100),
          (i * h) / 6,
          w * 0.5,
          h / 12,
        );
      }
      if (poster === 'rgb-split') {
        context.globalCompositeOperation = 'screen';
        context.fillStyle = '#ff0040';
        context.fillRect(w * 0.3, h * 0.25, w * 0.4, h * 0.5);
        context.fillStyle = '#00e0ff';
        context.fillRect(w * 0.33, h * 0.25, w * 0.4, h * 0.5);
      }
      break;
    case 'flip':
    case 'cube':
    case 'page':
      context.beginPath();
      context.moveTo(w * 0.5, h * 0.1);
      context.lineTo(w * 0.9, h * (poster === 'page' ? 0.25 : 0.2));
      context.lineTo(w * 0.9, h * (poster === 'page' ? 0.95 : 0.8));
      context.lineTo(w * 0.5, h * 0.9);
      context.closePath();
      context.fill();
      break;
  }
  context.restore();
}

/** Library previews, drawn a few per frame and kept for the session. */
function createPreviews(measureText?: TextMeasurer) {
  const cache = new Map<string, Promise<string | null>>();
  const queue: (() => void)[] = [];
  let pumping = false;
  const pump = () => {
    if (pumping) return;
    pumping = true;
    const step = () => {
      const started = performance.now();
      while (queue.length && performance.now() - started < 12) queue.shift()!();
      if (queue.length) requestAnimationFrame(step);
      else pumping = false;
    };
    requestAnimationFrame(step);
  };
  return (
    key: string,
    item: LibraryItem | { type: 'layers'; layers: unknown[] },
  ): Promise<string | null> => {
    let entry = cache.get(key);
    if (!entry) {
      entry = new Promise((resolve) => {
        queue.push(() => {
          try {
            const canvas = document.createElement('canvas');
            drawLibraryPreview(canvas, item, measureText);
            resolve(canvas.toDataURL('image/png'));
          } catch {
            resolve(null);
          }
        });
        pump();
      });
      cache.set(key, entry);
    }
    return entry;
  };
}

/** I2: the hosts the browse panels mount into. */
export interface LibraryHosts {
  Templates: HTMLElement;
  Elements: HTMLElement;
  Text: HTMLElement;
  Transitions: HTMLElement;
}
export interface LibraryBrowsers {
  /** Back to every panel's first page. */
  reset(): void;
  /** Stops drawing (a late manifest is ignored). */
  dispose(): void;
}

const later = (wave: number | string, id: string) =>
  t('toolbar.later', { wave: String(wave), id });
const TEMPLATE_RECENT = 'template';
/** A disabled Elements category tile: [key, icon, ledger, wave]. */
const PLANNED_TILES: [string, string, string, number][] = [
  ['photos', 'image', 'MED-028', 4],
  ['videos', 'media', 'MED-029', 4],
  ['3d', 'cube', 'ADV-002', 8],
  ['animations', 'animate', 'SHP-012', 5],
  ['audio', 'audio', 'AUD-013', 7],
  ['tables', 'list', 'SHP-025', 8],
  ['charts', 'properties', 'SHP-016', 8],
  ['frames', 'crop', 'MSK-003', 6],
  ['grids', 'templates', 'MSK-003', 6],
];
const SHAPE_SECTIONS = [
  'basic',
  'polygons',
  'stars',
  'arrows',
  'flowchart',
] as const;
const TEXT_SECTIONS = [
  'combinations',
  'plain',
  'styles',
  'titles',
  'two-line',
] as const;
const TRANSITION_SECTIONS = [
  'fades',
  'wipes',
  'pushes',
  'cartoon',
  'glitches',
  '3d',
] as const;

export function mountLibraryPanels(
  hosts: LibraryHosts,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
  measureText: TextMeasurer | undefined,
  actions: LibraryActions,
  options: {
    close(): void;
    addPreset(preset: ShapePreset): void;
    addTextBox(): void;
  },
): LibraryBrowsers {
  const preview = createPreviews(measureText);
  let items: readonly LibraryItem[] = [];
  let taxonomy: readonly TemplateCategory[] = [];
  let status: { kind: 'loading' | 'error'; text: string } | null = {
    kind: 'loading',
    text: t('library.loading'),
  };
  const of = <T extends LibraryItem['type']>(type: T) =>
    items.filter(
      (item): item is Extract<LibraryItem, { type: T }> => item.type === type,
    );
  const byId = (id: string) => items.find((item) => item.id === id);
  const name = (value: { en: string; hi: string }) =>
    getLanguage() === 'hi' ? value.hi : value.en;

  // --- Cards ----------------------------------------------------------------
  const libraryCard = (item: LibraryItem): BrowseCard => {
    const aspect =
      item.type === 'template' && item.data.width && item.data.height
        ? item.data.width / item.data.height
        : 16 / 9;
    const transition = item.type === 'transition';
    return {
      id: item.id,
      label: itemName(item),
      keywords: [item.name.en, item.name.hi, ...item.tags],
      preview: () => preview(item.id, item),
      aspect:
        item.type === 'template' ? Math.max(0.6, Math.min(2, aspect)) : 16 / 9,
      className: 'library-card',
      data: { itemId: item.id },
      ...(transition
        ? { disabled: later(6, item.data.planned) }
        : {
            activate: () => actions.insert(item),
            drag: { type: LIBRARY_DRAG_TYPE, data: item.id },
          }),
      ...(item.type === 'text' && item.section === 'titles'
        ? {
            // I5: the title's own entrance plays on hover.
            hover: (thumb: HTMLElement, on: boolean) => {
              thumb.dataset.preview = item.data.animation?.in?.preset ?? 'fade';
              thumb.classList.toggle('title-preview', on);
            },
          }
        : {}),
    };
  };
  const presetCard = (preset: ShapePreset): BrowseCard => ({
    id: `preset-${preset}`,
    label: t(`shape.${preset}`),
    keywords: [t(`shape.${preset}`), preset, 'shape', 'line'],
    preview: () => {
      const composition = {
        id: 'preset-preview',
        width: 1280,
        height: 720,
        fps: 30,
        duration: 10,
        layers: [],
        tracks: [],
        markers: [],
        metadata: {},
        name: 'Preview',
      } as unknown as RenderSource['composition'];
      const layer = (
        addShapeCommands(
          { composition, assets: [], background: '#ffffff' } as RenderSource,
          preset,
          0,
        ) as unknown as { type: string; layer?: unknown }[]
      ).find((command) => command.type === 'CREATE_LAYER')?.layer;
      return preview(`preset-${preset}`, {
        type: 'layers',
        layers: layer ? [layer] : [],
      });
    },
    className: 'library-card shape-preset-card',
    data: { shape: preset, itemId: `preset-${preset}` },
    activate: () => {
      options.addPreset(preset);
      recent.add('element', `preset-${preset}`);
    },
  });
  const mineCard = (template: MyTemplate): BrowseCard => ({
    id: template.id,
    label: template.name,
    keywords: [template.name, template.category],
    preview: () => template.poster ?? null,
    icon: 'templates',
    aspect: Math.max(0.6, Math.min(2, template.width / template.height)),
    className: 'library-card my-template-card',
    data: { myTemplate: template.id },
    activate: () => actions.insertMine(template),
    menu: () =>
      void confirmDialog(
        escapeHtml(t('myTemplates.deleteConfirm', { name: template.name })),
        {
          titleText: escapeHtml(t('myTemplates.deleteTitle')),
          confirmLabel: t('media.menu.delete'),
          cancelLabel: t('media.cancel'),
          danger: true,
        },
      ).then((yes) => yes && myTemplates.remove(template.id)),
  });
  const searchResults = (
    cards: readonly BrowseCard[],
    query: string,
  ): BrowseSection[] => {
    const seen = new Set<string>();
    const found = cards.filter((card) => {
      if (seen.has(card.id) || !matchesQuery(card, query)) return false;
      seen.add(card.id);
      return true;
    });
    return found.length
      ? [
          {
            id: 'results',
            title: t('browse.results'),
            layout: 'grid',
            cards: () => found,
          },
        ]
      : [];
  };
  const recentSection = (
    kind: Parameters<typeof recent.list>[0],
    cards: (id: string) => BrowseCard | undefined,
    filter: (card: BrowseCard) => boolean = () => true,
  ): BrowseSection => ({
    id: 'recent',
    title: t('browse.recent'),
    layout: 'strip',
    empty: null,
    cards: () =>
      recent
        .list(kind)
        .map(cards)
        .filter((card): card is BrowseCard => !!card && filter(card)),
  });

  // --- Templates ------------------------------------------------------------
  const allTemplates = () => [...of('template').map(libraryCard)];
  const templateCard = (id: string) => {
    const item = byId(id);
    if (item?.type === 'template') return libraryCard(item);
    const mine = myTemplates.find(id);
    return mine ? mineCard(mine) : undefined;
  };
  const inCategory = (category: string) =>
    category === 'all'
      ? of('template')
      : of('template').filter((item) => item.data.category === category);
  const noTemplates = {
    title: t('templates.empty'),
    hint: t('templates.emptyHint'),
  };
  const categoryPage = (category: TemplateCategory): BrowsePage => ({
    id: `templates-${category.id}`,
    title: name(category.name),
    search: t('library.search.template'),
    chips: category.subcategories.map((sub) => ({
      id: sub.id,
      label: name(sub.name),
      ...(sub.width && sub.height
        ? { title: `${sub.width} × ${sub.height}` }
        : {}),
    })),
    status: () => status,
    sections: ({ query, chip }) => {
      const list = inCategory(category.id).filter(
        (item) =>
          !chip || item.data.subcategory === chip || item.tags.includes(chip),
      );
      // The user's own templates saved into this category come first.
      const cards = [
        ...(chip
          ? []
          : myTemplates
              .list()
              .filter(
                (mine) =>
                  category.id === 'all' || mine.category === category.id,
              )
              .map(mineCard)),
        ...list.map(libraryCard),
      ];
      if (query) return searchResults(cards, query);
      const ids = new Set(inCategory(category.id).map((item) => item.id));
      return [
        recentSection(TEMPLATE_RECENT, templateCard, (card) =>
          ids.has(card.id),
        ),
        {
          id: 'templates',
          title: chip
            ? category.subcategories.find((sub) => sub.id === chip)
              ? name(
                  category.subcategories.find((sub) => sub.id === chip)!.name,
                )
              : ''
            : name(category.name),
          layout: 'grid',
          cards: () => cards,
          empty: noTemplates,
        },
      ];
    },
  });
  const minePage = (): BrowsePage => ({
    id: 'templates-my',
    title: t('templates.my'),
    search: t('library.search.template'),
    sections: ({ query }) => {
      const cards = myTemplates.list().map(mineCard);
      if (query) return searchResults(cards, query);
      return [
        {
          id: 'mine',
          layout: 'grid',
          cards: () => cards,
          empty: { title: t('templates.myEmpty'), hint: t('templates.myHint') },
        },
      ];
    },
  });
  const templatesRoot: BrowsePage = {
    id: 'templates',
    title: t('library.templates'),
    search: t('library.search.template'),
    status: () => status,
    sections: ({ query }) => {
      if (query)
        return searchResults(
          [...allTemplates(), ...myTemplates.list().map(mineCard)],
          query,
        );
      return [
        recentSection(TEMPLATE_RECENT, templateCard),
        ...taxonomy.map((category): BrowseSection => ({
          id: category.id,
          title: name(category.name),
          layout: 'strip',
          cards: () => inCategory(category.id).map(libraryCard),
          seeAll: () => categoryPage(category),
          empty: noTemplates,
        })),
        {
          id: 'my',
          title: t('templates.my'),
          layout: 'strip',
          cards: () => myTemplates.list().map(mineCard),
          seeAll: minePage,
          empty: { title: t('templates.myEmpty'), hint: t('templates.myHint') },
        },
      ];
    },
  };

  // --- Elements -------------------------------------------------------------
  const elementCard = (id: string) => {
    if (id.startsWith('preset-')) {
      const preset = id.slice('preset-'.length) as ShapePreset;
      return [...BASIC_PRESETS, ...LINE_PRESETS].includes(preset)
        ? presetCard(preset)
        : undefined;
    }
    const item = byId(id);
    return item ? libraryCard(item) : undefined;
  };
  const shapeCards = (section: string) =>
    of('shape')
      .filter((item) => item.section === section)
      .map(libraryCard);
  const shapesPage = (): BrowsePage => ({
    id: 'elements-shapes',
    title: t('elements.shapes'),
    search: t('library.search.shape'),
    status: () => status,
    sections: ({ query }) => {
      const all = [
        ...LINE_PRESETS.map(presetCard),
        ...BASIC_PRESETS.filter((p) => !LINE_PRESETS.includes(p)).map(
          presetCard,
        ),
        ...of('shape').map(libraryCard),
      ];
      if (query) return searchResults(all, query);
      return [
        recentSection('element', elementCard),
        {
          id: 'lines',
          title: t('elements.section.lines'),
          layout: 'grid',
          columns: 3,
          cards: () => LINE_PRESETS.map(presetCard),
        },
        ...SHAPE_SECTIONS.map((section): BrowseSection => ({
          id: section,
          title: t(`elements.section.${section}`),
          layout: 'grid',
          columns: 3,
          cards: () => [
            ...(section === 'basic'
              ? BASIC_PRESETS.filter((p) => !LINE_PRESETS.includes(p)).map(
                  presetCard,
                )
              : []),
            ...shapeCards(section),
          ],
          empty: null,
        })),
      ];
    },
  });
  const graphicsPage = (): BrowsePage => ({
    id: 'elements-graphics',
    title: t('elements.graphics'),
    search: t('library.search.background'),
    status: () => status,
    sections: ({ query }) => {
      const backgrounds = of('background');
      if (query) return searchResults(backgrounds.map(libraryCard), query);
      return [
        recentSection('graphic', elementCard),
        {
          id: 'featured',
          title: t('elements.section.featured'),
          layout: 'strip',
          cards: () =>
            backgrounds
              .filter((item) => item.tags.includes('featured'))
              .map(libraryCard),
          empty: null,
        },
        {
          id: 'gradients',
          title: t('elements.section.gradients'),
          layout: 'grid',
          cards: () =>
            backgrounds
              .filter((item) => item.section === 'gradients')
              .map(libraryCard),
        },
        {
          id: 'backgrounds',
          title: t('elements.section.backgrounds'),
          layout: 'grid',
          cards: () =>
            backgrounds
              .filter((item) => item.section === 'backgrounds')
              .map(libraryCard),
        },
      ];
    },
  });
  const elementsRoot: BrowsePage = {
    id: 'elements',
    title: t('library.elements'),
    search: t('elements.search'),
    status: () => status,
    sections: ({ query }) => {
      if (query)
        return searchResults(
          [
            ...[...BASIC_PRESETS, ...LINE_PRESETS].map(presetCard),
            ...of('shape').map(libraryCard),
            ...of('background').map(libraryCard),
          ],
          query,
        );
      return [
        {
          id: 'recent',
          title: t('browse.recent'),
          layout: 'strip',
          empty: null,
          cards: () =>
            [...recent.list('element'), ...recent.list('graphic')]
              .map(elementCard)
              .filter((card): card is BrowseCard => !!card),
        },
        {
          id: 'categories',
          title: t('elements.browse'),
          layout: 'tiles',
          columns: 3,
          cards: () => [
            {
              id: 'tile-shapes',
              label: t('elements.shapes'),
              icon: 'shape-rectangle',
              className: 'browse-tile',
              data: { tile: 'shapes' },
              activate: () => panels.Elements.push(shapesPage()),
            },
            {
              id: 'tile-graphics',
              label: t('elements.graphics'),
              icon: 'graphics',
              className: 'browse-tile',
              data: { tile: 'graphics' },
              activate: () => panels.Elements.push(graphicsPage()),
            },
            ...PLANNED_TILES.map(([key, icon, ledger, wave]): BrowseCard => ({
              id: `tile-${key}`,
              label: t(`elements.tile.${key}`),
              icon,
              className: 'browse-tile',
              data: { tile: key },
              disabled: later(wave, ledger),
            })),
          ],
        },
        {
          id: 'shapes',
          title: t('elements.shapes'),
          layout: 'strip',
          cards: () => [
            ...BASIC_PRESETS.map(presetCard),
            ...of('shape').map(libraryCard),
          ],
          seeAll: shapesPage,
        },
        {
          id: 'graphics',
          title: t('elements.graphics'),
          layout: 'strip',
          cards: () => of('background').map(libraryCard),
          seeAll: graphicsPage,
        },
      ];
    },
  };

  // --- Text -----------------------------------------------------------------
  const textCards = (section: string) =>
    of('text')
      .filter((item) => item.section === section)
      .map(libraryCard);
  const textRoot: BrowsePage = {
    id: 'text',
    title: t('library.text'),
    search: t('library.search.text'),
    status: () => status,
    sections: ({ query }) => {
      if (query) return searchResults(of('text').map(libraryCard), query);
      const textPage = (section: string): BrowsePage => ({
        id: `text-${section}`,
        title: t(`text.section.${section}`),
        search: t('library.search.text'),
        sections: ({ query: inner }) =>
          inner
            ? searchResults(textCards(section), inner)
            : [
                {
                  id: section,
                  layout: 'grid',
                  cards: () =>
                    section === 'styles'
                      ? of('text').map(libraryCard)
                      : textCards(section),
                },
              ],
      });
      return [
        {
          id: 'actions',
          layout: 'list',
          render: (host) => {
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'button primary browse-primary';
            add.id = 'add-text-box';
            add.textContent = t('text.addBox');
            add.onclick = () => options.addTextBox();
            const magic = document.createElement('button');
            magic.type = 'button';
            magic.className = 'button browse-secondary';
            magic.dataset.action = 'magic-write';
            magic.setAttribute('aria-disabled', 'true');
            magic.title = later(10, 'AI-001');
            magic.textContent = t('text.magicWrite');
            host.append(add, magic);
          },
        },
        {
          id: 'default',
          title: t('text.section.default'),
          layout: 'list',
          cards: () => textCards('default'),
        },
        {
          id: 'dynamic',
          title: t('text.section.dynamic'),
          layout: 'list',
          cards: () => [
            {
              id: 'dynamic-text',
              label: t('text.dynamic'),
              icon: 'text',
              disabled: later(8, 'TXT-037'),
              data: { action: 'dynamic-text' },
            },
          ],
        },
        ...TEXT_SECTIONS.map((section): BrowseSection => ({
          id: section,
          title: t(`text.section.${section}`),
          layout: 'strip',
          cards: () => textCards(section),
          seeAll: () => textPage(section),
          empty: null,
        })),
        {
          id: 'captions',
          title: t('text.section.captions'),
          layout: 'list',
          cards: () => [
            {
              id: 'captions',
              label: t('text.captions'),
              icon: 'captions',
              disabled: later(8, 'TXT-035'),
              data: { action: 'captions' },
            },
          ],
        },
      ];
    },
  };

  // --- Transitions ----------------------------------------------------------
  const transitionsRoot: BrowsePage = {
    id: 'transitions',
    title: t('library.transitions'),
    search: t('transitions.search'),
    status: () => status,
    sections: ({ query }) => {
      const all = of('transition');
      if (query) return searchResults(all.map(libraryCard), query);
      return [
        {
          id: 'tip',
          layout: 'list',
          render: (host) => {
            const tip = document.createElement('div');
            tip.className = 'browse-tip';
            tip.innerHTML = iconSvg('info', 16);
            const text = document.createElement('p');
            text.textContent = t('transitions.tip');
            tip.append(text);
            // J3: the shared NumberField, disabled until transitions work.
            const duration = createNumberField({
              id: 'transition-duration',
              label: t('transitions.duration'),
              value: 1,
              unit: 's',
              min: 0.1,
              max: 5,
              step: 0.1,
              decimals: 1,
              disabled: true,
              className: 'browse-duration',
              onCommit: () => undefined,
            });
            duration.title = later(6, 'TR-002');
            host.append(tip, duration);
          },
        },
        ...TRANSITION_SECTIONS.map((section): BrowseSection => ({
          id: section,
          title: t(`transitions.section.${section}`),
          layout: 'grid',
          cards: () =>
            all.filter((item) => item.section === section).map(libraryCard),
          empty: null,
        })),
      ];
    },
  };

  const panels = {
    Templates: createBrowsePanel(hosts.Templates, templatesRoot, {
      id: 'templates',
      close: options.close,
    }),
    Elements: createBrowsePanel(hosts.Elements, elementsRoot, {
      id: 'elements',
      close: options.close,
    }),
    Text: createBrowsePanel(hosts.Text, textRoot, {
      id: 'text',
      close: options.close,
    }),
    Transitions: createBrowsePanel(hosts.Transitions, transitionsRoot, {
      id: 'transitions',
      close: options.close,
    }),
  };
  // The manifest can arrive after the shell is gone (a closed page or a
  // finished test); nothing is drawn then.
  let disposed = false;
  const refreshAll = () => {
    if (disposed) return;
    Object.values(panels).forEach((panel) => panel.refresh());
  };
  recent.onChange(refreshAll);
  myTemplates.onChange(() => panels.Templates.refresh());
  loadLibrary().then(
    (manifest) => {
      items = manifest.items;
      taxonomy = manifest.templates ?? [];
      status = null;
      actions.setItems(items);
      refreshAll();
    },
    (error: unknown) => {
      status = {
        kind: 'error',
        text: t('library.loadFailed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      };
      refreshAll();
    },
  );
  void engine;
  void session;
  void report;
  return {
    reset: () => Object.values(panels).forEach((panel) => panel.reset()),
    dispose: () => {
      disposed = true;
    },
  };
}
