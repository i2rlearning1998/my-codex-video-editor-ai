export type ProviderKind =
  | 'stock-image'
  | 'stock-video'
  | 'stock-audio'
  | 'icon'
  | 'sticker'
  | 'speech-tts'
  | 'speech-stt';
export type StockKind = Exclude<ProviderKind, 'speech-tts' | 'speech-stt'>;
export interface StockLicense {
  name: string;
  url: string;
  attributionRequired: boolean;
  commercialUse: boolean;
}
export interface StockFile {
  quality: string;
  url: string;
  width: number;
  height: number;
  mime: string;
  /** FIX1 F2: the file size the provider reports (0 or missing: unknown). */
  bytes?: number;
}
export interface StockItem {
  id: string;
  providerId: string;
  kind: StockKind;
  title: string;
  thumbUrl: string;
  previewUrl: string;
  width: number;
  height: number;
  durationSec: number;
  author: string;
  authorUrl: string;
  sourceUrl: string;
  tags: string[];
  license: StockLicense;
  files: StockFile[];
}
export interface SearchOptions {
  kind: ProviderKind;
  query: string;
  page?: number;
  perPage?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
  /** MED-032: only the providers that list a filter in `filters` use it. */
  category?: string;
  color?: string;
  minWidth?: number;
  minDuration?: number;
  maxDuration?: number;
  signal?: AbortSignal;
}
export interface SearchResult {
  items: StockItem[];
  total: number;
  nextPage: number | null;
}
export interface Provider {
  id: string;
  name: string;
  kinds: readonly ProviderKind[];
  requiresKey: boolean;
  keyFields: readonly { id: string; label: string; secret: boolean }[];
  attribution: { text: string; url: string };
  search(options: SearchOptions): Promise<SearchResult>;
  getDownload(
    item: StockItem,
    quality: string,
    signal?: AbortSignal,
  ): Promise<StockFile>;
  /** MED-032: the category and color filters this provider can apply, by kind. */
  filters?: Partial<
    Record<
      ProviderKind,
      { category?: readonly string[]; color?: readonly string[] }
    >
  >;
  /** One uncached minimal request. Optional for future providers without stock search. */
  probe?: (signal?: AbortSignal) => Promise<void>;
}
export interface LicenseMeta {
  providerId: string;
  itemId: string;
  sourceUrl: string;
  author: string;
  authorUrl: string;
  license: StockLicense;
  attributionText: string;
  importedAt: string;
}
