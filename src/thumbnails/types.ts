export interface ThumbnailItem {
  readonly id: string;
  readonly type: string;
  readonly data?: unknown;
  /** Change when externally supplied frames change (e.g. font or bake revision). */
  readonly revision?: string;
  readonly blob?: Blob;
  readonly poster?: Blob;
  readonly bakedFrames?: readonly Blob[];
  /** Owned by caller; return a Blob to avoid leaking GPU frame ownership. */
  readonly frameAt?: (
    progress: number,
    size: ThumbnailSize,
    signal: AbortSignal,
  ) => Promise<Blob>;
}
export interface ThumbnailSize {
  width: number;
  height: number;
}
export interface ThumbnailOptions extends ThumbnailSize {
  signal?: AbortSignal;
}
export interface PreviewOptions extends ThumbnailOptions {
  count: number;
}
export interface RenderRequest extends ThumbnailSize {
  progress: number;
  signal: AbortSignal;
}
export type ThumbnailRender = (
  item: ThumbnailItem,
  request: RenderRequest,
) => Promise<Blob>;
export interface ThumbnailCache {
  read(key: string): Promise<Blob | null>;
  write(key: string, value: Blob): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}
