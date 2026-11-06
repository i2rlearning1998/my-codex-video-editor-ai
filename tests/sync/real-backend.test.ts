import { describe, expect, it } from 'vitest';
import { localAccountBackend, memoryBlobStore } from '../../src/cloud/local';
import { CloudQuotaError, assertRoom } from '../../src/cloud/backend';
import { realSyncBackend, syncFailure } from '../../src/sync/real-backend';

const kv = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};
let n = 0;
async function setup(limit: number | null = null) {
  const storage = kv();
  const cloud = localAccountBackend({
    storage,
    blobs: memoryBlobStore(),
    random: () => (++n).toString(16).padStart(8, '0'),
  });
  await cloud.signUp('asha@example.com', 'correct horse');
  let doc = '{"v":1,"a":"first"}';
  let items = [{ id: 't1', name: 'Lower third', document: '{"x":1}' }];
  let media: {
    fingerprint: string;
    blob: Blob;
    info: { name: string; mimeType: string; size: number };
  }[] = [];
  const real = realSyncBackend({
    cloud: async () => cloud,
    limitBytes: () => limit,
    signedIn: () => true,
    storage,
    collect: {
      project: () => ({
        name: 'Lesson',
        schemaVersion: 9,
        document: doc,
        thumbnail: null,
      }),
      library: (group) => (group === 'templates' ? items : []),
      media: async () => media,
    },
  });
  return {
    cloud,
    real,
    setDoc: (d: string) => (doc = d),
    setItems: (i: typeof items) => (items = i),
    setMedia: (m: typeof media) => (media = m),
  };
}
const size = { count: 0, bytes: 0 };

describe('P4 real cloud sync', () => {
  it('sends the project once, then a save on the same cloud row; an unchanged project sends nothing', async () => {
    const s = await setup();
    await s.real.push('p1', 'project', size);
    await s.real.push('p1', 'project', size);
    const list = await s.cloud.listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]!.revision).toBe(1);
    s.setDoc('{"v":1,"a":"second"}');
    await s.real.push('p1', 'project', size);
    const after = await s.cloud.listProjects();
    expect(after).toHaveLength(1);
    expect(after[0]!.revision).toBe(2);
  });

  it('sends My Templates as library rows and only the changed ones again', async () => {
    const s = await setup();
    await s.real.push('p1', 'templates', size);
    let rows = await s.cloud.listLibrary();
    expect(rows.map((r) => [r.id, r.kind, r.projectId])).toEqual([
      ['p1:templates:t1', 'templates', 'p1'],
    ]);
    const first = rows[0]!.updatedAt;
    await s.real.push('p1', 'templates', size);
    rows = await s.cloud.listLibrary();
    expect(rows[0]!.updatedAt).toBe(first);
    s.setItems([
      { id: 't1', name: 'Lower third', document: '{"x":2}' },
      { id: 't2', name: 'Title', document: '{"y":1}' },
    ]);
    await s.real.push('p1', 'templates', size);
    expect((await s.cloud.listLibrary()).map((r) => r.id).sort()).toEqual([
      'p1:templates:t1',
      'p1:templates:t2',
    ]);
  });

  it('stops with a quota error before sending anything when the plan has no room, and counts usage', async () => {
    const s = await setup(10);
    await expect(s.real.push('p1', 'project', size)).rejects.toBeInstanceOf(
      CloudQuotaError,
    );
    expect(await s.cloud.listProjects()).toHaveLength(0);
    const roomy = await setup(10_000);
    await roomy.real.push('p1', 'project', size);
    await roomy.real.push('p1', 'templates', size);
    const usage = await roomy.cloud.usage();
    expect(usage.projects).toBe(1);
    expect(usage.library).toBe(1);
    expect(usage.bytes).toBeGreaterThan(0);
    await expect(assertRoom(roomy.cloud, usage.bytes + 5, 10)).rejects.toThrow(
      'no room',
    );
    await assertRoom(roomy.cloud, null, 1e12);
  });

  it('uploads only media the cloud does not have and counts it against the space', async () => {
    const s = await setup(100);
    const file = (fp: string, bytes: number) => ({
      fingerprint: fp,
      blob: new Blob([new Uint8Array(bytes)]),
      info: { name: `${fp}.png`, mimeType: 'image/png', size: bytes },
    });
    s.setMedia([file('aaaaaaaa', 40)]);
    await s.real.push('p1', 'media', size);
    expect((await s.cloud.listMedia()).map((m) => m.fingerprint)).toEqual([
      'aaaaaaaa',
    ]);
    s.setMedia([file('aaaaaaaa', 40), file('bbbbbbbb', 80)]);
    await expect(s.real.push('p1', 'media', size)).rejects.toBeInstanceOf(
      CloudQuotaError,
    );
    expect(await s.cloud.listMedia()).toHaveLength(1);
  });

  it('sends nothing without a signed-in person, and says why a send failed in one sentence', async () => {
    const storage = kv();
    const cloud = localAccountBackend({ storage, blobs: memoryBlobStore() });
    const real = realSyncBackend({
      cloud: async () => cloud,
      limitBytes: () => null,
      signedIn: () => false,
      storage,
      collect: {
        project: () => {
          throw new Error('must not be read');
        },
        library: () => [],
        media: async () => [],
      },
    });
    expect(real.connected).toBe(false);
    await real.push('p1', 'project', size);
    expect(
      syncFailure(new CloudQuotaError(5 * 1_048_576, 10 * 1_048_576, 1)).params,
    ).toEqual({
      used: '5 MB',
      limit: '10 MB',
    });
    expect(syncFailure(new Error('boom')).key).toBe('cloud.exit.failed');
  });
});
