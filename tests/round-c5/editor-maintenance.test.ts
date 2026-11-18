// ROUND-C5 (1.6): the editor's cloud save while the platform is under
// maintenance. The edit made meanwhile stays in this browser; the send is
// refused with the owner's sentence and nothing reaches the cloud; once
// maintenance is off the same edit is sent.
import { describe, expect, it } from 'vitest';
import { realSyncBackend } from '../../src/sync/real-backend';
import { c5 } from '../../src/platform-config';

describe('[RDC5-015] the editor during maintenance', () => {
  it("[RDC5-015] mid-edit: a cloud save during maintenance is refused with the owner's sentence and sends nothing; the change is kept and sent once maintenance is off", async () => {
    let paused: string | null = c5('maintenance-refused');
    const saved: string[] = [];
    let doc = '{"name":"first"}';
    const store = new Map<string, string>();
    const backend = realSyncBackend({
      cloud: async () =>
        ({
          projectBytes: async () => 0,
          usedBytes: async () => 0,
          storageUsed: async () => 0,
          createProject: async (p: { document: string }) => {
            saved.push(p.document);
            return { id: 'c1', revision: 1 };
          },
          saveProject: async (
            _id: string,
            _rev: number,
            p: { document: string },
          ) => {
            saved.push(p.document);
            return { id: 'c1', revision: 2 };
          },
        }) as never,
      limitBytes: () => null,
      signedIn: () => true,
      storage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => void store.set(k, v),
      },
      collect: {
        project: () => ({
          name: 'P',
          schemaVersion: 9,
          document: doc,
          thumbnail: null,
        }),
        library: () => [],
        media: async () => [],
      },
      maintenance: async () => paused,
    });
    doc = '{"name":"edited during maintenance"}';
    await expect(
      backend.push('p1', 'project', { count: 1, bytes: 1 } as never),
    ).rejects.toThrow(c5('maintenance-refused'));
    expect(saved).toEqual([]);
    paused = null;
    await backend.push('p1', 'project', { count: 1, bytes: 1 } as never);
    expect(saved).toEqual(['{"name":"edited during maintenance"}']);
  });
});
