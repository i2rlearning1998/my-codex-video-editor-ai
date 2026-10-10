// V5 (Clipchamp clone spec 6): the transition tiles, shared by the right
// Transition panel (a selected cut marker) and the left Transitions
// category. Groups: Fades & blurs, Tiles, Wipes, then the rest of the FX
// library under More. Each tile's thumbnail mixes a colour-shifted copy of
// the selected picture (the outgoing clip) into the picture itself (the
// incoming one) through the same transition; hovering loops it.
import {
  defaults as fxDefaults,
  getTransition,
  surface,
  type Surface,
} from '../../fx';
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
/** The transition `type` from `a` to `b` at progress `p`. */
export function mix(type: string, a: Surface, b: Surface, p: number) {
  const { width, height } = b;
  const out = surface(width, height);
  const library = getTransition(type);
  if (library) {
    library.apply(a, b, out, p, fxDefaults(library), {
      time: 0,
      duration: 1,
      seed: 7,
      width,
      height,
    });
    return out;
  }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const from = a.data[i + c]!,
          to = b.data[i + c]!;
        let value: number;
        switch (type) {
          case 'fade-black':
          case 'fade-white': {
            const veil = type === 'fade-black' ? 0 : 255;
            value =
              c === 3
                ? 255
                : p < 0.5
                  ? from + (veil - from) * (p * 2)
                  : veil + (to - veil) * (p * 2 - 1);
            break;
          }
          case 'wipe-left':
            value = x >= width * (1 - p) ? to : from;
            break;
          case 'wipe-right':
            value = x < width * p ? to : from;
            break;
          case 'slide-left':
          case 'slide-right': {
            const shift =
              Math.round(p * width) * (type === 'slide-left' ? 1 : -1);
            const at = x + shift;
            const j =
              at >= 0 && at < width
                ? (y * width + at) * 4
                : (y * width + (at < 0 ? at + width : at - width)) * 4;
            value = at >= 0 && at < width ? a.data[j + c]! : b.data[j + c]!;
            break;
          }
          default:
            value = from + (to - from) * p;
        }
        out.data[i + c] = value;
      }
    }
  return out;
}

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
