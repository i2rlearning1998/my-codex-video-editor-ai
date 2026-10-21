// FINAL3 V2.5: the starter kit's ids (the plan schema validates against
// them; kit.ts builds them). Plain data, no imports.
export const KIT_ITEMS = [
  'lower-third-1',
  'lower-third-2',
  'lower-third-3',
  'title-card-1',
  'title-card-2',
  'title-card-3',
  'title-card-4',
  'title-card-5',
  'end-card',
  'subscribe-cta',
  'callout-arrow',
  'number-counter',
  'quote-card',
] as const;
export type KitItemId = (typeof KIT_ITEMS)[number];
/** Eight transitions, mapped to the editor's scene transitions (cut: none). */
export const KIT_TRANSITIONS = [
  'cut',
  'crossfade',
  'dip-to-black',
  'dip-to-white',
  'wipe-left',
  'wipe-right',
  'slide-left',
  'slide-right',
] as const;
export type KitTransition = (typeof KIT_TRANSITIONS)[number];
/** Six caption styles (five of the captions engine and Headline). */
export const KIT_CAPTION_STYLES = [
  'clean',
  'bold-box',
  'karaoke',
  'lower-third',
  'minimal',
  'headline',
] as const;
export type KitCaptionStyle = (typeof KIT_CAPTION_STYLES)[number];
/** Four backgrounds a scene may name as a kit layer. */
export const KIT_BACKGROUNDS = [
  'background-solid',
  'background-band',
  'background-frame',
  'background-spotlight',
] as const;
export type KitBackgroundId = (typeof KIT_BACKGROUNDS)[number];
