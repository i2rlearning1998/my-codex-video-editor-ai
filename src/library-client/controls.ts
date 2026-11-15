// FIX7 Part B: which editor controls exist, per kind of selection, and which
// of them the owner has switched off. The registry names what the editor
// really shows (a test keeps it honest); the owner's choice travels in the
// signed settings as `controls.off`, a list of keys, so no release is needed.
import { z } from 'zod';
import { FX_TILE_DEFS } from './fx-keys';

export type ControlSurface = 'panel' | 'toolbar' | 'menu' | 'fx';
export const ASSET_TYPES = [
  'text',
  'shape',
  'drawing',
  'image',
  'video',
  'audio',
  'group',
  'multi',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const ASSET_LABELS: Record<AssetType, { en: string; hi: string }> = {
  text: { en: 'Text', hi: 'टेक्स्ट' },
  shape: { en: 'Shape', hi: 'आकृति' },
  drawing: { en: 'Drawing', hi: 'ड्रॉइंग' },
  image: { en: 'Photo', hi: 'फ़ोटो' },
  video: { en: 'Video', hi: 'वीडियो' },
  audio: { en: 'Audio', hi: 'ऑडियो' },
  group: { en: 'Group', hi: 'ग्रुप' },
  multi: { en: 'Several selected', hi: 'कई चुने हुए' },
};
export const SURFACE_LABELS: Record<
  ControlSurface,
  { en: string; hi: string }
> = {
  panel: { en: 'Right panel tabs', hi: 'दाएँ पैनल के टैब' },
  toolbar: { en: 'Toolbar above the canvas', hi: 'कैनवास के ऊपर का टूलबार' },
  menu: { en: 'Right-click menu', hi: 'राइट-क्लिक मेन्यू' },
  fx: {
    en: 'Filters, effects and transitions shown',
    hi: 'दिखने वाले फ़िल्टर, इफ़ेक्ट और ट्रांज़िशन',
  },
};

export interface ControlDef {
  readonly surface: ControlSurface;
  readonly id: string;
  readonly label: { en: string; hi: string };
  readonly types: readonly AssetType[];
}
const L = (en: string, hi: string) => ({ en, hi });
const VISUAL: AssetType[] = ['text', 'shape', 'drawing', 'image', 'video'];
const MANY: AssetType[] = [...VISUAL, 'group', 'multi'];
const def = (
  surface: ControlSurface,
  id: string,
  en: string,
  hi: string,
  types: readonly AssetType[],
): ControlDef => ({ surface, id, label: L(en, hi), types });
const TB = (id: string, en: string, hi: string, types: readonly AssetType[]) =>
  def('toolbar', id, en, hi, types);
const MN = (
  id: string,
  en: string,
  hi: string,
  types: readonly AssetType[] = ASSET_TYPES,
) => def('menu', id, en, hi, types);
const PN = (id: string, en: string, hi: string, types: readonly AssetType[]) =>
  def('panel', id, en, hi, types);

/** Everything the owner can switch off. Properties (the first tab) cannot be. */
export const CONTROL_REGISTRY: ControlDef[] = [
  // Right panel tabs
  PN('Animate', 'Animate', 'एनिमेट', [
    'text',
    'shape',
    'drawing',
    'image',
    'video',
    'group',
    'multi',
  ]),
  PN('Effects', 'Effects', 'इफ़ेक्ट', [
    'text',
    'shape',
    'drawing',
    'image',
    'video',
  ]),
  PN('Adjust', 'Adjust', 'एडजस्ट', [
    'text',
    'shape',
    'drawing',
    'image',
    'video',
  ]),
  PN('Filters', 'Colour filters', 'कलर फ़िल्टर', ['image', 'video']),
  PN('Fade', 'Fade', 'फ़ेड', ['image', 'video', 'audio', 'group', 'multi']),
  PN('Speed', 'Speed', 'स्पीड', ['video', 'audio']),
  PN('Audio', 'Audio', 'ऑडियो', ['video', 'audio']),
  PN('Captions', 'Captions', 'कैप्शन', ['video']),
  PN('Transitions', 'Transitions', 'ट्रांज़िशन', [
    'text',
    'shape',
    'drawing',
    'image',
    'video',
    'group',
  ]),
  // Toolbar above the canvas
  TB('font', 'Font', 'फ़ॉन्ट', ['text']),
  TB('size', 'Font size', 'फ़ॉन्ट साइज़', ['text']),
  TB('color', 'Colour', 'रंग', ['text', 'drawing']),
  TB('brush-size', 'Brush size', 'ब्रश साइज़', ['drawing']),
  TB('group', 'Group', 'ग्रुप', ['multi']),
  TB('ungroup', 'Ungroup', 'अनग्रुप', ['group']),
  TB('bold', 'Bold', 'बोल्ड', ['text']),
  TB('italic', 'Italic', 'इटैलिक', ['text']),
  TB('underline', 'Underline', 'अंडरलाइन', ['text']),
  TB('strike', 'Strikethrough', 'स्ट्राइकथ्रू', ['text']),
  TB('uppercase', 'Text case', 'टेक्स्ट केस', ['text']),
  TB('align', 'Align text', 'टेक्स्ट अलाइन', ['text']),
  TB('list', 'List', 'लिस्ट', ['text']),
  TB('spacing', 'Spacing', 'स्पेसिंग', ['text']),
  TB('effects', 'Effects', 'इफ़ेक्ट', ['text']),
  TB(
    'text-more',
    'More (lock, duplicate, delete)',
    'और (लॉक, डुप्लिकेट, डिलीट)',
    ['text'],
  ),
  TB('fill', 'Fill', 'फ़िल', ['shape']),
  TB('stroke-style', 'Border / stroke', 'बॉर्डर', ['shape', 'image']),
  TB('corners-menu', 'Corners', 'कोने', ['shape', 'image']),
  TB('boolean', 'Combine shapes', 'आकृतियाँ जोड़ें', ['shape']),
  TB('edit-image', 'Edit photo', 'फ़ोटो एडिट', ['image']),
  TB('replace', 'Replace', 'बदलें', ['image', 'video']),
  TB('bg-remover', 'Background remover', 'बैकग्राउंड हटाएँ', ['image']),
  TB('eraser', 'Magic eraser', 'मैजिक इरेज़र', ['image']),
  TB('crop', 'Crop', 'क्रॉप', ['image', 'video']),
  TB('flip', 'Flip', 'फ़्लिप', ['image', 'video']),
  TB('transparency', 'Transparency', 'पारदर्शिता', MANY),
  TB('animate', 'Animate', 'एनिमेट', MANY),
  TB('position', 'Position', 'पोज़िशन', MANY),
  TB('copy-style', 'Copy style', 'स्टाइल कॉपी', MANY),
  // Right-click menu
  MN('duplicate', 'Duplicate', 'डुप्लिकेट'),
  MN('copy', 'Copy', 'कॉपी'),
  MN('cut', 'Cut', 'कट'),
  MN('delete', 'Delete', 'डिलीट'),
  MN('clip-menu', 'Clip submenu', 'क्लिप सबमेन्यू'),
  MN('arrange', 'Layer order submenu', 'लेयर ऑर्डर सबमेन्यू'),
  MN('align', 'Align submenu', 'अलाइन सबमेन्यू'),
  MN('style-menu', 'Style submenu', 'स्टाइल सबमेन्यू'),
  MN('lock', 'Lock / Unlock', 'लॉक / अनलॉक'),
  MN('ungroup', 'Ungroup', 'अनग्रुप', ['group']),
  MN('combine', 'Combine shapes', 'आकृतियाँ जोड़ें', ['shape', 'multi']),
  MN('code-menu', 'Code animation submenu', 'कोड एनिमेशन सबमेन्यू', ['video']),
  MN('save-to-mine', 'Save to My Templates', 'मेरे टेम्पलेट में सेव'),
  MN('more-menu', 'More submenu', 'और सबमेन्यू'),
  MN('hide', 'Hide', 'छुपाएँ'),
  MN('show-timing', 'Show element timing', 'एलिमेंट टाइमिंग'),
  MN('alt-text', 'Alternative text', 'ऑल्ट टेक्स्ट'),
  MN(
    'resize-to-selection',
    'Resize canvas to selection',
    'चयन के बराबर कैनवास',
  ),
  MN('download-selection', 'Download selection', 'चयन डाउनलोड'),
  MN('info', 'Info', 'जानकारी'),
  MN('comment', 'Comment', 'कमेंट'),
  MN('freeze', 'Freeze frame', 'फ़्रीज़ फ़्रेम', ['video']),
  MN('speed', 'Speed', 'स्पीड', ['video', 'audio']),
  MN('reverse', 'Reverse', 'रिवर्स', ['video']),
  MN('detach-audio', 'Detach audio', 'ऑडियो अलग करें', ['video']),
  MN('set-background', 'Set as background', 'बैकग्राउंड बनाएँ', [
    'image',
    'video',
  ]),
];

/** The built-in filter, effect and transition tiles (FIX7). */
export const FX_REGISTRY: readonly ControlDef[] = FX_TILE_DEFS.map((tile) => ({
  surface: 'fx' as const,
  id: tile.id,
  label: {
    en: `${tile.group} · ${tile.label.en}`,
    hi: `${tile.group} · ${tile.label.hi}`,
  },
  types: tile.types,
}));
CONTROL_REGISTRY.push(...FX_REGISTRY);

export const controlKey = (
  surface: ControlSurface,
  type: AssetType | string,
  id: string,
) => `${surface}.${type}.${id}`;

/** The owner's choice inside the settings' `controls`. */
export const controlsSchema = z
  .object({ off: z.array(z.string().max(80)).max(2000).default([]) })
  .passthrough();

const cache = new WeakMap<object, ReadonlySet<string>>();
/** The switched-off keys of a settings `controls` value. */
export function offKeys(controls: unknown): ReadonlySet<string> {
  if (!controls || typeof controls !== 'object') return new Set();
  const hit = cache.get(controls);
  if (hit) return hit;
  const parsed = controlsSchema.safeParse(controls);
  const set = new Set(parsed.success ? parsed.data.off : []);
  cache.set(controls, set);
  return set;
}
