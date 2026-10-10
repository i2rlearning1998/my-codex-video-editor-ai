// V4 (Clipchamp clone spec 5): the Filters and Effects panels as tile grids.
// Three columns, a sticky search box, a None tile first; each tile shows the
// selection's own picture (or text or shape on black) through the real FX
// library, drawn lazily (visible tiles only), cached and queued one job per
// frame. Hovering a tile animates its thumbnail (time-based effects), never
// the canvas; a click applies it. The settings of the selected (or last
// clicked) tile open inline under its row.
//
// Filters are preset bundles over the library (most are one library filter,
// a few combine a filter and colour adjustments); every entry of a bundle
// carries `preset` (the tile's key) so the panel can find the tile again,
// and the Intensity slider sets the bundle's `intensity`. Effects map the
// Clipchamp names to the library's effects; the library's extra items are
// listed under More.
import {
  defaults as fxDefaults,
  getEffect,
  getItem,
  renderStack,
  sanitize,
  type Param,
  type Params,
  type Surface,
} from '../../fx';
import type { ClipFx } from '../../core';
import { MAX_FX_STACK } from '../../core';
import { t } from '../../i18n';
import { createNumberField } from '../components/number-field';
import { createSelect } from '../components/select';
import { iconSvg } from '../icons';

type Entry = { id: string; params: Record<string, number | boolean | string> };

/** One Clipchamp filter: its tile key and the library entries it applies. */
export interface FilterPreset {
  readonly key: string;
  readonly stack: readonly {
    readonly id: string;
    readonly params?: Readonly<Record<string, number>>;
  }[];
}
const one = (key: string, id = `filter.${key}`): FilterPreset => ({
  key,
  stack: [{ id }],
});
/** Spec 5's filter names, in its order (49 named tiles plus None). */
export const FILTER_PRESETS: readonly FilterPreset[] = [
  one('retro'),
  one('orange-teal'),
  one('bold-blue'),
  one('golden-hour'),
  one('vibrant-vlogger'),
  one('purple-undertone'),
  one('winter-sunset'),
  one('35mm'),
  one('contrast'),
  one('fall'),
  one('winter'),
  one('old-western'),
  one('warm-coastline'),
  one('cool-coastline'),
  one('warm-countryside'),
  one('cool-countryside'),
  one('golden'),
  one('dreamscape'),
  one('sunrise'),
  one('warm-tone-film', 'filter.warm-tone'),
  one('cool-tone'),
  one('pastel-dreams'),
  {
    key: 'increased',
    stack: [
      { id: 'adjust.contrast', params: { amount: 0.35 } },
      { id: 'adjust.saturation', params: { amount: 0.45 } },
    ],
  },
  one('scenery'),
  one('portrait'),
  one('indoors'),
  one('outdoors'),
  one('muted'),
  one('black-white-1', 'filter.black-white'),
  {
    key: 'black-white-2',
    stack: [
      { id: 'filter.black-white' },
      { id: 'adjust.contrast', params: { amount: 0.5 } },
    ],
  },
  one('soft-bw'),
  one('muted-bw'),
  one('gloomy'),
  one('deep-fried'),
  one('euphoric'),
  one('duotone-yellow-orange'),
  one('duotone-pink-purple'),
  one('duotone-blue-pink'),
  one('duotone-green-blue'),
  one('overlay-white'),
  one('overlay-black'),
  one('overlay-yellow'),
  one('overlay-orange'),
  one('overlay-red'),
  one('overlay-pink'),
  one('overlay-purple'),
  one('overlay-blue'),
  {
    key: 'overlay-turquoise',
    stack: [{ id: 'filter.overlay-blue' }, { id: 'filter.overlay-green' }],
  },
  one('overlay-green'),
];

/** Spec 5's effect names mapped to the library (Background removal is not
 *  built and has no tile; Pixelation is the library's extra, under More). */
export const EFFECT_TILES: readonly {
  readonly id: string;
  /** Pictures only (not text or shapes). */
  readonly pictures?: boolean;
  readonly more?: boolean;
}[] = [
  { id: 'effect.flash' },
  { id: 'effect.pulse' },
  { id: 'effect.spin', pictures: true },
  { id: 'effect.vhs' },
  { id: 'effect.rotate', pictures: true },
  { id: 'effect.vaporwave' },
  { id: 'effect.chromatic-aberration' },
  { id: 'effect.crash-zoom' },
  { id: 'effect.slow-zoom' },
  { id: 'effect.slow-zoom-random' },
  { id: 'effect.green-screen' },
  { id: 'effect.black-white-removal' },
  { id: 'effect.blur' },
  { id: 'effect.blur-fill' },
  { id: 'effect.filmic' },
  { id: 'effect.glitch' },
  { id: 'effect.disco' },
  { id: 'effect.color-shift' },
  { id: 'effect.glass' },
  { id: 'effect.comic' },
  { id: 'effect.retro-graphics' },
  { id: 'effect.vertical' },
  { id: 'effect.radial' },
  { id: 'effect.smoke' },
  { id: 'effect.kaleidoscope' },
  { id: 'effect.glow' },
  { id: 'effect.diffusion' },
  { id: 'effect.pixelation', more: true },
];

/** The library entries a filter preset applies, at an intensity (0 to 1). */
export function presetEntries(preset: FilterPreset, intensity: number) {
  return preset.stack.map((item): Entry => {
    const definition = getItem(item.id)!;
    return {
      id: item.id,
      params: {
        ...fxDefaults(definition),
        ...item.params,
        intensity,
        preset: preset.key,
      },
    };
  });
}
/** The filter preset in a stack (by its marker; an older single library
 *  filter is matched by its id), and its intensity. */
export function activePreset(fx: ClipFx | null) {
  const stack = fx?.stack ?? [];
  const marked = stack.find((item) => typeof item.params.preset === 'string');
  if (marked) {
    const preset = FILTER_PRESETS.find(
      (item) => item.key === marked.params.preset,
    );
    if (preset)
      return { preset, intensity: Number(marked.params.intensity ?? 1) };
  }
  const plain = stack.find((item) => item.id.startsWith('filter.'));
  if (!plain) return null;
  const preset = FILTER_PRESETS.find(
    (item) => item.stack.length === 1 && item.stack[0]!.id === plain.id,
  );
  return preset
    ? { preset, intensity: Number(plain.params.intensity ?? 1) }
    : null;
}
/** Entries that belong to a filter (a preset's or an older plain filter). */
export const isFilterEntry = (item: {
  id: string;
  params: Readonly<Record<string, unknown>>;
}) => typeof item.params.preset === 'string' || item.id.startsWith('filter.');

// --- Thumbnails ------------------------------------------------------------------
const THUMB_W = 160,
  THUMB_H = 90;
const cache = new Map<string, string>();
const remember = (key: string, url: string) => {
  cache.set(key, url);
  if (cache.size > 600) cache.delete(cache.keys().next().value!);
};
/** One job per frame (spec 5). */
const queue: (() => void)[] = [];
let pumping = false;
const pump = () => {
  const job = queue.shift();
  if (!job) {
    pumping = false;
    return;
  }
  try {
    job();
  } finally {
    requestAnimationFrame(pump);
  }
};
const enqueue = (job: () => void) => {
  queue.push(job);
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
};

/** The source picture once per panel render, with a key for the cache. */
export interface TileSource {
  readonly surface: Surface | null;
  readonly key: string;
}
export function tileSource(canvas: HTMLCanvasElement | null): TileSource {
  if (!canvas) return { surface: null, key: 'none' };
  const data = canvas
    .getContext('2d', { willReadFrequently: true })!
    .getImageData(0, 0, canvas.width, canvas.height).data;
  // A cheap content hash: the tiles of the same picture are reused.
  let hash = 2166136261;
  for (let i = 0; i < data.length; i += 97)
    hash = Math.imul(hash ^ data[i]!, 16777619);
  return {
    surface: { width: canvas.width, height: canvas.height, data },
    key: `${canvas.width}x${canvas.height}:${hash >>> 0}`,
  };
}
const scratch = () => {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  return canvas;
};
let drawCanvas: HTMLCanvasElement | null = null;
/** The stack drawn on the source at a time, as a data URL. */
function drawThumb(source: Surface, stack: readonly Entry[], time: number) {
  const ready = stack.flatMap((entry) => {
    const definition = getItem(entry.id);
    return definition && definition.kind !== 'transition'
      ? [{ id: entry.id, params: sanitize(definition.params, entry.params) }]
      : [];
  });
  const out = renderStack(source, ready, {
    time,
    duration: 3,
    seed: 7,
    width: source.width,
    height: source.height,
  });
  drawCanvas ??= scratch();
  drawCanvas
    .getContext('2d')!
    .putImageData(
      new ImageData(
        out.data as Uint8ClampedArray<ArrayBuffer>,
        out.width,
        out.height,
      ),
      0,
      0,
    );
  return drawCanvas.toDataURL('image/png');
}

// --- The tile grid ---------------------------------------------------------------
export interface Tile {
  readonly key: string;
  readonly label: string;
  /** The entries the thumbnail shows (empty: the plain picture). */
  readonly stack: readonly Entry[];
  /** Hovering loops the thumbnail through time. */
  readonly animated?: boolean;
  /** A small slider badge (a selected tile with settings). */
  readonly badge?: boolean;
  readonly group?: string | undefined;
}
export interface TileGridOptions {
  readonly name: string;
  readonly search: string;
  readonly tiles: readonly Tile[];
  readonly source: TileSource;
  readonly selected: (key: string) => boolean;
  readonly onClick: (key: string) => void;
  /** The settings shown under the row of this tile, if any. */
  readonly settingsFor: string | null;
  readonly settings: () => HTMLElement | null;
  readonly query: { value: string };
}
let observer: IntersectionObserver | null = null;
const pending = new WeakMap<Element, () => void>();
const observe = (element: Element, job: () => void) => {
  if (typeof IntersectionObserver === 'undefined') {
    enqueue(job);
    return;
  }
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer!.unobserve(entry.target);
      const run = pending.get(entry.target);
      pending.delete(entry.target);
      if (run) enqueue(run);
    }
  });
  pending.set(element, job);
  observer.observe(element);
};

export function tileGrid(options: TileGridOptions): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'fx-tiles';
  wrap.dataset.panel = options.name;
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'fx-tiles-search';
  search.placeholder = options.search;
  search.setAttribute('aria-label', options.search);
  search.value = options.query.value;
  const grid = document.createElement('div');
  grid.className = 'fx-tiles-grid';
  grid.setAttribute('role', 'listbox');
  grid.setAttribute('aria-label', options.name);
  const draw = () => {
    const query = search.value.trim().toLowerCase();
    options.query.value = search.value;
    const shown = options.tiles.filter(
      (tile) => !query || tile.label.toLowerCase().includes(query),
    );
    const items: HTMLElement[] = [];
    let group: string | undefined;
    for (const tile of shown) {
      if (tile.group && tile.group !== group) {
        group = tile.group;
        const title = document.createElement('h4');
        title.className = 'fx-tiles-group';
        title.textContent = group;
        items.push(title);
      }
      items.push(tileElement(tile, options));
    }
    // The settings go under the row of their tile (rows of three, counted
    // from the group title before it).
    const settings = options.settingsFor ? options.settings() : null;
    if (settings) {
      settings.classList.add('fx-tiles-settings');
      const at = items.findIndex(
        (item) => item.dataset.tile === options.settingsFor,
      );
      if (at >= 0) {
        let start = at;
        while (start > 0 && items[start - 1]!.dataset.tile) start--;
        const column = (at - start) % 3;
        let end = at + (2 - column);
        for (let i = at + 1; i <= end; i++)
          if (!items[i]?.dataset.tile) {
            end = i - 1;
            break;
          }
        items.splice(Math.min(end, items.length - 1) + 1, 0, settings);
      } else items.push(settings);
    }
    grid.replaceChildren(...items);
  };
  search.addEventListener('input', draw);
  draw();
  wrap.append(search, grid);
  return wrap;
}

function tileElement(tile: Tile, options: TileGridOptions) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'fx-tile';
  item.dataset.tile = tile.key;
  item.setAttribute('role', 'option');
  const selected = options.selected(tile.key);
  item.setAttribute('aria-selected', String(selected));
  item.title = tile.label;
  const thumb = document.createElement('span');
  thumb.className = 'fx-tile-thumb';
  const label = document.createElement('span');
  label.className = 'fx-tile-label';
  label.textContent = tile.label;
  item.append(thumb, label);
  if (tile.key === 'none') {
    thumb.classList.add('fx-tile-none');
    thumb.innerHTML = iconSvg('ban', 28);
  } else {
    if (tile.badge && selected) {
      const badge = document.createElement('span');
      badge.className = 'fx-tile-badge';
      badge.innerHTML = iconSvg('adjust', 12);
      thumb.append(badge);
    }
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    thumb.append(image);
    const source = options.source.surface;
    const key = `${options.source.key}|${tile.key}`;
    const done = cache.get(key);
    if (done) image.src = done;
    else if (source) {
      thumb.classList.add('fx-tile-loading');
      observe(item, () => {
        // Late in the 3 s sample, where build-up effects (zooms) show.
        const url = drawThumb(source, tile.stack, 2.4);
        remember(key, url);
        image.src = url;
        thumb.classList.remove('fx-tile-loading');
      });
    }
    // Hover: the thumbnail loops about 1.2 s at 12.5 frames a second
    // through the same renderer; the canvas does not change.
    if (tile.animated && source) {
      let timer = 0;
      let frame = 0;
      item.addEventListener('pointerenter', () => {
        window.clearInterval(timer);
        frame = 0;
        item.dataset.hovering = 'true';
        timer = window.setInterval(() => {
          if (!item.isConnected) {
            window.clearInterval(timer);
            return;
          }
          frame = (frame + 1) % 15;
          image.src = drawThumb(source, tile.stack, frame * 0.08);
        }, 80);
      });
      item.addEventListener('pointerleave', () => {
        window.clearInterval(timer);
        delete item.dataset.hovering;
        const still = cache.get(key);
        if (still) image.src = still;
      });
    }
  }
  item.addEventListener('click', () => options.onClick(tile.key));
  return item;
}

// --- Settings ------------------------------------------------------------------------
/** The Intensity slider of the selected filter (spec 5: no number box). */
export function intensitySlider(
  value: number,
  onCommit: (value: number) => void,
) {
  const block = document.createElement('div');
  const label = document.createElement('label');
  label.className = 'fx-setting-label';
  label.htmlFor = 'right-filter-intensity';
  label.textContent = t('fx.intensity');
  const range = document.createElement('input');
  range.type = 'range';
  range.id = 'right-filter-intensity';
  range.className = 'fx-slider';
  range.min = '0';
  range.max = '100';
  range.step = '1';
  range.value = String(Math.round(value * 100));
  const paint = () =>
    range.style.setProperty('--fill', `${Number(range.value)}%`);
  paint();
  range.addEventListener('input', paint);
  range.addEventListener('change', () => onCommit(Number(range.value) / 100));
  block.append(label, range);
  return block;
}

/** An effect's own controls, from the library's parameter list. */
export function effectSettings(
  id: string,
  params: Params,
  onCommit: (name: string, value: number | boolean | string) => void,
) {
  const block = document.createElement('div');
  const definition = getEffect(id);
  if (!definition) return block;
  const title = document.createElement('p');
  title.className = 'fx-setting-title';
  title.textContent = t(`fx.${id}`);
  block.append(title);
  for (const param of definition.params) block.append(control(id, param));
  return block;

  function control(effect: string, param: Param): HTMLElement {
    const fieldId = `right-fx-${effect.replace('.', '-')}-${param.name}`;
    const label = t(`fx.param.${param.name}`);
    const value = params[param.name] ?? param.default;
    if (param.type === 'boolean') {
      const row = document.createElement('label');
      row.className = 'fx-setting-check';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = fieldId;
      box.checked = value === true;
      box.addEventListener('change', () => onCommit(param.name, box.checked));
      const text = document.createElement('span');
      text.textContent = label;
      row.append(box, text);
      return row;
    }
    if (param.type === 'select')
      return createSelect({
        id: fieldId,
        label,
        value: String(value),
        options: (param.options ?? []).map((option) => ({
          value: option,
          label: t(`fx.option.${option}`),
        })),
        onChange: (next) => onCommit(param.name, next),
      });
    if (param.type === 'color') {
      const row = document.createElement('label');
      row.className = 'fx-setting-check';
      const input = document.createElement('input');
      input.type = 'color';
      input.id = fieldId;
      input.value = String(value);
      input.addEventListener('change', () => onCommit(param.name, input.value));
      const text = document.createElement('span');
      text.textContent = label;
      row.append(text, input);
      return row;
    }
    // Intensity reads as a percentage; other numbers keep their units.
    const percent = param.name === 'intensity' || param.max <= 1;
    const scale = percent ? 100 : 1;
    return createNumberField({
      id: fieldId,
      label,
      value: Math.round(Number(value) * scale * 100) / 100,
      unit: percent ? '%' : '',
      min: param.min * scale,
      max: param.max * scale,
      decimals: percent || param.max - param.min > 20 ? 0 : 2,
      slider: true,
      className: 'right-row',
      onCommit: (next) => onCommit(param.name, next / scale),
    });
  }
}

/** Effects selected in a stack. */
export const selectedEffects = (fx: ClipFx | null) =>
  new Set(
    (fx?.stack ?? [])
      .filter((item) => item.id.startsWith('effect.'))
      .map((item) => item.id),
  );
/** Adds or removes an effect (at most MAX_FX_STACK entries). */
export function toggleEffect(next: ClipFx, id: string) {
  const at = next.stack.findIndex((item) => item.id === id);
  if (at >= 0) next.stack.splice(at, 1);
  else if (next.stack.length < MAX_FX_STACK)
    next.stack.push({ id, params: fxDefaults(getEffect(id)!) });
}
/** Applies a filter preset (or none) in place of the current filter. */
export function applyPreset(
  next: ClipFx,
  key: string,
  intensity: number,
): void {
  next.stack = next.stack.filter((item) => !isFilterEntry(item));
  const preset = FILTER_PRESETS.find((item) => item.key === key);
  if (!preset) return;
  // Colour first, so later effects (zooms, blurs) work on the graded picture.
  next.stack.unshift(...presetEntries(preset, intensity));
  next.stack.splice(MAX_FX_STACK);
}
