import { describe, expect, it, vi } from 'vitest';
import {
  createCloudSync,
  localBackend,
  type SyncGroup,
} from '../../src/sync/cloud-sync';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};
const setup = () => {
  const storage = memoryStorage();
  const pushes: [string, SyncGroup][] = [];
  const backend = {
    connected: false,
    async push(project: string, group: SyncGroup) {
      pushes.push([project, group]);
    },
  };
  const sync = createCloudSync({
    storage,
    backend,
    projectId: () => 'p1',
    measure: (group) => ({ count: 1, bytes: group === 'media' ? 5000 : 10 }),
    debounceMs: 10,
  });
  return { sync, pushes, storage };
};

describe('Cloud sync switch', () => {
  it('[FX10-008] OFF sends nothing; turning it ON sends every chosen group once, then later changes follow', async () => {
    vi.useFakeTimers();
    const { sync, pushes } = setup();
    sync.changed();
    await vi.advanceTimersByTimeAsync(50);
    expect(pushes).toEqual([]);
    expect(sync.status()).toBe('off');

    await sync.setGroup('ai', false);
    expect(pushes).toEqual([]); // still off
    await sync.setOn(true);
    expect(pushes.map(([, group]) => group)).toEqual([
      'project',
      'media',
      'templates',
    ]);
    // Not connected yet: the status says it is waiting for an account.
    expect(sync.status()).toBe('waiting');

    pushes.length = 0;
    sync.changed();
    await vi.advanceTimersByTimeAsync(50);
    expect(pushes.length).toBe(3);
    vi.useRealTimers();
  });

  it('[FX10-008] the choice is kept, the exit dialog Save sends once without turning the switch on, and the local backend records what was handed over', async () => {
    const storage = memoryStorage();
    const backend = localBackend(storage);
    const make = () =>
      createCloudSync({
        storage,
        backend,
        projectId: () => 'p9',
        measure: () => ({ count: 2, bytes: 300 }),
      });
    const first = make();
    await first.setGroup('media', false);
    expect(first.settings().on).toBe(false);
    await first.syncNow();
    expect(first.settings().on).toBe(false);
    expect(first.status()).toBe('off');
    expect(Object.keys(backend.manifest().p9!).sort()).toEqual([
      'ai',
      'project',
      'templates',
    ]);
    // A new editor session reads the same choice.
    const second = make();
    expect(second.settings().groups.media).toBe(false);
    expect(second.settings().groups.ai).toBe(true);
    expect(Object.keys(await second.sizes())).toEqual([
      'project',
      'media',
      'templates',
      'ai',
    ]);
  });
});
