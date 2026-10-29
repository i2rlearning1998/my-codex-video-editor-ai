// FIX7: filters, effects, colour adjustments and transitions the owner
// publishes. Each is a recipe over the FX library's own items (a few steps,
// each an fx id with settings), so the editor needs no new engine: a library
// filter is a tile that applies its steps, a library effect toggles its
// steps, a library transition is a built-in transition type with settings.
// What a clip stores are the built-in ids and settings only (plus a short
// marker to find the tile again), so a saved project plays and exports
// without the library.
import {
  adjustments,
  defaults as fxDefaults,
  effects,
  filters,
  getItem,
  transitions,
} from '../fx';
import {
  controlValues,
  resolveRecipe,
  type CreatorItem,
  type ResolvedStep,
} from '../creator-pack';

export const FX_IDS: readonly string[] = [
  ...filters,
  ...effects,
  ...adjustments,
  ...transitions,
].map((item) => item.id);

type Value = number | boolean | string;
export interface LibraryFx {
  /** A short, stable marker kept in a clip's settings (max 12 characters). */
  readonly marker: string;
  readonly id: string;
  readonly label: string;
  readonly kind: 'filter' | 'effect' | 'transition';
  readonly steps: readonly { id: string; params: Record<string, Value> }[];
}
export const FX_KINDS = ['adjust', 'filter', 'effect', 'transition'] as const;

/** A short marker from an item id (clip settings allow 64 characters). */
export function markerOf(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `L${h.toString(36)}`;
}

/** The steps of a recipe-style FX item, or null when it is not one. */
export function fxSteps(item: CreatorItem): ResolvedStep[] | null {
  if (!(FX_KINDS as readonly string[]).includes(item.type)) return null;
  const data = (item as { data: unknown }).data as Record<string, unknown>;
  const controls = ((item as { controls?: unknown }).controls ??
    []) as Parameters<typeof controlValues>[0];
  if (data.mode === 'recipe') return resolveRecipe(data, FX_IDS, controls);
  if (item.type === 'adjust' && data.values) {
    const values = controlValues(controls);
    return Object.entries(data.values as Record<string, unknown>).map(
      ([key, raw]) => {
        const amount =
          raw && typeof raw === 'object' && '$param' in raw
            ? values[(raw as { $param: string }).$param]
            : raw;
        if (!FX_IDS.includes(`adjust.${key}`))
          throw new Error(`Unknown fx id adjust.${key}.`);
        return { fx: `adjust.${key}`, params: { amount } };
      },
    );
  }
  return null;
}

/** Resolved, with each step's library defaults filled in. */
export function toLibraryFx(
  id: string,
  label: string,
  item: CreatorItem,
): LibraryFx | null {
  let steps: ResolvedStep[] | null;
  try {
    steps = fxSteps(item);
  } catch {
    return null;
  }
  if (!steps?.length) return null;
  const full: LibraryFx['steps'][number][] = [];
  for (const step of steps) {
    const definition = getItem(step.fx);
    if (!definition) return null;
    full.push({
      id: step.fx,
      params: {
        ...fxDefaults(definition),
        ...(step.params as Record<string, Value>),
      },
    });
  }
  const kind =
    item.type === 'transition'
      ? 'transition'
      : item.type === 'effect'
        ? 'effect'
        : 'filter';
  if (kind === 'transition' && !/^transition\.[a-z0-9-]+$/.test(full[0]!.id))
    return null;
  return { marker: markerOf(id), id, label, kind, steps: full };
}

class Registry {
  #items: LibraryFx[] = [];
  readonly #listeners = new Set<() => void>();
  set(next: readonly LibraryFx[]) {
    this.#items = [...next];
    for (const listener of [...this.#listeners]) listener();
  }
  onChange(listener: () => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  all() {
    return this.#items;
  }
  filters() {
    return this.#items.filter((item) => item.kind === 'filter');
  }
  effects() {
    return this.#items.filter((item) => item.kind === 'effect');
  }
  transitions() {
    return this.#items.filter((item) => item.kind === 'transition');
  }
  byMarker(marker: unknown) {
    return this.#items.find((item) => item.marker === marker);
  }
}
export const libraryFx = new Registry();

/** Feeds the registry from the library's entries (kinds that are FX). */
export function syncLibraryFx(
  entries: readonly { key: string; item: CreatorItem; name: string }[],
): void {
  const out: LibraryFx[] = [];
  for (const entry of entries) {
    const made = toLibraryFx(entry.key, entry.name, entry.item);
    if (made) out.push(made);
  }
  libraryFx.set(out);
}
