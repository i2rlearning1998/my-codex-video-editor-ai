import { describe, expect, it, vi } from 'vitest';
import { IndexedDbMediaStore } from '../../src/media/store';

// A tiny IndexedDB stand-in: one blob table per connection family.
function fakeIndexedDb() {
  const data = new Map<string, unknown>();
  const connections: { closing: boolean; db: IDBDatabase }[] = [];
  const makeDb = () => {
    const state = { closing: false, db: undefined as unknown as IDBDatabase };
    const db = {
      onclose: null as null | (() => void),
      onversionchange: null as null | (() => void),
      close() {
        state.closing = true;
      },
      transaction() {
        if (state.closing)
          throw new DOMException(
            'The database connection is closing.',
            'InvalidStateError',
          );
        const transaction: Record<string, unknown> = {};
        transaction.objectStore = () => ({
          put(value: unknown, key: string) {
            data.set(key, value);
            return done(undefined);
          },
          get: (key: string) => done(data.get(key)),
        });
        const done = (result: unknown) => {
          const request = { result };
          queueMicrotask(() => (transaction.oncomplete as () => void)());
          return request;
        };
        return transaction;
      },
    } as unknown as IDBDatabase;
    state.db = db;
    connections.push(state);
    return db;
  };
  const open = vi.fn(() => {
    const request: Record<string, unknown> = {};
    queueMicrotask(() => {
      request.result = makeDb();
      (request.onsuccess as () => void)();
    });
    return request;
  });
  return { open, connections };
}

describe('IndexedDbMediaStore reopen', () => {
  it('[FX10-001] opens its connection again when the browser closed it, and the write still lands', async () => {
    const fake = fakeIndexedDb();
    vi.stubGlobal('indexedDB', { open: fake.open });
    const store = await IndexedDbMediaStore.open();
    await store.write('media/abc', new Blob(['one']));
    // The browser closes the connection (storage clean-up, version change).
    fake.connections[0]!.closing = true;
    await store.write('media/def', new Blob(['two']));
    expect(fake.open).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
