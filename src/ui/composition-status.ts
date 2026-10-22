// FIX3 4.6 and 1.3: the status an AI composition card shows. A composition
// built with Build video remembers, in this browser and per project, which
// scenes it made (never in the project or the history). The card reads
// "Built" while one of them is still in the project, "Needs assets" while
// one of them still holds an empty slot frame, and "Not built" otherwise.

export type CompositionCardStatus = 'built' | 'needs-assets' | 'not-built';

interface SceneLike {
  readonly id: string;
  readonly layers: readonly {
    readonly properties?: Readonly<Record<string, unknown>>;
  }[];
}

/** The card's status from the scenes the build made and the project's. */
export function compositionCardStatus(
  builtSceneIds: readonly string[] | null | undefined,
  scenes: readonly SceneLike[],
): { status: CompositionCardStatus; scenes: number } {
  const ids = new Set(builtSceneIds ?? []);
  const kept = scenes.filter((scene) => ids.has(scene.id));
  if (!kept.length) return { status: 'not-built', scenes: 0 };
  const emptySlot = kept.some((scene) =>
    scene.layers.some((layer) => layer.properties?.compositionSlot),
  );
  return {
    status: emptySlot ? 'needs-assets' : 'built',
    scenes: kept.length,
  };
}

/** A short stable key for a composition's data (FNV-1a of its JSON). */
export function compositionKey(data: unknown): string {
  const text = JSON.stringify(data) ?? '';
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

const storeKey = (projectId: string) => `aive.compositionBuilt.${projectId}`;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** The scenes each composition built in this project (this browser). */
export function builtScenes(
  storage: Storage | null,
  projectId: string,
  key: string,
): string[] | null {
  try {
    const all = JSON.parse(
      storage?.getItem(storeKey(projectId)) ?? '{}',
    ) as Record<string, unknown> | null;
    const ids = all?.[key];
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string')
      : null;
  } catch {
    return null;
  }
}

export function rememberBuilt(
  storage: Storage | null,
  projectId: string,
  key: string,
  sceneIds: readonly string[],
): void {
  try {
    const all = JSON.parse(
      storage?.getItem(storeKey(projectId)) ?? '{}',
    ) as Record<string, unknown>;
    all[key] = [...sceneIds];
    storage?.setItem(storeKey(projectId), JSON.stringify(all));
  } catch {
    // Browser storage is a convenience: a card simply reads "Not built".
  }
}

/** This browser's localStorage, or null where it cannot be used. */
export function storageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
