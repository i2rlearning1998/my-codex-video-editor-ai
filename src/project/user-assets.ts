// ROUND-A A3: the person's Asset Library rows (Director builds, Studio
// results, uploads), read by the editor's "Import from your Library" dialog.
// The panel writes them (src/panel/services.ts); this file only reads, so the
// editor never loads panel code. Rows without bytes in this browser (a data
// URL) cannot be copied and are left out.
export const USER_ASSETS_KEY = 'aive.panel.assets';

export interface UserAsset {
  readonly id: string;
  readonly name: string;
  readonly kind: 'image' | 'video' | 'audio';
  /** A Video id, or '' / 'unsorted' for Studio Libraries. */
  readonly projectId: string;
  readonly studioId: string;
  readonly studioName?: string;
  readonly dataUrl: string;
  readonly createdAt: string;
}

const MEDIA = new Set(['image', 'video', 'audio']);

/** This person's media rows that can be copied into a project. */
export function readUserAssets(
  storage: Pick<Storage, 'getItem'>,
  userId: string,
): UserAsset[] {
  let rows: unknown;
  try {
    rows = JSON.parse(storage.getItem(USER_ASSETS_KEY) ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    const a = r as Partial<UserAsset> & {
      userId?: string;
      trashedAt?: string;
    };
    if (
      a.userId !== userId ||
      a.trashedAt ||
      typeof a.id !== 'string' ||
      typeof a.name !== 'string' ||
      !MEDIA.has(String(a.kind)) ||
      typeof a.dataUrl !== 'string' ||
      !a.dataUrl.startsWith('data:')
    )
      return [];
    return [
      {
        id: a.id,
        name: a.name,
        kind: a.kind as UserAsset['kind'],
        projectId: typeof a.projectId === 'string' ? a.projectId : '',
        studioId: typeof a.studioId === 'string' ? a.studioId : '',
        ...(typeof a.studioName === 'string'
          ? { studioName: a.studioName }
          : {}),
        dataUrl: a.dataUrl,
        createdAt: typeof a.createdAt === 'string' ? a.createdAt : '',
      },
    ];
  });
}

/** A file name with the extension the data URL's type implies. */
export function fileNameFor(a: Pick<UserAsset, 'name' | 'dataUrl'>): string {
  const mime = /^data:([^;,]+)/.exec(a.dataUrl)?.[1] ?? '';
  const ext =
    {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/x-wav': 'wav',
      'audio/mpeg': 'mp3',
      'audio/webm': 'webm',
      'video/webm': 'webm',
      'video/mp4': 'mp4',
    }[mime] ?? '';
  return ext && !new RegExp(`\\.${ext}$`, 'i').test(a.name)
    ? `${a.name}.${ext}`
    : a.name;
}
