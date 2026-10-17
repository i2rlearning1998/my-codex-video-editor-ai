import type { Voice } from './types';
const aliases: Record<string, string> = {
  english: 'en',
  hindi: 'hi',
  spanish: 'es',
  french: 'fr',
  german: 'de',
  japanese: 'ja',
  chinese: 'zh',
  korean: 'ko',
};
export function languageBase(value: string): string {
  const normalized = value.toLowerCase().replaceAll('_', '-');
  return aliases[normalized] ?? normalized.split('-')[0]!;
}
export function filterVoices(voices: Voice[], lang?: string): Voice[] {
  return lang
    ? voices.filter((v) => languageBase(v.lang) === languageBase(lang))
    : voices;
}
