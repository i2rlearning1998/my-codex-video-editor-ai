import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../src/ui/example';
import { MemoryBackend, ProjectLibrary } from '../src/persistence/projects';
import { TabGuard, type TabChannel } from '../src/persistence/tab-guard';
import { Autosave, LocalProjectStore } from '../src/persistence/local';
import { EditorEngine } from '../src/core';

const clock = () => {
  let n = 0;
  return () => new Date(Date.UTC(2026, 9, 29, 10, 0, n++));
};

describe('[PRJ-015] the Projects library keeps every project', () => {
  it('[PRJ-015] saves, lists newest first, renames, duplicates and removes', async () => {
    const library = new ProjectLibrary(new MemoryBackend(), clock());
    const first = createExampleProject();
    const second = {
      ...JSON.parse(JSON.stringify(first)),
      id: 'second',
      metadata: { ...first.metadata, name: 'Second' },
    };
    await library.save(first, 'data:image/jpeg;base64,AAA');
    await library.save(second);
    let list = await library.list();
    expect(list.map((item) => item.id)).toEqual(['second', first.id]);
    expect(list[1]!.thumb).toBe('data:image/jpeg;base64,AAA');
    // A save without a picture keeps the earlier one.
    await library.save(first);
    list = await library.list();
    expect(list[0]!.id).toBe(first.id);
    expect(list[0]!.thumb).toContain('AAA');

    expect(await library.rename('second', 'Renamed')).toBe(true);
    expect(await library.rename('second', '   ')).toBe(false);
    expect((await library.open('second'))!.metadata.name).toBe('Renamed');

    const copyId = await library.duplicate('second', 'copy');
    expect(copyId).not.toBe('second');
    const copy = (await library.open(copyId!))!;
    expect(copy.id).toBe(copyId);
    expect(copy.metadata.name).toBe('Renamed copy');
    expect((await library.open('second'))!.metadata.name).toBe('Renamed');

    await library.remove('second');
    expect(await library.open('second')).toBeNull();
    expect((await library.list()).map((item) => item.id)).not.toContain(
      'second',
    );
  });
});

class FakeBus {
  readonly channels: FakeChannel[] = [];
  channel() {
    const channel = new FakeChannel(this);
    this.channels.push(channel);
    return channel;
  }
}
class FakeChannel implements TabChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(private readonly bus: FakeBus) {}
  postMessage(message: unknown) {
    for (const other of this.bus.channels)
      if (other !== this)
        other.onmessage?.({ data: structuredClone(message) } as MessageEvent);
  }
  close() {
    /* nothing to release */
  }
}

describe('[APP-019] two tabs never overwrite silently', () => {
  it('[APP-019] a new tab hears that the project is open, and a save in the other tab is reported', () => {
    const bus = new FakeBus();
    const seen: string[] = [];
    const a = new TabGuard(
      bus.channel(),
      () => 'p1',
      (kind) => seen.push(`a:${kind}`),
    );
    const b = new TabGuard(
      bus.channel(),
      () => 'p1',
      (kind) => seen.push(`b:${kind}`),
    );
    const other = new TabGuard(
      bus.channel(),
      () => 'p2',
      (kind) => seen.push(`c:${kind}`),
    );
    b.announce();
    expect(seen).toEqual(['b:open-elsewhere']);
    seen.length = 0;
    a.saved();
    expect(seen).toEqual(['b:saved-elsewhere']);
    other.announce();
    other.saved();
    expect(seen).toEqual(['b:saved-elsewhere']);
  });
});

describe('[APP-018] a pending save is known, and can be held back', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };
  it('[APP-018] pending is true from an edit until the save lands; pause blocks writes', () => {
    const storage = memory();
    const engine = new EditorEngine(createExampleProject());
    const autosave = new Autosave(engine, new LocalProjectStore(storage), {
      delayMs: 10_000,
    });
    expect(autosave.pending).toBe(false);
    engine.library('Rename', [{ type: 'SET_PROJECT_NAME', name: 'A' }]);
    expect(autosave.pending).toBe(true);
    autosave.pause();
    expect(autosave.flush()).toBe(false);
    expect(storage.getItem('ai-native-editor:project')).toBeNull();
    autosave.resume();
    expect(autosave.pending).toBe(false);
    expect(storage.getItem('ai-native-editor:project')).toContain('"A"');
    autosave.dispose();
  });
});
