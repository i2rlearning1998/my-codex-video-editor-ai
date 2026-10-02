// H5: the library in the left panel. Templates, Elements (shapes), Text
// (styles) and Graphics (backgrounds) list Starter Pack 1 with a search box
// and drawn previews; a click adds the item through the Command Bus.
import type { EditorEngine } from '../core';
import { formatNumber, t } from '../i18n';
import { loadLibrary } from '../library/loader';
import type { LibraryItem, LibraryItemType } from '../library/schema';
import type { RenderSource } from '../render/adapter';
import type { TextMeasurer } from '../render/text-layout';
import { drawComposition } from '../render/canvas';
import { iconSvg } from './icons';
import { itemName, libraryCommands } from './library-insert';
import type { EditorSession } from './session';

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
  item: LibraryItem,
  measureText?: TextMeasurer,
) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(THUMB.width * ratio);
  canvas.height = Math.round(THUMB.height * ratio);
  const context = canvas.getContext('2d');
  if (!context) return;
  const composition = previewComposition();
  const base: RenderSource = {
    composition,
    assets: [],
    background: '#ffffff',
    ...(measureText ? { measureText } : {}),
  };
  const insert = libraryCommands(
    { compositions: [composition] },
    base,
    item,
    0,
  );
  let layers: unknown[] = [];
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
  if (item.type === 'shape' || item.type === 'text') {
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

const TYPES: Record<string, LibraryItemType> = {
  Templates: 'template',
  Elements: 'shape',
  Text: 'text',
  Graphics: 'background',
};

export function mountLibraryPanels(
  hosts: Record<keyof typeof TYPES, HTMLElement>,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
  measureText?: TextMeasurer,
) {
  const panels = Object.entries(hosts).map(([category, host]) => {
    const type = TYPES[category]!;
    host.classList.add('library-panel');
    host.dataset.library = type;
    const heading = document.createElement('h3');
    heading.className = 'library-heading';
    heading.textContent = t(`library.section.${type}`);
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'library-search-input';
    search.id = `library-search-${type}`;
    search.placeholder = t('library.searchPlaceholder');
    search.setAttribute('aria-label', t(`library.search.${type}`));
    const status = document.createElement('p');
    status.className = 'library-status';
    status.setAttribute('role', 'status');
    const grid = document.createElement('div');
    grid.className = `library-grid library-grid-${type}`;
    host.append(heading, search, status, grid);
    return { type, host, search, status, grid };
  });
  let items: readonly LibraryItem[] = [];
  const add = (item: LibraryItem) => {
    try {
      session.setPlaying(false);
      const insert = libraryCommands(
        engine.state,
        session.source,
        item,
        session.currentTime,
      );
      engine.commands.transaction(insert.label, insert.commands);
      if (insert.sceneId) session.selectComposition(insert.sceneId);
      else if (insert.layerId) session.select(insert.layerId);
    } catch (error) {
      report(error);
    }
  };
  // Previews are drawn a few at a time so the panel opens at once.
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
  const lazy = new WeakMap<Element, () => void>();
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          for (const entry of entries)
            if (entry.isIntersecting) {
              observer!.unobserve(entry.target);
              lazy.get(entry.target)?.();
              lazy.delete(entry.target);
            }
        });
  const render = (panel: (typeof panels)[number]) => {
    const query = panel.search.value.trim().toLowerCase();
    const list = items.filter(
      (item) =>
        item.type === panel.type &&
        (!query ||
          item.name.en.toLowerCase().includes(query) ||
          item.name.hi.includes(query) ||
          item.tags.some((tag) => tag.includes(query))),
    );
    panel.status.hidden = list.length > 0;
    panel.status.textContent = list.length
      ? ''
      : t('library.noResults', { query: panel.search.value.trim() });
    panel.grid.setAttribute(
      'aria-label',
      t('library.count', { count: formatNumber(list.length) }),
    );
    panel.grid.replaceChildren(
      ...list.map((item) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'library-card';
        card.dataset.itemId = item.id;
        const name = itemName(item);
        card.title = name;
        card.setAttribute('aria-label', name);
        // Drawn on a detached canvas and shown as an image, so the page keeps
        // one <canvas> (the composition).
        const thumb = document.createElement('img');
        thumb.className = 'library-thumb';
        thumb.alt = '';
        thumb.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = name;
        card.append(thumb, label);
        card.onclick = () => add(item);
        // Drawn when the card first scrolls into view.
        const draw = () =>
          queue.push(() => {
            try {
              const canvas = document.createElement('canvas');
              drawLibraryPreview(canvas, item, measureText);
              thumb.src = canvas.toDataURL('image/png');
            } catch {
              // A preview that cannot be drawn leaves the card's label.
            }
          });
        if (observer) {
          lazy.set(card, () => {
            draw();
            pump();
          });
          observer.observe(card);
        } else draw();
        return card;
      }),
    );
    pump();
  };
  for (const panel of panels) {
    panel.status.textContent = t('library.loading');
    panel.status.classList.add('loading');
    panel.search.oninput = () => render(panel);
  }
  loadLibrary().then(
    (manifest) => {
      items = manifest.items;
      for (const panel of panels) {
        panel.status.classList.remove('loading');
        render(panel);
      }
    },
    (error: unknown) => {
      for (const panel of panels) {
        panel.status.classList.remove('loading');
        panel.status.classList.add('error');
        panel.status.innerHTML = `${iconSvg('warning', 16)}<span></span>`;
        panel.status.querySelector('span')!.textContent = t(
          'library.loadFailed',
          { error: error instanceof Error ? error.message : String(error) },
        );
      }
    },
  );
}
