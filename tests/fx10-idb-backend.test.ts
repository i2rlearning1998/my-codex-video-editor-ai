import { describe, expect, it, vi } from 'vitest';
import { IdbBackend } from '../src/persistence/projects';

function fakeIndexedDb() {
  const rows = new Map<string, unknown>();
  const connections: { closing: boolean }[] = [];
  const open = vi.fn(() => {
    const state = { closing: false };
    connections.push(state);
    const db = {
      onclose: null,
      onversionchange: null,
      close() {
        state.closing = true;
      },
      transaction() {
        if (state.closing)
          throw new DOMException(
            'The database connection is closing.',
            'InvalidStateError',
          );
        const answer = (result: unknown) => {
          const request: Record<string, unknown> = { result };
          queueMicrotask(() => (request.onsuccess as () => void)());
          return request;
        };
        return {
          objectStore: () => ({
            put(value: { id: string }) {
              rows.set(value.id, value);
              return answer(undefined);
            },
            getAll: () => answer([...rows.values()]),
          }),
        };
      },
    };
    const request: Record<string, unknown> = {};
    queueMicrotask(() => {
      request.result = db;
      (request.onsuccess as () => void)();
    });
    return request;
  });
  return { open, connections };
}

describe('Projects library storage', () => {
  it('[FX10-007] opens its connection again when the browser closed it, so a save still lands and the Projects list is not empty', async () => {
    const fake = fakeIndexedDb();
    vi.stubGlobal('indexedDB', { open: fake.open });
    const backend = new IdbBackend('test-projects');
    await backend.put({
      id: 'a',
      name: 'A',
      updated: '2026-10-31T00:00:00Z',
      json: '{}',
      thumb: '',
    });
    fake.connections[0]!.closing = true;
    await backend.put({
      id: 'b',
      name: 'B',
      updated: '2026-10-31T00:00:01Z',
      json: '{}',
      thumb: '',
    });
    expect((await backend.all()).map((row) => row.id).sort()).toEqual([
      'a',
      'b',
    ]);
    expect(fake.open).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
