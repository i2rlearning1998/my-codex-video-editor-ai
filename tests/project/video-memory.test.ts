// ROUND-B B1: the memory levels, chats per Video and the migration.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAPS,
  MemoryStore,
  type OldChat,
} from '../../src/project/video-memory';

const kv = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
let clock = 0;
const now = () => new Date(Date.UTC(2026, 10, 13, 0, 0, clock++));
const store = (s = kv(), caps = DEFAULT_CAPS) =>
  new MemoryStore(s, 'u1', () => caps, now);

describe('[RDB-004] memory levels', () => {
  it('[RDB-004] keeps account, Project memory, Video sheet, file notes and chats apart, and survives a reload', () => {
    const s = kv();
    const a = store(s);
    a.setVoice('warm female');
    a.addFact('p1', 'Always end with a call to action');
    a.note('v1', 'brief', 'Topic: rain');
    a.note('v2', 'brief', 'Topic: wind');
    a.fileNote('v1', { name: 'ch.pdf', kind: 'pdf', bytes: 10 }, 'water cycle');
    const b = store(s);
    expect(b.voice()).toBe('warm female');
    expect(b.facts('p1').map((f) => f.text)).toEqual([
      'Always end with a call to action',
    ]);
    expect(b.facts('p2')).toEqual([]);
    expect(b.sheet('v1').brief.map((e) => e.text)).toEqual(['Topic: rain']);
    expect(b.sheet('v2').brief.map((e) => e.text)).toEqual(['Topic: wind']);
    expect(b.video('v1').notes).toHaveLength(1);
    expect(b.video('v2').notes).toHaveLength(0);
  });
  it('[RDB-004] a file is noted once: the same file again returns the first note', () => {
    const a = store();
    const file = { name: 'a.png', kind: 'image', bytes: 5 };
    const one = a.fileNote('v1', file, 'a kite');
    const two = a.fileNote('v1', file, 'other');
    expect(two.id).toBe(one.id);
    expect(a.noteFor('v1', { name: 'a.png', bytes: 5 })?.note).toBe('a kite');
  });
  it('[RDB-004] two chats in one Video share the sheet; a new chat starts with it', () => {
    const a = store();
    const c1 = a.newChat('v1');
    a.addTurn('v1', c1.id, { role: 'user', text: 'make it blue' });
    a.note('v1', 'decisions', 'Title is blue');
    const c2 = a.newChat('v1');
    expect(c2.turns).toEqual([]);
    expect(a.chats('v1')).toHaveLength(2);
    expect(a.sheet('v1').decisions.map((e) => e.text)).toEqual([
      'Title is blue',
    ]);
    // Chats of another Video are separate.
    expect(a.chats('v2')).toHaveLength(0);
  });
  it('[RDB-004] a long chat rolls old turns into its summary and keeps the newest', () => {
    const a = store(kv(), { ...DEFAULT_CAPS, keepTurns: 4 });
    const c = a.newChat('v1');
    for (let i = 1; i <= 30; i++)
      a.addTurn('v1', c.id, {
        role: i % 2 ? 'user' : 'director',
        text: `line ${i}`,
      });
    const chat = a.chat('v1', c.id)!;
    expect(chat.turns.map((t) => t.text)).toEqual([
      'line 27',
      'line 28',
      'line 29',
      'line 30',
    ]);
    expect(chat.summary).toContain('Person: line 1');
    expect(chat.summary).toContain('Director: line 26');
    expect(chat.title).toBe('line 1');
  });
  it('[RDB-004] caps: pinned lines stay when the sheet is full', () => {
    const a = store(kv(), { ...DEFAULT_CAPS, maxSheetEntries: 5 });
    const first = a.note('v1', 'decisions', 'keep me')!;
    a.patchEntry('v1', 'decisions', first.id, { pinned: true });
    for (let i = 0; i < 9; i++) a.note('v1', 'decisions', `d${i}`);
    const texts = a.sheet('v1').decisions.map((e) => e.text);
    expect(texts).toHaveLength(5);
    expect(texts).toContain('keep me');
    expect(texts).toContain('d8');
    expect(texts).not.toContain('d0');
  });
  it('[RDB-004] setPart replaces a part but keeps what the person pinned or wrote', () => {
    const a = store();
    a.setPart('v1', 'scenes', ['Scene 1: a', 'Scene 2: b']);
    const mine = a.note('v1', 'scenes', 'Scene 2 must be slow', 'user')!;
    a.setPart('v1', 'scenes', ['Scene 1: a', 'Scene 2: c']);
    expect(a.sheet('v1').scenes.map((e) => e.text)).toEqual([
      'Scene 1: a',
      'Scene 2: c',
      'Scene 2 must be slow',
    ]);
    a.forgetEntry('v1', 'scenes', mine.id);
    expect(a.sheet('v1').scenes).toHaveLength(2);
  });
  it('[RDB-004] reconcile: a change undone in the editor leaves the sheet', () => {
    const a = store();
    a.note('v1', 'decisions', 'Title bigger', 'director', {
      before: { l1: 'h0' },
      after: { l1: 'h1' },
    });
    a.setTouched('v1', { l1: 'h1' });
    expect(a.reconcile('v1', { l1: 'h1' })).toEqual([]);
    expect(a.reconcile('v1', { l1: 'h0' })).toEqual(['Title bigger']);
    expect(a.sheet('v1').decisions).toEqual([]);
    expect(a.touched('v1').l1).toBe('h0');
  });
});

describe('[RDB-004] P3 chats move from the Project to its first Video', () => {
  const chat = (id: string, projectId: string): OldChat => ({
    id,
    projectId,
    title: `chat ${id}`,
    messages: [
      {
        id: `${id}-1`,
        role: 'user',
        text: 'hello',
        at: '2026-11-05T00:00:00Z',
      },
      {
        id: `${id}-2`,
        role: 'assistant',
        text: 'namaste',
        at: '2026-11-05T00:00:01Z',
      },
    ],
    summary: { text: 'older talk' },
    updatedAt: '2026-11-05T00:00:01Z',
  });
  const old = {
    chats: [chat('c1', 'pr-a'), chat('c2', 'pr-a'), chat('c3', 'orphan')],
    facts: { 'pr-a': [{ text: 'likes blue', pinned: true, source: 'chat' }] },
  };
  const first = (p: string) => (p === 'pr-a' ? 'video-1' : undefined);
  it('[RDB-004] moves chats and facts once; a second run changes nothing', () => {
    const s = kv();
    const a = store(s);
    expect(a.migrateOld(old, first)).toEqual({ chats: 3, facts: 1 });
    expect(a.chats('video-1').map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(a.chats('video-1')[0]!.turns.map((t) => t.role)).toEqual([
      'user',
      'director',
    ]);
    expect(a.chats('video-1')[0]!.summary).toBe('older talk');
    // A chat whose Project has no Video keeps its key (nothing is lost).
    expect(a.chats('orphan').map((c) => c.id)).toEqual(['c3']);
    expect(a.facts('pr-a')[0]).toMatchObject({
      text: 'likes blue',
      pinned: true,
    });
    const before = JSON.stringify(a.doc());
    expect(a.migrateOld(old, first)).toEqual({ chats: 0, facts: 0 });
    expect(JSON.stringify(a.doc())).toBe(before);
    expect(store(s).chats('video-1')).toHaveLength(2);
  });
});
