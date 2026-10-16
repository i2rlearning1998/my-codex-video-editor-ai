// R5: My Templates, the user's own library (a left-rail category). Saved
// elements (one layer or several, with their keyframes, controls and clip
// settings) and whole scenes live in this browser's media store (OPFS,
// IndexedDB fallback) as one index file, never in a project and never on the
// Undo stack. Inserting an element gives the project its own copy (new ids,
// keyframes moved to the playhead), so renaming, moving or deleting a saved
// item never touches layers already placed.
import type { Asset, Command, Composition, DeepReadonly, Layer } from '../core';
import type { MediaStore } from '../media/store';
import { cloneLayer, trackForNewClip } from './editing';
import type { MyTemplate } from './my-templates';

const INDEX_KEY = 'mine/index.json';

/** The kinds a saved item can be (tabs appear only for kinds in use). */
export const MINE_KINDS = [
  'shape',
  'text',
  'background',
  'animation',
  'video',
  'image',
  'annotation',
  'sticker',
  'group',
  'scene',
] as const;
export type MineKind = (typeof MINE_KINDS)[number];
/** The kinds offered by Save to My Templates for a single layer. */
export const SAVE_KINDS: readonly MineKind[] = [
  'shape',
  'text',
  'background',
  'animation',
  'video',
  'image',
  'annotation',
  'sticker',
];

export interface MineClip {
  readonly layerId: string;
  readonly startTime: number;
  readonly duration: number;
  readonly sourceIn?: number;
  readonly sourceOut?: number;
  readonly speed?: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}
export interface MineItem {
  readonly id: string;
  readonly name: string;
  readonly kind: MineKind;
  readonly createdAt: string;
  /** A PNG data URL. */
  readonly poster?: string;
  /** Elements: the top-level layers and their clips. */
  readonly layers?: readonly Layer[];
  readonly clips?: readonly MineClip[];
  /** The earliest start of the saved layers (keyframes move from here). */
  readonly origin?: number;
  readonly assets?: readonly Asset[];
  /** A whole scene (kind scene). */
  readonly scene?: MyTemplate;
}

export class MyLibrary {
  #items: MineItem[] = [];
  readonly #listeners = new Set<() => void>();
  readonly ready: Promise<void>;
  #write: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: Promise<MediaStore | null>,
    /** Old scene templates (localStorage) moved in once. */
    legacy?: () => { list: readonly MyTemplate[]; clear(): void },
  ) {
    this.ready = this.#load(legacy);
  }
  async #load(legacy?: () => { list: readonly MyTemplate[]; clear(): void }) {
    try {
      const blob = await (await this.store)?.read(INDEX_KEY);
      const parsed = blob ? (JSON.parse(await blob.text()) as unknown) : null;
      if (Array.isArray(parsed)) this.#items = parsed as MineItem[];
    } catch {
      this.#items = [];
    }
    const old = legacy?.();
    if (old?.list.length) {
      const known = new Set(this.#items.map((item) => item.id));
      this.#items = [
        ...this.#items,
        ...old.list
          .filter((template) => !known.has(template.id))
          .map((template): MineItem => ({
            id: template.id,
            name: template.name,
            kind: 'scene',
            createdAt: template.createdAt,
            ...(template.poster ? { poster: template.poster } : {}),
            scene: template,
          })),
      ];
      try {
        await this.#save();
        old.clear();
      } catch {
        // Kept where they were; the move is tried again next time.
      }
    }
    this.#emit();
  }
  #save(): Promise<void> {
    const text = JSON.stringify(this.#items);
    this.#write = this.#write.then(async () => {
      const store = await this.store;
      if (!store) throw new Error('My Templates storage is not available');
      await store.write(
        INDEX_KEY,
        new Blob([text], { type: 'application/json' }),
      );
    });
    return this.#write;
  }
  #emit() {
    for (const listener of [...this.#listeners]) listener();
  }
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  list(): readonly MineItem[] {
    return this.#items;
  }
  find(id: string): MineItem | undefined {
    return this.#items.find((item) => item.id === id);
  }
  async add(item: MineItem) {
    this.#items = [
      item,
      ...this.#items.filter((entry) => entry.id !== item.id),
    ];
    this.#emit();
    await this.#save();
  }
  async rename(id: string, name: string) {
    this.#items = this.#items.map((item) =>
      item.id === id
        ? {
            ...item,
            name,
            ...(item.scene ? { scene: { ...item.scene, name } } : {}),
          }
        : item,
    );
    this.#emit();
    await this.#save();
  }
  async remove(id: string) {
    this.#items = this.#items.filter((item) => item.id !== id);
    this.#emit();
    await this.#save();
  }
}

/** Every keyframe and the layer's own times moved by `delta` seconds. */
function shift(layer: Layer, delta: number) {
  layer.startTime = Math.max(0, layer.startTime + delta);
  const values = [
    ...Object.values(layer.transform),
    ...Object.values(layer.properties),
  ] as { keyframes?: { time: number }[] }[];
  for (const value of values)
    if (Array.isArray(value?.keyframes))
      for (const frame of value.keyframes)
        frame.time = Math.max(0, frame.time + delta);
  for (const child of layer.children) shift(child, delta);
}

/**
 * The commands that place a saved element at `time` (one undo step): new
 * ids, keyframes moved with it, each top-level layer on a free or new lane
 * with its clip settings (animation presets, effects) kept.
 */
export function mineCommands(
  composition: DeepReadonly<Composition>,
  assets: readonly { id: string }[],
  item: MineItem,
  time: number,
  preview: (commands: readonly Command[]) => DeepReadonly<Composition>,
): { commands: Command[]; layerIds: string[] } {
  const commands: Command[] = [];
  const layerIds: string[] = [];
  const origin = item.origin ?? 0;
  const delta = time - origin;
  for (const asset of item.assets ?? [])
    if (!assets.some((existing) => existing.id === asset.id))
      commands.push({ type: 'ADD_ASSET', asset } as unknown as Command);
  let draft = composition;
  for (const saved of item.layers ?? []) {
    const layer = cloneLayer(saved as never);
    shift(layer, delta);
    const clip = item.clips?.find((entry) => entry.layerId === saved.id);
    const start = clip ? Math.max(0, clip.startTime + delta) : layer.startTime;
    const duration = clip?.duration ?? layer.duration;
    const placed: Command[] = [
      {
        type: 'CREATE_LAYER',
        compositionId: composition.id,
        parentId: null,
        index: draft.layers.length,
        layer,
      } as Command,
    ];
    const target = trackForNewClip(
      draft,
      layer as never,
      start,
      start + duration,
      [],
      { keepTime: true },
    );
    placed.push(...target.commands, {
      type: 'CREATE_CLIP',
      compositionId: composition.id,
      trackId: target.trackId,
      clip: {
        id: crypto.randomUUID(),
        name: layer.name,
        layerId: layer.id,
        assetId: layer.assetId,
        startTime: target.startTime,
        duration,
        sourceIn: clip?.sourceIn ?? 0,
        sourceOut: clip?.sourceOut ?? duration,
        enabled: true,
        speed: clip?.speed ?? 1,
        transitionMetadata: {},
        effectMetadata: {},
        metadata: structuredClone(clip?.metadata ?? {}) as never,
      },
    } as Command);
    commands.push(...placed);
    layerIds.push(layer.id);
    draft = preview(commands);
  }
  return { commands, layerIds };
}
