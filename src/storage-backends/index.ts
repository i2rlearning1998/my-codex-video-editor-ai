// P3-WIRING (W7): where a person's files live. Three backends behind one
// StorageBackend interface (src/contracts/p3.ts):
//   platform  the person's cloud media, through CloudBackend (Supabase later);
//   local     this browser's media store (OPFS, IndexedDB fallback; D-004);
//   drive     Google Drive (REST v3, `drive.file` scope; the caller supplies
//             the OAuth token). Proven against a local fake of the Drive API
//             only: live Drive is UNPROVEN.
// Every `put` respects the plan's storage limit (usage + new bytes).
import type { StorageBackend, StorageBackendId } from '../contracts/p3';
import type { CloudBackend } from '../cloud/backend';
import type { MediaStore } from '../media/store';

export class StorageLimitError extends Error {
  readonly failure;
  constructor(limitBytes: number) {
    const mb = Math.round(limitBytes / 1048576);
    super(`Your plan stores up to ${mb} MB. Free some space or upgrade.`);
    this.name = 'StorageLimitError';
    this.failure = {
      code: 'limit-storage',
      message: {
        en: this.message,
        hi: `आपका प्लान ${mb} MB तक रखता है। जगह खाली करें या अपग्रेड करें।`,
      },
      upgrade: '/credits',
    } as const;
  }
}

export interface StorageDeps {
  /** The plan's storage limit in bytes (null: none). */
  readonly limitBytes: () => number | null;
  /** platform */
  readonly cloud?: CloudBackend;
  /** local */
  readonly media?: MediaStore;
  /** drive: the caller's OAuth access token (drive.file scope). */
  readonly driveToken?: () => Promise<string | null> | string | null;
  readonly fetch?: typeof fetch;
  /** Drive API base (the fake in tests). */
  readonly driveBase?: string;
  readonly driveUploadBase?: string;
  /** The Drive folder the app keeps its files in. */
  readonly driveFolder?: string;
}

const enc = new TextEncoder();
const toHex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (s: string) =>
  toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const b64url = (s: string) =>
  btoa(String.fromCharCode(...enc.encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const unb64url = (s: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
      c.charCodeAt(0),
    ),
  );
const blobOf = (bytes: Uint8Array, mime: string) =>
  new Blob([bytes as BlobPart], { type: mime });
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
function checkPath(path: string) {
  if (!path || path.length > 300 || path.startsWith('/') || path.includes('..'))
    throw new Error('That file path is not valid.');
}

/** Wraps put with the plan's storage limit (usage + new bytes). */
function limited(b: StorageBackend, d: StorageDeps): StorageBackend {
  return {
    ...b,
    async put(path, bytes, mime) {
      checkPath(path);
      const limit = d.limitBytes();
      if (limit !== null) {
        const use = await b.usage();
        const old = (await b.list(path)).find((x) => x.path === path);
        if (use.bytes - (old?.bytes ?? 0) + bytes.length > limit)
          throw new StorageLimitError(limit);
      }
      return b.put(path, bytes, mime);
    },
    async usage() {
      return { ...(await b.usage()), limitBytes: d.limitBytes() };
    },
  };
}

/** local: the existing media store. Paths become `stored/<base64url path>`. */
function localBackend(media: MediaStore): StorageBackend {
  const FOLDER = 'stored';
  const keyOf = (path: string) => {
    const name = b64url(path);
    if (name.length > 128) throw new Error('That file path is too long.');
    return `${FOLDER}/${name}`;
  };
  const all = async () => {
    const out: { path: string; bytes: number }[] = [];
    for (const k of await media.keys()) {
      if (!k.startsWith(`${FOLDER}/`)) continue;
      const blob = await media.read(k);
      if (blob)
        out.push({
          path: unb64url(k.slice(FOLDER.length + 1)),
          bytes: blob.size,
        });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  };
  return {
    id: 'local',
    connected: async () => true,
    put: (path, bytes, mime) => media.write(keyOf(path), blobOf(bytes, mime)),
    async get(path) {
      const blob = await media.read(keyOf(path));
      return blob ? bytesOf(blob) : null;
    },
    list: async (prefix) =>
      (await all()).filter((x) => x.path.startsWith(prefix)),
    remove: (path) => media.remove(keyOf(path)),
    usage: async () => ({
      bytes: (await all()).reduce((s, x) => s + x.bytes, 0),
      limitBytes: null,
    }),
  };
}

/** platform: CloudBackend media; the row's name is the path. */
function platformBackend(cloud: CloudBackend): StorageBackend {
  const fp = async (path: string) => `p3-${(await sha(path)).slice(0, 40)}`;
  const mine = async () =>
    (await cloud.listMedia()).filter((r) => r.fingerprint.startsWith('p3-'));
  return {
    id: 'platform',
    connected: async () => !!(await cloud.user().catch(() => null)),
    async put(path, bytes, mime) {
      const f = await fp(path);
      if ((await cloud.hasMedia([f])).has(f)) await cloud.deleteMedia(f);
      await cloud.uploadMedia(f, blobOf(bytes, mime), {
        name: path,
        mimeType: mime,
        size: bytes.length,
      });
    },
    async get(path) {
      const f = await fp(path);
      if (!(await cloud.hasMedia([f])).has(f)) return null;
      return bytesOf(await cloud.downloadMedia(f));
    },
    list: async (prefix) =>
      (await mine())
        .filter((r) => r.name.startsWith(prefix))
        .map((r) => ({ path: r.name, bytes: r.size }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    async remove(path) {
      await cloud.deleteMedia(await fp(path));
    },
    usage: async () => ({
      bytes: (await mine()).reduce((s, r) => s + r.size, 0),
      limitBytes: null,
    }),
  };
}

/** drive: Google Drive REST v3 in one app folder (drive.file scope). */
function driveBackend(d: StorageDeps): StorageBackend {
  const f = d.fetch ?? fetch;
  const api = (d.driveBase ?? 'https://www.googleapis.com/drive/v3').replace(
    /\/$/,
    '',
  );
  const upload = (
    d.driveUploadBase ?? 'https://www.googleapis.com/upload/drive/v3'
  ).replace(/\/$/, '');
  const folderName = d.driveFolder ?? 'AI-Native';
  let folderId: string | null = null;
  const token = async () => {
    const t = await d.driveToken?.();
    if (!t) throw new Error('Google Drive is not connected.');
    return t;
  };
  const call = async (url: string, init: RequestInit = {}) => {
    const res = await f(url, {
      ...init,
      headers: {
        authorization: `Bearer ${await token()}`,
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 401 || res.status === 403)
      throw new Error('Google Drive refused the request. Connect it again.');
    if (!res.ok && res.status !== 404)
      throw new Error(`Google Drive had a problem (${res.status}).`);
    return res;
  };
  const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  async function folder(): Promise<string> {
    if (folderId) return folderId;
    const found = (await (
      await call(
        `${api}/files?q=${encodeURIComponent(`name='${q(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)`,
      )
    ).json()) as { files?: { id: string }[] };
    if (found.files?.[0]) return (folderId = found.files[0].id);
    const made = (await (
      await call(`${api}/files?fields=id`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      })
    ).json()) as { id: string };
    return (folderId = made.id);
  }
  async function files(): Promise<
    { id: string; name: string; size: number }[]
  > {
    const parent = await folder();
    const out: { id: string; name: string; size: number }[] = [];
    let page = '';
    do {
      const r = (await (
        await call(
          `${api}/files?q=${encodeURIComponent(`'${parent}' in parents and trashed=false`)}&fields=nextPageToken,files(id,name,size)&pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`,
        )
      ).json()) as {
        files?: { id: string; name: string; size?: string }[];
        nextPageToken?: string;
      };
      for (const x of r.files ?? [])
        out.push({ id: x.id, name: x.name, size: Number(x.size ?? 0) });
      page = r.nextPageToken ?? '';
    } while (page);
    return out;
  }
  const byPath = async (path: string) =>
    (await files()).find((x) => x.name === path) ?? null;
  return {
    id: 'drive',
    connected: async () => !!(await d.driveToken?.()),
    async put(path, bytes, mime) {
      const old = await byPath(path);
      if (old) {
        await call(`${upload}/files/${old.id}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'content-type': mime },
          body: blobOf(bytes, mime),
        });
        return;
      }
      const boundary = `aive${Math.random().toString(36).slice(2)}`;
      const meta = JSON.stringify({ name: path, parents: [await folder()] });
      const body = new Blob([
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`,
        bytes as BlobPart,
        `\r\n--${boundary}--`,
      ]);
      await call(`${upload}/files?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { 'content-type': `multipart/related; boundary=${boundary}` },
        body,
      });
    },
    async get(path) {
      const x = await byPath(path);
      if (!x) return null;
      const r = await call(`${api}/files/${x.id}?alt=media`);
      return r.status === 404 ? null : new Uint8Array(await r.arrayBuffer());
    },
    list: async (prefix) =>
      (await files())
        .filter((x) => x.name.startsWith(prefix))
        .map((x) => ({ path: x.name, bytes: x.size }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    async remove(path) {
      const x = await byPath(path);
      if (x) await call(`${api}/files/${x.id}`, { method: 'DELETE' });
    },
    usage: async () => ({
      bytes: (await files()).reduce((s, x) => s + x.size, 0),
      limitBytes: null,
    }),
  };
}

export function createStorageBackend(
  id: StorageBackendId,
  deps: StorageDeps,
): StorageBackend {
  if (id === 'local') {
    if (!deps.media) throw new Error('This browser has no media store.');
    return limited(localBackend(deps.media), deps);
  }
  if (id === 'platform') {
    if (!deps.cloud) throw new Error('No account is connected.');
    return limited(platformBackend(deps.cloud), deps);
  }
  return limited(driveBackend(deps), deps);
}

/** The person's choice, kept in this browser's prefs (default: platform). */
type Prefs = Pick<Storage, 'getItem' | 'setItem'>;
const PREF = (userId: string) => `aive.storage.${userId}`;
const IDS: readonly StorageBackendId[] = ['platform', 'local', 'drive'];
export function storageChoice(prefs: Prefs, userId: string): StorageBackendId {
  const v = prefs.getItem(PREF(userId));
  return (IDS as readonly string[]).includes(v ?? '')
    ? (v as StorageBackendId)
    : 'platform';
}
export function setStorageChoice(
  prefs: Prefs,
  userId: string,
  id: StorageBackendId,
): void {
  prefs.setItem(PREF(userId), id);
}
