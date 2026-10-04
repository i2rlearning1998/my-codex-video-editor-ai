// T7: the product's temporary branding in one place (D-012). The name is a
// placeholder wordmark until the owner chooses a brand; change it here and
// it changes in the top bar, the loading screen, the empty states and the
// export dialog. Brand names are not translated.
export const BRAND = {
  /** The product name in titles. */
  name: 'AI-Native',
  /** The wordmark drawn next to the mark. */
  wordmark: 'AI-Native',
  /** The single letter inside the square mark. */
  mark: 'A',
} as const;

/** The mark and wordmark as markup (decorative; the name is in the title). */
export function wordmarkHtml(size: 'sm' | 'md' = 'md'): string {
  return `<span class="brand-wordmark brand-${size}" data-brand-wordmark aria-hidden="true"><span class="brand-mark">${BRAND.mark}</span><span class="brand-name">${BRAND.wordmark}</span></span>`;
}
