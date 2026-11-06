import { describe, expect, it } from 'vitest';
import {
  Workspace,
  WorkspaceError,
  assetKey,
  sameAsset,
  type KV,
} from '../../src/project/workspace';

const mem = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
};
const slot = (name: string) => ({
  name,
  kind: 'image' as const,
  mode: 'upload' as const,
  prompt: '',
  filled: false,
});
const pauseState = (names: string[]) => ({
  step: 'assets' as const,
  templateId: 'story-explainer',
  job: { plan: {}, model: 'm', max: 10, voice: false },
  slots: names.map(slot),
});

describe('P4F Workspace', () => {
  it('a Style takes the project inside it and the project card leaves the plain list', () => {
    const ws = new Workspace(mem(), 'u1');
    ws.addProject({ id: 'p1', name: 'One', origin: 'manual' });
    ws.addProject({ id: 'p2', name: 'Two', origin: 'manual' });
    const s = ws.makeStyle({ name: 'Physics', fromProjectId: 'p1' });
    expect(ws.project('p1')!.styleId).toBe(s.id);
    expect(ws.projectsOf(null).map((p) => p.id)).toEqual(['p2']);
    expect(ws.projectsOf(s.id).map((p) => p.id)).toEqual(['p1']);
  });

  it('enforces the Style cap and the per-Style project cap', () => {
    const ws = new Workspace(mem(), 'u1');
    ws.addProject({ id: 'p1', name: 'One', origin: 'ai' });
    ws.addProject({ id: 'p2', name: 'Two', origin: 'ai' });
    const s = ws.makeStyle({ name: 'A', fromProjectId: 'p1', maxStyles: 1 });
    expect(() => ws.makeStyle({ name: 'B', maxStyles: 1 })).toThrowError(
      WorkspaceError,
    );
    expect(ws.canMakeStyle({ maxStyles: 1 })).toBe(false);
    expect(() =>
      ws.addToStyle('p2', s.id, { maxProjectsPerStyle: 1 }),
    ).toThrowError(/full/);
    ws.addToStyle('p2', s.id, { maxProjectsPerStyle: null });
    expect(ws.projectsOf(s.id)).toHaveLength(2);
  });

  it('Director pause survives a reload of the same storage and resumes', () => {
    const kv = mem();
    const a = new Workspace(kv, 'u1');
    a.addProject({ id: 'p1', name: 'One', origin: 'manual' });
    a.pause('p1', pauseState(['earth', 'narration']));
    expect(a.project('p1')!.origin).toBe('ai');
    const b = new Workspace(kv, 'u1');
    expect(b.paused().map((p) => p.id)).toEqual(['p1']);
    expect(b.fillSlot('p1', 'Earth.PNG')).toBe(true);
    expect(b.project('p1')!.pause!.slots[0]!.filled).toBe(true);
    expect(b.fillSlot('p1', 'nothing')).toBe(false);
    b.resume('p1');
    expect(b.paused()).toHaveLength(0);
  });

  it('Trash keeps a project until it is older than the Trash days', () => {
    let day = 0;
    const ws = new Workspace(
      mem(),
      'u1',
      () => new Date(Date.UTC(2026, 10, 1 + day)),
    );
    ws.addProject({ id: 'p1', name: 'One', origin: 'manual' });
    ws.trash('p1');
    expect(ws.projects()).toHaveLength(0);
    expect(ws.projects({ trashed: true })).toHaveLength(1);
    day = 29;
    expect(ws.expired(30)).toEqual([]);
    day = 31;
    expect(ws.expired(30)).toEqual(['p1']);
    ws.restore('p1');
    expect(ws.projects()).toHaveLength(1);
  });

  it('a different user never sees this workspace', () => {
    const kv = mem();
    new Workspace(kv, 'u1').addProject({ id: 'p1', name: 'One', origin: 'ai' });
    expect(new Workspace(kv, 'u2').projects()).toHaveLength(0);
  });

  it('file names match without the extension and ignore case', () => {
    expect(assetKey('  Earth Shadow.PNG ')).toBe('earth shadow');
    expect(sameAsset('earth.jpg', 'Earth.mp4')).toBe(true);
    expect(sameAsset('earth', 'moon')).toBe(false);
  });
});
