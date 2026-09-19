import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorEngine,
  createLayer,
  createProject,
  serializeProject,
  FutureSchemaError,
} from '../src/core';
import {
  Autosave,
  LocalProjectStore,
  type StorageAdapter,
} from '../src/persistence/local';

class MemoryStorage implements StorageAdapter {
  data = new Map<string, string>();
  failOn: string | undefined;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (key === this.failOn) throw new Error('Quota exceeded');
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}
const key = 'test-project';
function setup() {
  const storage = new MemoryStorage();
  const store = new LocalProjectStore(storage, key);
  const engine = new EditorEngine(createProject());
  const add = (id: string) =>
    engine.commands.execute({
      type: 'CREATE_LAYER',
      compositionId: engine.state.compositions[0]!.id,
      parentId: null,
      layer: createLayer(id, 'text', id),
    });
  return { storage, store, engine, add };
}
afterEach(() => {
  vi.useRealTimers();
});
describe('local development persistence', () => {
  it('returns an empty slot and saves/loads a project', () => {
    const { store, engine } = setup();
    expect(store.load().project).toBeNull();
    store.save(engine.state);
    expect(store.load()).toEqual({
      project: engine.state,
      recovered: false,
      warning: null,
    });
  });
  it('recovers the prior good project from a corrupted primary and quarantines it on save', () => {
    const { store, storage, engine, add } = setup();
    store.save(engine.state);
    const original = engine.state;
    add('a');
    store.save(engine.state);
    storage.setItem(key, 'corrupt');
    expect(store.load()).toMatchObject({ project: original, recovered: true });
    store.save(original);
    expect(storage.getItem(`${key}:recovery`)).toBe('corrupt');
    expect(store.load().project).toEqual(original);
  });
  it('fails safely on quota errors during backup or primary write', () => {
    const { store, storage, engine, add } = setup();
    store.save(engine.state);
    const saved = storage.getItem(key);
    add('a');
    storage.failOn = `${key}:backup`;
    expect(() => store.save(engine.state)).toThrow(/Quota/);
    expect(storage.getItem(key)).toBe(saved);
    storage.failOn = key;
    expect(() => store.save(engine.state)).toThrow(/Quota/);
    expect(storage.getItem(`${key}:backup`)).toBe(saved);
  });
  it('never overwrites or falls back past a future-version primary', () => {
    const { store, storage, engine } = setup();
    const future = JSON.stringify({ ...engine.state, schemaVersion: 99 });
    storage.setItem(key, future);
    storage.setItem(`${key}:backup`, serializeProject(engine.state));
    expect(() => store.load()).toThrow(FutureSchemaError);
    expect(() => store.save(engine.state)).toThrow(FutureSchemaError);
    expect(storage.getItem(key)).toBe(future);
  });
  it('surfaces unrecoverable corruption and storage access failures', () => {
    const { store, storage } = setup();
    storage.setItem(key, 'bad');
    expect(() => store.load()).toThrow(/recover/);
    storage.setItem(`${key}:backup`, 'also bad');
    expect(() => store.load()).toThrow();
    const inaccessible = new LocalProjectStore({
      getItem() {
        throw new Error('Denied');
      },
      setItem() {},
      removeItem() {},
    });
    expect(() => inaccessible.load()).toThrow(/Denied/);
  });
  it('debounces commits, persists undo and stops after disposal', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { store, engine, add } = setup();
    const saved = vi.fn();
    const autosave = new Autosave(engine, store, {
      delayMs: 100,
      onSaved: saved,
    });
    add('a');
    add('b');
    vi.advanceTimersByTime(99);
    expect(store.load().project).toBeNull();
    vi.advanceTimersByTime(1);
    expect(saved).toHaveBeenCalledOnce();
    expect(store.load().project).toEqual(engine.state);
    engine.undo();
    autosave.flush();
    expect(store.load().project).toEqual(engine.state);
    autosave.dispose();
    add('c');
    vi.runAllTimers();
    expect(saved).toHaveBeenCalledTimes(2);
  });
  it('keeps failed autosaves dirty for an explicit retry', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { store, storage, engine, add } = setup();
    const onError = vi.fn();
    const autosave = new Autosave(engine, store, { delayMs: 10, onError });
    storage.failOn = key;
    add('a');
    vi.runAllTimers();
    expect(onError).toHaveBeenCalledOnce();
    storage.failOn = undefined;
    expect(autosave.flush()).toBe(true);
    expect(store.load().project).toEqual(engine.state);
    autosave.dispose();
  });
});
