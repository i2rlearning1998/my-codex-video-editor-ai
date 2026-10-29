// FIX7: the built-in filter, effect and transition tiles of the right panel,
// as plain lists, so the owner app can switch each one off. A test keeps
// these lists equal to the tiles the editor really shows.
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';
import type { AssetType } from './controls';

const word = (map: Record<string, string>, key: string, fallback: string) =>
  map[key] ?? fallback;
const human = (text: string) =>
  text.replace(/[-.]/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const FILTER_KEYS = [
  'retro',
  'orange-teal',
  'bold-blue',
  'golden-hour',
  'vibrant-vlogger',
  'purple-undertone',
  'winter-sunset',
  '35mm',
  'contrast',
  'fall',
  'winter',
  'old-western',
  'warm-coastline',
  'cool-coastline',
  'warm-countryside',
  'cool-countryside',
  'golden',
  'dreamscape',
  'sunrise',
  'warm-tone-film',
  'cool-tone',
  'pastel-dreams',
  'increased',
  'scenery',
  'portrait',
  'indoors',
  'outdoors',
  'muted',
  'black-white-1',
  'black-white-2',
  'soft-bw',
  'muted-bw',
  'gloomy',
  'deep-fried',
  'euphoric',
  'duotone-yellow-orange',
  'duotone-pink-purple',
  'duotone-blue-pink',
  'duotone-green-blue',
  'overlay-white',
  'overlay-black',
  'overlay-yellow',
  'overlay-orange',
  'overlay-red',
  'overlay-pink',
  'overlay-purple',
  'overlay-blue',
  'overlay-turquoise',
  'overlay-green',
] as const;
export const EFFECT_IDS = [
  'effect.flash',
  'effect.pulse',
  'effect.spin',
  'effect.vhs',
  'effect.rotate',
  'effect.vaporwave',
  'effect.chromatic-aberration',
  'effect.crash-zoom',
  'effect.slow-zoom',
  'effect.slow-zoom-random',
  'effect.green-screen',
  'effect.black-white-removal',
  'effect.blur',
  'effect.blur-fill',
  'effect.filmic',
  'effect.glitch',
  'effect.disco',
  'effect.color-shift',
  'effect.glass',
  'effect.comic',
  'effect.retro-graphics',
  'effect.vertical',
  'effect.radial',
  'effect.smoke',
  'effect.kaleidoscope',
  'effect.glow',
  'effect.diffusion',
  'effect.pixelation',
] as const;
export const TRANSITION_IDS = [
  'crossfade',
  'transition.cross-blur',
  'transition.burn',
  'fade-black',
  'fade-white',
  'transition.horizontal-banding',
  'transition.tiles',
  'transition.hard-wipe-down',
  'transition.hard-wipe-up',
  'wipe-left',
  'wipe-right',
  'transition.soft-wipe-down',
  'transition.soft-wipe-up',
  'transition.soft-wipe-left',
  'transition.soft-wipe-right',
  'transition.diagonal-soft-wipe',
  'slide-left',
  'slide-right',
  'transition.iris-wipe',
  'transition.push',
  'transition.zoom',
  'transition.spin',
  'transition.swirl',
  'transition.glitch',
  'transition.glitch-reveal',
  'transition.bloom',
  'transition.page-turn',
  'transition.cube-flip',
] as const;

const PICTURES: AssetType[] = ['image', 'video'];
const ANY: AssetType[] = ['text', 'shape', 'drawing', 'image', 'video'];
const CLIPS: AssetType[] = [...ANY, 'group'];
const e = en as Record<string, string>;
const h = hi as Record<string, string>;
const both = (key: string, fallback: string) => ({
  en: word(e, key, fallback),
  hi: word(h, key, word(e, key, fallback)),
});

/** One tile the owner can switch off (key `fx.<type>.<kind>:<id>`). */
export interface FxTileDef {
  readonly id: string;
  readonly group: 'Filters' | 'Effects' | 'Transitions';
  readonly label: { en: string; hi: string };
  readonly types: readonly AssetType[];
}
export const FX_TILE_DEFS: readonly FxTileDef[] = [
  ...FILTER_KEYS.map((key): FxTileDef => ({
    id: `filter:${key}`,
    group: 'Filters',
    label: both(`fx.preset.${key}`, human(key)),
    types: PICTURES,
  })),
  ...EFFECT_IDS.map((id): FxTileDef => ({
    id: `effect:${id}`,
    group: 'Effects',
    label: both(`fx.${id}`, human(id.replace('effect.', ''))),
    types: ANY,
  })),
  ...TRANSITION_IDS.map((type): FxTileDef => ({
    id: `transition:${type}`,
    group: 'Transitions',
    label: type.startsWith('transition.')
      ? both(`fx.${type}`, human(type.replace('transition.', '')))
      : both(`transition.type.${type}`, human(type)),
    types: CLIPS,
  })),
];
