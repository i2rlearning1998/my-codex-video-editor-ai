// FINAL2 U6: the Font side panel's picker. Search, category chips, a Hindi /
// Devanagari filter, Recently used (this browser), the bundled and system
// fonts and the text engine's catalog, which downloads a family on first use
// (src/text-engine/fonts.ts: cached in IndexedDB, shared with the export
// worker, which loads the same faces before rendering). A download shows
// Loading, then the font; offline or failed downloads say so in plain words
// and keep the previous font. The coverage line checks the selected text
// against the font's own faces (unicode-range metadata) with the engine's
// glyphCoverage helper.
import { t } from '../i18n';
import { bundledFaces, isBundledFont } from '../render/fonts';
import { SYSTEM_FONTS } from '../render/text-style';
import { FONT_CATALOG, type FontCategory } from '../text-engine/catalog';
import { FontLoadError, loadFont, loadFontPreview } from '../text-engine/fonts';
import { glyphCoverage } from '../text-engine/layout';
import { uploadedFonts } from '../text-engine/uploaded';
import { iconSvg } from './icons';

export const FONT_RECENT_KEY = 'aive.fonts.recent';
const RECENT_LIMIT = 8;
const CHIPS: readonly ('all' | FontCategory)[] = [
  'all',
  'sans-serif',
  'serif',
  'display',
  'handwriting',
  'monospace',
];
type Source = 'bundled' | 'system' | 'catalog' | 'uploaded';
interface Entry {
  readonly family: string;
  readonly category: FontCategory;
  readonly devanagari: boolean;
  readonly source: Source;
}
const DEVANAGARI_BUNDLED = new Set(['Poppins', 'Noto Sans Devanagari']);
const ENTRIES: readonly Entry[] = [
  ...SYSTEM_FONTS.map(([family, generic]): Entry => ({
    family,
    category: generic as FontCategory,
    devanagari: DEVANAGARI_BUNDLED.has(family),
    source: isBundledFont(family) ? 'bundled' : 'system',
  })),
  ...FONT_CATALOG.filter(
    (font) => !SYSTEM_FONTS.some(([name]) => name === font.family),
  ).map((font): Entry => ({
    family: font.family,
    category: font.category,
    devanagari: font.scripts.includes('devanagari'),
    source: 'catalog',
  })),
];

type LoadState =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };
/** Download state per family, kept while the page lives. */
const states = new Map<string, LoadState>();
/** FIX1 F8: the Hindi sample every Devanagari font must draw. */
export const DEVANAGARI_SAMPLE = 'नमस्ते दुनिया';
/**
 * FIX1 F8: Devanagari fonts checked after loading: true when they draw the
 * sample with their own glyphs. A font that fails is left out of the Hindi
 * filter (and logged), so it is never offered for Hindi text.
 */
export const devanagariCoverage = new Map<string, boolean>();
/** Whether `family` draws `text` itself (not through a fallback face). */
export function drawsOwnGlyphs(family: string, text: string): boolean {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return true;
  const width = (font: string) => {
    context.font = font;
    return context.measureText(text).width;
  };
  // A font without these glyphs measures exactly like each fallback alone.
  return ['monospace', 'serif'].some(
    (generic) =>
      Math.abs(
        width(`40px "${family}", ${generic}`) - width(`40px ${generic}`),
      ) > 0.5,
  );
}

/** FINAL3 T4: the catalog plus the user's uploaded fonts. */
function allEntries(): Entry[] {
  return [
    ...ENTRIES,
    ...uploadedFonts().map((family): Entry => ({
      family,
      category: 'sans-serif',
      devanagari: false,
      source: 'uploaded',
    })),
  ];
}
export function recentFonts(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FONT_RECENT_KEY) ?? '[]');
    const known = allEntries();
    return Array.isArray(raw)
      ? raw
          .filter((name): name is string => typeof name === 'string')
          .filter((name) => known.some((entry) => entry.family === name))
          .slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}
function remember(family: string) {
  try {
    localStorage.setItem(
      FONT_RECENT_KEY,
      JSON.stringify(
        [family, ...recentFonts().filter((name) => name !== family)].slice(
          0,
          RECENT_LIMIT,
        ),
      ),
    );
  } catch {
    /* Storage blocked: the list is a convenience only. */
  }
}

/** `U+0900-097F, U+25CC, U+4??` as inclusive code point ranges. */
export function parseUnicodeRange(range: string): [number, number][] {
  return range
    .split(',')
    .map((part) => part.trim().replace(/^U\+/i, ''))
    .filter(Boolean)
    .map((part): [number, number] => {
      if (part.includes('?'))
        return [
          parseInt(part.replace(/\?/g, '0'), 16),
          parseInt(part.replace(/\?/g, 'F'), 16),
        ];
      const [from, to] = part.split('-');
      const start = parseInt(from!, 16);
      return [start, to ? parseInt(to, 16) : start];
    })
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
}
const unquote = (family: string) => family.replace(/^["']|["']$/g, '');
/** The unicode ranges a family's own faces declare, or null when unknown. */
export function familyRanges(family: string): [number, number][] | null {
  const ranges: string[] = isBundledFont(family)
    ? bundledFaces('/')
        .filter((face) => face.family === family)
        .map((face) => face.unicodeRange)
    : [];
  if (!ranges.length && typeof document !== 'undefined' && document.fonts)
    for (const face of document.fonts as unknown as Iterable<FontFace>)
      if (unquote(face.family) === family && face.status !== 'error')
        ranges.push(face.unicodeRange);
  if (!ranges.length) return null;
  return ranges.flatMap(parseUnicodeRange);
}
/** The engine's coverage check against the family's own faces. */
export function fontCoverage(text: string, family: string) {
  const ranges = familyRanges(family);
  if (!ranges) return null;
  return glyphCoverage(text, (code) =>
    ranges.some(([from, to]) => code >= from && code <= to),
  );
}

export interface FontPickerOptions {
  readonly current: string;
  readonly weight: number;
  /** The selected text, for the coverage line. */
  readonly text: string;
  /** FINAL3 T4: `uploaded` is true for the user's own font. */
  readonly apply: (family: string, uploaded?: boolean) => void;
  /** FINAL3 T4: the families the project's text already uses. */
  readonly documentFonts?: readonly string[];
  /** FINAL3 T4: stores an uploaded file; resolves its family. */
  readonly upload?: (file: File) => Promise<string>;
}

export function buildFontPicker(options: FontPickerOptions): HTMLElement {
  let current = options.current;
  let query = '';
  let chip: (typeof CHIPS)[number] = 'all';
  let hindi = false;
  const wrap = document.createElement('div');
  wrap.className = 'font-picker';
  const search = document.createElement('input');
  search.type = 'search';
  search.id = 'font-search';
  search.className = 'font-search';
  search.placeholder = t('fonts.search');
  search.setAttribute('aria-label', t('fonts.search'));
  const chips = document.createElement('div');
  chips.className = 'font-chips';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', t('fonts.categories'));
  const chipButton = (id: string, label: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'font-chip';
    button.dataset.fontChip = id;
    button.textContent = label;
    return button;
  };
  for (const id of CHIPS) {
    const button = chipButton(id, t(`fonts.chip.${id}`));
    button.onclick = () => {
      chip = id;
      paint();
    };
    chips.append(button);
  }
  const hindiChip = chipButton('devanagari', t('fonts.chip.devanagari'));
  hindiChip.onclick = () => {
    hindi = !hindi;
    paint();
  };
  chips.append(hindiChip);
  const offline = document.createElement('p');
  offline.className = 'font-offline';
  offline.setAttribute('role', 'status');
  offline.textContent = t('fonts.offline');
  const coverage = document.createElement('p');
  coverage.className = 'font-coverage';
  coverage.setAttribute('aria-live', 'polite');
  const lists = document.createElement('div');
  lists.className = 'font-lists';
  // FIX1 F8: preview faces load for the rows that scroll into view.
  const previewObserver =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((seen) => {
          for (const record of seen) {
            if (!record.isIntersecting) continue;
            const row = record.target as HTMLElement;
            previewObserver?.unobserve(row);
            const family = row.dataset.font!;
            const entry = ENTRIES.find((item) => item.family === family);
            void loadFontPreview(
              family,
              entry?.devanagari ? `${family} ${DEVANAGARI_SAMPLE}` : family,
            ).then((ok) => {
              row.dataset.preview = ok ? 'ready' : 'none';
            });
          }
        });
  wrap.append(search, chips, offline, coverage, lists);

  const paintCoverage = () => {
    const text = options.text.trim();
    coverage.hidden = !text;
    if (!text) return;
    const result = fontCoverage(text, current);
    coverage.dataset.state = !result
      ? 'unknown'
      : result.covered
        ? 'ok'
        : 'missing';
    coverage.textContent = !result
      ? t('fonts.coverage.unknown', { font: current })
      : result.covered
        ? t('fonts.coverage.ok', { font: current })
        : t('fonts.coverage.missing', {
            font: current,
            chars: result.missing.slice(0, 12).join(' '),
          });
  };
  const pick = async (entry: Entry) => {
    if (entry.source !== 'catalog') {
      done(entry.family, entry.source === 'uploaded');
      return;
    }
    states.set(entry.family, { kind: 'loading' });
    paint();
    try {
      // FIX1 F8: only weights the family has (bold or italic on a
      // single-weight font is drawn synthetically); Hindi fonts bring
      // their Devanagari faces.
      await loadFont(
        entry.family,
        [options.weight],
        entry.devanagari ? ['latin', 'devanagari'] : ['latin'],
        {
          offline:
            typeof navigator !== 'undefined' && navigator.onLine === false,
        },
      );
      if (entry.devanagari) {
        await document.fonts.load(`40px "${entry.family}"`, DEVANAGARI_SAMPLE);
        const covered = drawsOwnGlyphs(entry.family, DEVANAGARI_SAMPLE);
        devanagariCoverage.set(entry.family, covered);
        if (!covered)
          console.debug(
            '[fonts] no Devanagari glyphs; hidden from the Hindi filter',
            entry.family,
          );
      }
      states.set(entry.family, { kind: 'ready' });
      done(entry.family);
    } catch (error) {
      console.debug('[fonts] download failed', entry.family, error);
      states.set(entry.family, {
        kind: 'error',
        message:
          error instanceof FontLoadError && error.code === 'OFFLINE_MISS'
            ? t('fonts.error.offline')
            : error instanceof FontLoadError && error.status
              ? t('fonts.error.status', { status: error.status })
              : error instanceof FontLoadError
                ? t('fonts.error.reason', { reason: error.message })
                : t('fonts.error.failed'),
      });
    }
    paint();
  };
  const done = (family: string, uploaded = false) => {
    current = family;
    remember(family);
    options.apply(family, uploaded);
    paint();
  };
  const option = (entry: Entry) => {
    const state = states.get(entry.family);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'font-option';
    item.setAttribute('role', 'option');
    item.dataset.font = entry.family;
    item.dataset.source = entry.source;
    item.setAttribute('aria-selected', String(entry.family === current));
    // FIX1 F8: each row in its own typeface: the family once loaded, else a
    // tiny preview face of just its name.
    item.style.fontFamily = `"${entry.family}", "${entry.family} Preview", sans-serif`;
    if (entry.source === 'catalog' && state?.kind !== 'ready') {
      item.dataset.preview = 'pending';
      previewObserver?.observe(item);
    }
    const name = document.createElement('span');
    name.className = 'font-option-name';
    name.textContent = entry.family;
    item.append(name);
    if (entry.devanagari) {
      const tag = document.createElement('span');
      tag.className = 'font-tag';
      tag.textContent = t('fonts.tag.devanagari');
      item.append(tag);
    }
    const status = document.createElement('span');
    status.className = 'font-state';
    if (state?.kind === 'loading') {
      status.dataset.state = 'loading';
      status.textContent = t('fonts.loading');
      item.setAttribute('aria-busy', 'true');
    } else if (state?.kind === 'error') {
      status.dataset.state = 'error';
      status.textContent = state.message;
      // A click on the row (or on Retry) tries again.
      const retry = document.createElement('span');
      retry.className = 'font-retry';
      retry.dataset.action = 'font-retry';
      retry.setAttribute('role', 'button');
      retry.textContent = t('fonts.retryButton');
      status.append(' ', retry);
    } else if (entry.source === 'catalog' && state?.kind !== 'ready') {
      status.dataset.state = 'download';
      status.innerHTML = iconSvg('download', 16);
      status.title = t('fonts.download');
    }
    if (status.dataset.state) item.append(status);
    item.title =
      entry.source === 'catalog' && state?.kind !== 'ready'
        ? `${entry.family}: ${t('fonts.download')}`
        : entry.family;
    item.onclick = () => {
      if (states.get(entry.family)?.kind !== 'loading') void pick(entry);
    };
    return item;
  };
  const section = (id: string, title: string, entries: readonly Entry[]) => {
    const wrapSection = document.createElement('section');
    wrapSection.className = 'tool-panel-section font-section';
    wrapSection.dataset.fontSection = id;
    const heading = document.createElement('h3');
    heading.textContent = title;
    const list = document.createElement('div');
    list.className = 'font-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', title);
    list.append(...entries.map(option));
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = t('fonts.empty');
      list.append(empty);
    }
    wrapSection.append(heading, list);
    return wrapSection;
  };
  const paint = () => {
    for (const button of chips.querySelectorAll<HTMLElement>('.font-chip'))
      button.setAttribute(
        'aria-pressed',
        String(
          button.dataset.fontChip === 'devanagari'
            ? hindi
            : button.dataset.fontChip === chip,
        ),
      );
    offline.hidden =
      typeof navigator === 'undefined' || navigator.onLine !== false;
    const needle = query.trim().toLowerCase();
    const known = allEntries();
    const matches = known.filter(
      (entry) =>
        (!needle || entry.family.toLowerCase().includes(needle)) &&
        (chip === 'all' || entry.category === chip) &&
        (!hindi ||
          (entry.devanagari && devanagariCoverage.get(entry.family) !== false)),
    );
    const filtered = !!needle || chip !== 'all' || hindi;
    const recent = recentFonts()
      .map((name) => known.find((entry) => entry.family === name)!)
      .filter(Boolean);
    // FINAL3 T4: Document fonts (used in this project) and Uploaded fonts.
    const documentFonts = (options.documentFonts ?? [])
      .map((name) => known.find((entry) => entry.family === name))
      .filter((entry): entry is Entry => !!entry);
    const uploaded = known.filter((entry) => entry.source === 'uploaded');
    const uploadSection = section('uploaded', t('fonts.uploaded'), uploaded);
    if (options.upload) uploadSection.append(uploadButton());
    lists.replaceChildren(
      ...(filtered
        ? [section('results', t('fonts.results'), matches)]
        : [
            ...(recent.length
              ? [section('recent', t('fonts.recent'), recent)]
              : []),
            ...(documentFonts.length
              ? [section('document', t('fonts.documentFonts'), documentFonts)]
              : []),
            uploadSection,
            section(
              'bundled',
              t('panels.bundledFonts'),
              matches.filter((entry) => entry.source === 'bundled'),
            ),
            section(
              'system',
              t('panels.systemFonts'),
              matches.filter((entry) => entry.source === 'system'),
            ),
            section(
              'catalog',
              t('fonts.catalog'),
              matches.filter((entry) => entry.source === 'catalog'),
            ),
          ]),
    );
    paintCoverage();
  };
  search.oninput = () => {
    query = search.value;
    paint();
  };
  /** FINAL3 T4: Upload a font (.ttf, .otf, .woff, .woff2). */
  function uploadButton() {
    const label = document.createElement('label');
    label.className = 'secondary sm font-upload';
    label.dataset.action = 'font-upload';
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'font-upload-input';
    input.accept = '.ttf,.otf,.woff,.woff2';
    input.hidden = true;
    const text = document.createElement('span');
    text.textContent = t('fonts.upload');
    const hint = document.createElement('small');
    hint.textContent = t('fonts.uploadHint');
    label.append(input, text, hint);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || !options.upload) return;
      states.set(file.name, { kind: 'loading' });
      void options
        .upload(file)
        .then((family) => {
          states.set(family, { kind: 'ready' });
          done(family, true);
        })
        .catch((error: unknown) => {
          coverage.hidden = false;
          coverage.dataset.state = 'missing';
          coverage.textContent =
            error instanceof Error ? error.message : t('fonts.error.failed');
        });
    };
    return label;
  }
  const connection = () => {
    if (!wrap.isConnected) {
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      return;
    }
    paint();
  };
  window.addEventListener('online', connection);
  window.addEventListener('offline', connection);
  paint();
  return wrap;
}
