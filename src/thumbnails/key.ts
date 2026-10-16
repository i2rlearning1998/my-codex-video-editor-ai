import type { ThumbnailItem, ThumbnailSize } from './types';
const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
const digest = async (text: string) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
async function canonical(
  value: unknown,
  ancestors = new Set<object>(),
): Promise<string> {
  if (value instanceof Blob)
    return `blob:${value.type}:${hex(await crypto.subtle.digest('SHA-256', await value.arrayBuffer()))}`;
  if (typeof value === 'function') return 'frame-provider';
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (ancestors.has(value)) throw Error('Cyclic item');
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value))
    return (
      '[' +
      (await Promise.all(value.map((v) => canonical(v, next)))).join(',') +
      ']'
    );
  return (
    '{' +
    (
      await Promise.all(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            async ([k, v]) =>
              `${JSON.stringify(k)}:${await canonical(v, next)}`,
          ),
      )
    ).join(',') +
    '}'
  );
}
export async function thumbnailKey(
  item: ThumbnailItem,
  size: ThumbnailSize,
  progress = 0,
): Promise<string> {
  if (item.frameAt && !item.revision)
    throw Error('Live frames require a content revision');
  const id = (await digest(item.id)).slice(0, 24);
  const content = (await digest(await canonical(item))).slice(0, 40);
  return `thumbs/${id}-${content}-${size.width}x${size.height}-${Math.round(progress * 1000000)}-v1`;
}
export function thumbnailSize(size: ThumbnailSize): ThumbnailSize {
  if (
    !Number.isInteger(size.width) ||
    !Number.isInteger(size.height) ||
    size.width < 1 ||
    size.height < 1 ||
    size.width > 2048 ||
    size.height > 2048
  )
    throw Error('Thumbnail dimensions must be integers from 1 to 2048');
  return { width: size.width, height: size.height };
}
