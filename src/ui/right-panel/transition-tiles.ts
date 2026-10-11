// V5 (Clipchamp clone spec 6): the transition tiles, shared by the right
// Transition panel (a selected cut marker) and the left Transitions
// category. Groups: Fades & blurs, Tiles, Wipes, then the rest of the FX
// library under More. Each tile's thumbnail mixes a colour-shifted copy of
// the selected picture (the outgoing clip) into the picture itself (the
// incoming one) through the same transition; hovering loops it.
import { surface, type Surface } from '../../fx';
import { mixFrames as mix } from '../../render/scene-transitions';
import { t } from '../../i18n';
import type { Tile } from './fx-panels';

export interface TransitionTile {
  /** The stored transition type: a J12 layer transition or an FX id. */
  readonly type: string;
  readonly group: 'fades' | 'tiles' | 'wipes' | 'more';
}
export const TRANSITION_TILES: readonly TransitionTile[] = [
  { type: 'crossfade', group: 'fades' },
  { type: 'transition.cross-blur', group: 'fades' },
  { type: 'transition.burn', group: 'fades' },
  { type: 'fade-black', group: 'fades' },
  { type: 'fade-white', group: 'fades' },
  { type: 'transition.horizontal-banding', group: 'fades' },
  { type: 'transition.tiles', group: 'tiles' },
  { type: 'transition.hard-wipe-down', group: 'wipes' },
  { type: 'transition.hard-wipe-up', group: 'wipes' },
  { type: 'wipe-left', group: 'wipes' },
  { type: 'wipe-right', group: 'wipes' },
  { type: 'transition.soft-wipe-down', group: 'wipes' },
  { type: 'transition.soft-wipe-up', group: 'wipes' },
  { type: 'transition.soft-wipe-left', group: 'wipes' },
  { type: 'transition.soft-wipe-right', group: 'wipes' },
  { type: 'transition.diagonal-soft-wipe', group: 'wipes' },
  { type: 'slide-left', group: 'more' },
  { type: 'slide-right', group: 'more' },
  { type: 'transition.iris-wipe', group: 'more' },
  { type: 'transition.push', group: 'more' },
  { type: 'transition.zoom', group: 'more' },
  { type: 'transition.spin', group: 'more' },
  { type: 'transition.swirl', group: 'more' },
  { type: 'transition.glitch', group: 'more' },
  { type: 'transition.glitch-reveal', group: 'more' },
  { type: 'transition.bloom', group: 'more' },
  { type: 'transition.page-turn', group: 'more' },
  { type: 'transition.cube-flip', group: 'more' },
];
/** Spec 6: a click on "+" adds Fade through black. */
export const DEFAULT_TRANSITION_TYPE = 'fade-black';

export const transitionLabel = (type: string) =>
  type.startsWith('transition.')
    ? t(`fx.${type}`)
    : t(`transition.type.${type}`);

/** The outgoing picture of a thumbnail: the source, colour-shifted. */
function shifted(source: Surface): Surface {
  const out = surface(source.width, source.height);
  for (let i = 0; i < source.data.length; i += 4) {
    out.data[i] = source.data[i + 2]! * 0.8;
    out.data[i + 1] = source.data[i]! * 0.8;
    out.data[i + 2] = source.data[i + 1]! * 0.8;
    out.data[i + 3] = source.data[i + 3]!;
  }
  return out;
}
/** (V7: the mix is shared with scene transitions; see src/render.) */
export { mixFrames as mix } from '../../render/scene-transitions';

/** The tiles for a tile grid (None first). */
export function transitionTiles(): Tile[] {
  const groups: Record<TransitionTile['group'], string> = {
    fades: t('transition.group.fadesBlurs'),
    tiles: t('transition.group.tiles'),
    wipes: t('transition.group.wipes'),
    more: t('fx.more'),
  };
  return [
    { key: 'none', label: t('fx.none'), stack: [] },
    ...TRANSITION_TILES.map((item): Tile => ({
      key: item.type,
      label: transitionLabel(item.type),
      stack: [],
      group: groups[item.group],
      animated: true,
      still: 0.4,
      draw: (source, phase) => mix(item.type, shifted(source), source, phase),
    })),
  ];
}
