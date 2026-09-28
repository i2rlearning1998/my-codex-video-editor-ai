import { getLanguage, translate } from '../i18n';
const en: Record<string, string> = {
  title: 'Sound',
  empty: 'Select one audio or video clip.',
  gainDb: 'Gain (dB)',
  pan: 'Pan (-1 left, +1 right)',
  fadeIn: 'Fade in (seconds)',
  fadeOut: 'Fade out (seconds)',
  muted: 'Mute clip',
  reset: 'Reset audio',
  key: 'Set volume key at playhead',
  clearKeys: 'Clear volume keys',
  keys: 'Volume keys: {count}',
  edit: 'Edit clip audio',
  locked: 'This track is locked.',
  error: 'Audio setting failed: {error}',
};
const hi: Record<string, string> = {
  title: 'ध्वनि',
  empty: 'एक ऑडियो या वीडियो क्लिप चुनें।',
  gainDb: 'गेन (dB)',
  pan: 'पैन (-1 बायाँ, +1 दायाँ)',
  fadeIn: 'फ़ेड इन (सेकंड)',
  fadeOut: 'फ़ेड आउट (सेकंड)',
  muted: 'क्लिप म्यूट करें',
  reset: 'ऑडियो रीसेट करें',
  key: 'प्लेहेड पर वॉल्यूम की जोड़ें',
  clearKeys: 'वॉल्यूम की हटाएँ',
  keys: 'वॉल्यूम की: {count}',
  edit: 'क्लिप ऑडियो बदलें',
  locked: 'यह ट्रैक लॉक है।',
  error: 'ऑडियो सेटिंग विफल: {error}',
};
export const soundText = (
  key: string,
  params?: Record<string, string | number>,
) => translate(key, params, getLanguage(), { en, hi });
