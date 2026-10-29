// Phase 1 library: turns content (library records, themes, styles, media
// files) into catalog candidates for the store. Payload records are the
// existing formats (P1-03); only the wrapper is new.
import type { LibraryItem } from '../../src/library/schema';
import {
  INLINE_LIMIT,
  categoryOf,
  type CatalogKind,
} from '../../src/library-client/format';
import { canonicalJson, type Candidate, type ItemStore } from './store';
import { sha256Hex } from './keys';
import {
  blurFor,
  blurOfItem,
  paletteSvg,
  thumbnailSvg,
  waveformSvg,
} from './thumbs';

export const ORIGINAL_LICENSE = {
  name: 'Original',
  credit: 'Made for AI-Native, no outside assets',
} as const;

type License = Candidate['license'];

const svgFile = (store: ItemStore, svg: string) =>
  store.putFile(Buffer.from(svg, 'utf8'), 'svg', 'image/svg+xml');

/** A small record, inlined when under 8 KB, else a payload file (P1-05). */
export function recordVersion(store: ItemStore, record: unknown) {
  const text = canonicalJson(record);
  const contentHash = sha256Hex(text);
  if (Buffer.byteLength(text) < INLINE_LIMIT)
    return { contentHash, inline: record };
  return {
    contentHash,
    file: store.putFile(
      Buffer.from(JSON.stringify(record), 'utf8'),
      'json',
      'application/json',
    ),
  };
}

export function libraryItemCandidate(
  store: ItemStore,
  item: LibraryItem,
  source: string,
  license: License = ORIGINAL_LICENSE,
): Candidate {
  return {
    id: item.id,
    kind: item.type,
    category: categoryOf(item.type, item.section),
    name: item.name,
    tags: item.tags,
    license,
    version: {
      ...recordVersion(store, item),
      thumb: svgFile(store, thumbnailSvg(item)),
      blur: blurOfItem(item),
      source,
    },
  };
}

export interface ThemeRecord {
  readonly id: string;
  readonly name: string;
  readonly palette: Record<string, string | undefined>;
  readonly [key: string]: unknown;
}
export function themeCandidate(
  store: ItemStore,
  theme: ThemeRecord,
  source: string,
  hi = theme.name,
  license: License = ORIGINAL_LICENSE,
): Candidate {
  const colors = Object.values(theme.palette).filter(
    (value): value is string => !!value,
  );
  return {
    id: theme.id,
    kind: 'theme',
    category: 'styles',
    name: { en: theme.name, hi },
    tags: ['theme'],
    license,
    version: {
      ...recordVersion(store, theme),
      thumb: svgFile(store, paletteSvg(colors, theme.name)),
      blur: blurFor(colors[0]!, colors[1] ?? colors[0]!),
      source,
    },
  };
}

/** A Creator Pack `style` item (kept exactly as the pack has it). */
export function styleCandidate(
  store: ItemStore,
  item: {
    id: string;
    name: { en: string; hi: string };
    tags?: string[];
    data: { palette?: Record<string, string> } & Record<string, unknown>;
  },
  source: string,
  license: License = ORIGINAL_LICENSE,
): Candidate {
  const colors = Object.values(item.data.palette ?? {}).filter((value) =>
    /^#[0-9a-fA-F]{6}$/.test(value),
  );
  const swatches = colors.length ? colors : ['#5b37f0', '#a591ff'];
  return {
    id: item.id,
    kind: 'style',
    category: 'styles',
    name: item.name,
    tags: (item.tags ?? []).slice(0, 12),
    license,
    version: {
      ...recordVersion(store, { ...item, type: 'style' }),
      thumb: svgFile(store, paletteSvg(swatches, item.name.en)),
      blur: blurFor(swatches[0]!, swatches[1] ?? swatches[0]!),
      source,
    },
  };
}

/** Linear resampling of mono samples (the sound proxy, P1-05). */
export function downsample(samples: Float32Array, from: number, to: number) {
  const n = Math.max(1, Math.round((samples.length * to) / from));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const at = (i * from) / to;
    const a = Math.floor(at);
    const f = at - a;
    out[i] =
      (samples[a] ?? 0) * (1 - f) + (samples[a + 1] ?? samples[a] ?? 0) * f;
  }
  return out;
}

export function soundCandidate(
  store: ItemStore,
  sound: {
    id: string;
    name: { en: string; hi: string };
    tags: string[];
    samples: Float32Array;
    rate: number;
    encode: (samples: Float32Array, rate: number) => Uint8Array;
  },
  source: string,
  license: License = ORIGINAL_LICENSE,
): Candidate {
  const fullBytes = sound.encode(sound.samples, sound.rate);
  const full = store.putFile(fullBytes, 'wav', 'audio/wav');
  const proxyRate = 12_000;
  const proxy = store.putFile(
    sound.encode(downsample(sound.samples, sound.rate, proxyRate), proxyRate),
    'wav',
    'audio/wav',
  );
  const wave = svgFile(store, waveformSvg(sound.samples));
  return {
    id: sound.id,
    kind: 'sound',
    category: 'audio',
    name: sound.name,
    tags: sound.tags,
    license,
    version: {
      contentHash: full.sha256,
      thumb: wave,
      blur: blurFor('#1d2030', '#a591ff'),
      media: {
        poster: wave,
        proxy,
        full,
        duration: sound.samples.length / sound.rate,
      },
      source,
    },
  };
}

/** A media file the gate has checked (its picture and proxy made already). */
export function mediaCandidate(
  store: ItemStore,
  media: {
    id: string;
    kind: Extract<CatalogKind, 'sound' | 'video' | 'image' | 'font'>;
    name: { en: string; hi: string };
    tags: string[];
    full: { bytes: Uint8Array; ext: string; mime: string };
    proxy?: { bytes: Uint8Array; ext: string; mime: string };
    poster?: { bytes: Uint8Array; ext: string; mime: string };
    blur: string;
    width?: number;
    height?: number;
    duration?: number;
  },
  source: string,
  license: License,
): Candidate {
  const put = (file: { bytes: Uint8Array; ext: string; mime: string }) =>
    store.putFile(file.bytes, file.ext, file.mime);
  const full = put(media.full);
  const poster = media.poster ? put(media.poster) : undefined;
  return {
    id: media.id,
    kind: media.kind,
    category: categoryOf(media.kind),
    name: media.name,
    tags: media.tags,
    license,
    version: {
      contentHash: full.sha256,
      ...(poster ? { thumb: poster } : {}),
      blur: media.blur,
      media: {
        ...(poster ? { poster } : {}),
        ...(media.proxy ? { proxy: put(media.proxy) } : {}),
        full,
        ...(media.width ? { width: media.width } : {}),
        ...(media.height ? { height: media.height } : {}),
        ...(media.duration !== undefined ? { duration: media.duration } : {}),
      },
      source,
    },
  };
}
