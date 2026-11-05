// P3-WIRING W7: one contract test run on all three storage backends.
// platform: the local account backend (the CloudBackend interface);
// local: the media store (in memory here);
// drive: against a local FAKE of the Drive API (live Drive is unproven).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StorageBackend } from '../../src/contracts/p3';
import { localAccountBackend, memoryBlobStore } from '../../src/cloud/local';
import { MemoryMediaStore } from '../../src/media/store';
import {
  createStorageBackend,
  setStorageChoice,
  StorageLimitError,
  storageChoice,
  type StorageDeps,
} from '../../src/storage-backends';
import { startFakeDrive, type FakeDrive } from './fakes/drive';

let drive: FakeDrive;
beforeAll(async () => (drive = await startFakeDrive()));
afterAll(() => drive.close());

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
async function make(
  id: 'platform' | 'local' | 'drive',
  limitBytes: number | null,
): Promise<StorageBackend> {
  const base: StorageDeps = { limitBytes: () => limitBytes };
  if (id === 'local')
    return createStorageBackend('local', {
      ...base,
      media: new MemoryMediaStore(),
    });
  if (id === 'platform') {
    const cloud = localAccountBackend({
      storage: mem() as unknown as Storage,
      blobs: memoryBlobStore(),
    });
    await cloud.signUp(
      `p${Math.random().toString(36).slice(2)}@example.com`,
      'a-long-password-1',
    );
    return createStorageBackend('platform', { ...base, cloud });
  }
  return createStorageBackend('drive', {
    ...base,
    driveToken: () => drive.token,
    driveBase: `${drive.url}/drive/v3`,
    driveUploadBase: `${drive.url}/upload/drive/v3`,
    driveFolder: `AI-Native-${Math.random().toString(36).slice(2)}`,
  });
}
const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null);

describe.each(['platform', 'local', 'drive'] as const)(
  'P3-WIRING storage backend: %s',
  (id) => {
    it(`[P3W-027] put, get, list by prefix, replace, remove and usage behave the same (${id})`, async () => {
      const s = await make(id, null);
      expect(s.id).toBe(id);
      expect(await s.connected()).toBe(true);
      expect(await s.get('projects/p1/a.txt')).toBeNull();
      await s.put('projects/p1/a.txt', bytes('hello'), 'text/plain');
      await s.put(
        'projects/p1/b.bin',
        Uint8Array.of(0, 255, 13, 10, 1),
        'application/octet-stream',
      );
      await s.put('projects/p2/c.txt', bytes('other'), 'text/plain');
      expect(text(await s.get('projects/p1/a.txt'))).toBe('hello');
      expect([...(await s.get('projects/p1/b.bin'))!]).toEqual([
        0, 255, 13, 10, 1,
      ]);
      expect(await s.list('projects/p1/')).toEqual([
        { path: 'projects/p1/a.txt', bytes: 5 },
        { path: 'projects/p1/b.bin', bytes: 5 },
      ]);
      await s.put('projects/p1/a.txt', bytes('hello again'), 'text/plain');
      expect(text(await s.get('projects/p1/a.txt'))).toBe('hello again');
      expect((await s.usage()).bytes).toBe(11 + 5 + 5);
      await s.remove('projects/p1/b.bin');
      expect((await s.list('projects/')).map((x) => x.path)).toEqual([
        'projects/p1/a.txt',
        'projects/p2/c.txt',
      ]);
      expect(await s.get('projects/p1/b.bin')).toBeNull();
    });

    it(`[P3W-028] the plan's storage limit is respected on put (${id})`, async () => {
      const s = await make(id, 10);
      await s.put('a', bytes('12345'), 'text/plain');
      await expect(
        s.put('b', bytes('123456'), 'text/plain'),
      ).rejects.toBeInstanceOf(StorageLimitError);
      // Replacing a file counts only the difference.
      await s.put('a', bytes('1234567890'), 'text/plain');
      expect(await s.usage()).toEqual({ bytes: 10, limitBytes: 10 });
      const e = await s
        .put('c', bytes('x'), 'text/plain')
        .catch((x: StorageLimitError) => x);
      expect(e).toBeInstanceOf(StorageLimitError);
      expect((e as StorageLimitError).failure).toMatchObject({
        code: 'limit-storage',
        upgrade: '/credits',
      });
    });
  },
);

describe('P3-WIRING storage choice', () => {
  it('[P3W-029] the choice is per person and kept in prefs; Drive without a token is not connected', async () => {
    const p = mem();
    expect(storageChoice(p, 'u1')).toBe('platform');
    setStorageChoice(p, 'u1', 'drive');
    expect(storageChoice(p, 'u1')).toBe('drive');
    expect(storageChoice(p, 'u2')).toBe('platform');
    const d = createStorageBackend('drive', {
      limitBytes: () => null,
      driveToken: () => null,
      driveBase: `${drive.url}/drive/v3`,
    });
    expect(await d.connected()).toBe(false);
    await expect(d.list('')).rejects.toThrow('Google Drive is not connected.');
    const wrong = createStorageBackend('drive', {
      limitBytes: () => null,
      driveToken: () => 'wrong',
      driveBase: `${drive.url}/drive/v3`,
    });
    await expect(wrong.list('')).rejects.toThrow(
      'Google Drive refused the request.',
    );
  });
});
