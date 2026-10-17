// J: media slots of an AI composition. A slot is a place in the video that
// needs a picture, a clip, a sound or a logo; the person (or the AI
// connector) fills it from the editor library, a stock provider or their own
// file. Filling never fetches anything here: stock and files arrive as editor
// asset records the caller has already imported (src/providers importStockItem,
// the media store), so this module stays pure.
import type { Asset, DeepReadonly } from '../core';
import type { CompositionData } from '../creator-pack/schemas';

export type SlotType = 'image' | 'video' | 'audio' | 'logo';
export interface CompositionSlot {
  readonly id: string;
  readonly type: SlotType;
  readonly hint: string;
  /** Required slots that stay empty are reported and drawn as a frame. */
  readonly required: boolean;
}
/** The voice-over slot's id (an audio slot made by the speech engine). */
export const VOICE_OVER_SLOT = 'voice-over';

export type SlotFill =
  /** An editor library item (built-in or My library), by id. */
  | { readonly kind: 'library'; readonly id: string }
  /** A stock item the caller imported as an asset (provider and item kept). */
  | {
      readonly kind: 'stock';
      readonly asset: Readonly<Asset>;
      readonly provider: string;
      readonly itemId: string;
    }
  /** The person's own file, already imported as an asset. */
  | { readonly kind: 'file'; readonly asset: Readonly<Asset> };

export type FillResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

interface SpecAssetSlot {
  id: string;
  kind: 'image' | 'video' | 'audio';
  description: string;
}

/** Every slot a composition declares: the spec's asset slots, then the voice-over. */
export function compositionSlots(
  data: DeepReadonly<CompositionData>,
): CompositionSlot[] {
  const spec = data.spec as {
    assets?: SpecAssetSlot[];
    scenes?: { items?: { slot?: string }[] }[];
  };
  const used = new Set(
    (spec.scenes ?? []).flatMap((scene) =>
      (scene.items ?? []).flatMap((item) => (item.slot ? [item.slot] : [])),
    ),
  );
  const extra = new Map((data.slots ?? []).map((slot) => [slot.id, slot]));
  const slots: CompositionSlot[] = (spec.assets ?? []).map((asset) => {
    const more = extra.get(asset.id);
    return {
      id: asset.id,
      type:
        more?.type === 'logo' && asset.kind === 'image' ? 'logo' : asset.kind,
      hint: more?.hint ?? asset.description,
      required: more?.required ?? used.has(asset.id),
    };
  });
  if (data.voiceOver)
    slots.push({
      id: VOICE_OVER_SLOT,
      type: 'audio',
      hint: `Voice-over (${data.voiceOver.lang}): ${data.voiceOver.text.slice(0, 80)}`,
      required: data.voiceOver.required ?? true,
    });
  return slots;
}

const assetTypeFor = (type: SlotType) => (type === 'logo' ? 'image' : type);

/** Why a fill does not fit a slot, or null when it does. */
export function fillProblem(
  slot: CompositionSlot,
  fill: SlotFill,
): string | null {
  if (fill.kind === 'library')
    return slot.type === 'image' || slot.type === 'logo'
      ? null
      : `Slot "${slot.id}" needs ${slot.type}; a library item can fill only an image or logo slot.`;
  const wanted = assetTypeFor(slot.type);
  return fill.asset.type === wanted
    ? null
    : `Slot "${slot.id}" needs ${wanted}, not ${fill.asset.type} ("${fill.asset.name}").`;
}

/** The fills for one composition, checked against its slots. */
export interface SlotFills {
  readonly slots: readonly CompositionSlot[];
  fillSlot(slotId: string, fill: SlotFill): FillResult;
  clearSlot(slotId: string): void;
  fillOf(slotId: string): SlotFill | undefined;
  listUnfilledSlots(): CompositionSlot[];
  /** The fills as a plain record (what `buildProjectFromComposition` takes). */
  toRecord(): Record<string, SlotFill>;
}

export function createSlotFills(
  data: DeepReadonly<CompositionData>,
  initial: Readonly<Record<string, SlotFill>> = {},
): SlotFills {
  const slots = compositionSlots(data);
  const fills = new Map<string, SlotFill>();
  const api: SlotFills = {
    slots,
    fillSlot(slotId, fill) {
      const slot = slots.find((s) => s.id === slotId);
      if (!slot) return { ok: false, reason: `No slot "${slotId}".` };
      const problem = fillProblem(slot, fill);
      if (problem) return { ok: false, reason: problem };
      fills.set(slotId, fill);
      return { ok: true };
    },
    clearSlot(slotId) {
      fills.delete(slotId);
    },
    fillOf: (slotId) => fills.get(slotId),
    listUnfilledSlots: () => slots.filter((slot) => !fills.has(slot.id)),
    toRecord: () => Object.fromEntries(fills),
  };
  for (const [id, fill] of Object.entries(initial)) api.fillSlot(id, fill);
  return api;
}
