import en from './locales/en.json';
import hi from './locales/hi.json';

export type Language = 'en' | 'hi';
const locales: Record<Language, Record<string, string>> = { en, hi };
const listeners = new Set<() => void>();
export function preferredLanguage(languages: readonly string[]): Language {
  for (const code of languages) {
    const base = code.toLowerCase().split('-')[0];
    if (base === 'en' || base === 'hi') return base;
  }
  return 'en';
}
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem('aive.language');
    if (saved === 'en' || saved === 'hi') return saved;
  } catch {
    /* Language remains usable when storage is unavailable. */
  }
  return preferredLanguage(
    typeof navigator === 'undefined' ? [] : navigator.languages,
  );
}
let language = initialLanguage();
function syncDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.documentElement.dir = 'ltr';
}
syncDocument();
export const getLanguage = () => language;
export function setLanguage(code: Language): void {
  if (code !== 'en' && code !== 'hi') return;
  language = code;
  try {
    localStorage.setItem('aive.language', code);
  } catch {
    /* Optional preference storage. */
  }
  syncDocument();
  for (const listener of listeners) listener();
}
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function translate(
  key: string,
  params: Record<string, string | number> = {},
  locale: Language = language,
  dictionaries: Record<Language, Record<string, string>> = locales,
): string {
  const count = params.count;
  const plural =
    typeof count === 'number'
      ? `${key}_${new Intl.PluralRules(locale).select(count)}`
      : key;
  const resolved =
    plural in dictionaries.en || plural in dictionaries[locale] ? plural : key;
  let template = dictionaries[locale][resolved];
  if (template === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] ${locale}: ${resolved}`);
    template = dictionaries.en[resolved] ?? key;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined
      ? match
      : typeof value === 'number'
        ? new Intl.NumberFormat(locale).format(value)
        : value;
  });
}
export const t = (key: string, params?: Record<string, string | number>) =>
  translate(key, params);
export const formatNumber = (
  value: number,
  options?: Intl.NumberFormatOptions,
) =>
  new Intl.NumberFormat(language, {
    maximumFractionDigits: 2,
    ...options,
  }).format(value);
export const formatDate = (
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
) => new Intl.DateTimeFormat(language, options).format(value);
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const digits = new Intl.NumberFormat(language, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map((value) => digits.format(value))
    .join(':');
}

/** Text-only bridge for the existing shell; new components should subscribe directly. */
export function bindDomTranslations(root: HTMLElement): () => void {
  const reverse = new Map(
    Object.entries(locales[language]).map(([key, value]) => [value, key]),
  );
  const bindings: (() => void)[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const original = node.textContent ?? '';
    const key = reverse.get(original.trim());
    if (key)
      bindings.push(() => {
        node.textContent = original.replace(original.trim(), t(key));
      });
  }
  for (const element of root.querySelectorAll('[aria-label], [title]')) {
    for (const attr of ['aria-label', 'title']) {
      const key = reverse.get(element.getAttribute(attr) ?? '');
      if (key) bindings.push(() => element.setAttribute(attr, t(key)));
    }
  }
  return () => {
    for (const binding of bindings) binding();
  };
}
