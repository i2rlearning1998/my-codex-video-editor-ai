// ROUND-A A1: Project (container) and Video, the version 1 to 2 migration,
// Trash rules and the style record. Pure: storage is a Map.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  Workspace,
  WorkspaceError,
  assetKey,
  migrateWorkspace,
  sameAsset,
  type KV,
} from '../../src/project/workspace';

const V1 = readFileSync('tests/fixtures/workspace/v1.json', 'utf8');
const mem = (
  seed?: Record<string, string>,
): KV & {
  data: Map<string, string>;
} => {
  const data = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
};
const KEY = 'aive.ws.doc.u1';
const slot = (name: string) => ({
  name,
  kind: 'image' as const,
  mode: 'upload' as const,
  prompt: '',
  filled: false,
});

describe('ROUND-A workspace migration', () => {
  it('[RDA-003] a user Style becomes a Project with its projects as Videos; a lone, Manual or orphaned project becomes a Project with one Video', () => {
    const ws = new Workspace(mem({ [KEY]: V1 }), 'u1');
    const physics = ws.project('st-physics0001')!;
    expect(physics.name).toBe('Physics explainers');
    expect(physics.origin).toBe('director');
    expect(physics.legacyRecordId).toBe('style-rec-1');
    expect(ws.videosOf(physics.id).map((v) => v.id)).toEqual([
      'p-circle',
      'p-gravity',
    ]);
    expect(physics.style.examples).toEqual(['p-circle', 'p-gravity']);
    // An empty Style is a Project with zero Videos.
    expect(ws.videosOf('st-empty00002')).toEqual([]);
    // Manual project in no Style: its own Project, Hindi name kept.
    const manual = ws.project('pr-p-manual')!;
    expect(manual).toMatchObject({ name: 'मेरी वीडियो', origin: 'manual' });
    expect(ws.video('p-manual')).toMatchObject({
      projectId: 'pr-p-manual',
      aspect: '9:16',
      stage: 'editor',
    });
    // A project whose Style was deleted is not lost.
    expect(ws.video('p-lost-style')!.projectId).toBe('pr-p-lost-style');
  });

  it('[RDA-003] the Director pause, the Trash and every asset id follow their Video', () => {
    const ws = new Workspace(mem({ [KEY]: V1 }), 'u1');
    const g = ws.video('p-gravity')!;
    expect(g.stage).toBe('assets');
    expect(g.pause!.slots[0]!.name).toBe('apple.png');
    expect(ws.unfinished().map((v) => v.id)).toEqual(['p-gravity']);
    // The trashed lone project: its Project is in the Trash with it, and a
    // Restore brings both back.
    expect(ws.project('pr-p-old')!.trashedAt).not.toBeNull();
    expect(ws.video('p-old')!.trashedAt).not.toBeNull();
    ws.restoreProject('pr-p-old');
    expect(ws.videosOf('pr-p-old').map((v) => v.id)).toEqual(['p-old']);
    // Video ids are the old project ids: an asset row keyed by projectId
    // still names its Video.
    expect(ws.video('p-circle')).toBeDefined();
  });

  it('[RDA-003] runs once, keeps the version 1 text, and running it twice changes nothing', () => {
    const store = mem({ [KEY]: V1 });
    const first = new Workspace(store, 'u1');
    const after = store.data.get(KEY)!;
    expect(JSON.parse(after).v).toBe(2);
    expect(store.data.get(`${KEY}.v1`)).toBe(V1);
    // Reading again (another tab, a reload) does not migrate again.
    const second = new Workspace(store, 'u1');
    expect(store.data.get(KEY)).toBe(after);
    expect(second.doc()).toEqual(first.doc());
    // The pure function is idempotent on both versions.
    const once = migrateWorkspace(JSON.parse(V1));
    expect(migrateWorkspace(JSON.parse(V1))).toEqual(once);
    expect(migrateWorkspace(once)).toBe(once);
    // Nothing is lost: every old project is a Video.
    const ids = (JSON.parse(V1) as { projects: { id: string }[] }).projects.map(
      (p) => p.id,
    );
    expect(once.videos.map((v) => v.id).sort()).toEqual(ids.sort());
    // A second migration never overwrites the kept version 1 text.
    store.data.set(KEY, V1);
    new Workspace(store, 'u1');
    expect(store.data.get(`${KEY}.v1`)).toBe(V1);
  });

  it('[RDA-003] a broken or missing document starts empty', () => {
    expect(new Workspace(mem({ [KEY]: '{oops' }), 'u1').projects()).toEqual([]);
    expect(new Workspace(mem(), 'u1').videos()).toEqual([]);
  });
});

describe('ROUND-A Projects and Videos', () => {
  it('[RDA-004] deleting a Video leaves its Project; deleting a Project takes its Videos and a Restore brings them back', () => {
    const ws = new Workspace(mem(), 'u1');
    const p = ws.addProject({ name: 'Series', origin: 'director' });
    ws.addVideo({ id: 'v1', projectId: p.id, name: 'One', origin: 'ai' });
    ws.addVideo({ id: 'v2', projectId: p.id, name: 'Two', origin: 'manual' });
    ws.trashVideo('v1');
    expect(ws.project(p.id)!.trashedAt).toBeNull();
    expect(ws.videosOf(p.id).map((v) => v.id)).toEqual(['v2']);
    expect(ws.numberOf('v2')).toBe(1);
    // The last Video goes: the Project stays, empty.
    ws.trashVideo('v2');
    expect(ws.projects().map((x) => x.id)).toEqual([p.id]);
    expect(ws.videosOf(p.id)).toEqual([]);
    ws.restoreVideo('v2');
    // Project Trash takes v2 (live) but leaves v1 (already trashed alone).
    ws.trashProject(p.id);
    expect(ws.videos()).toEqual([]);
    ws.restoreProject(p.id);
    expect(ws.videosOf(p.id).map((v) => v.id)).toEqual(['v2']);
    expect(ws.video('v1')!.trashedAt).not.toBeNull();
    // Restoring a Video whose Project is in the Trash restores the Project.
    ws.trashProject(p.id);
    ws.restoreVideo('v1');
    expect(ws.project(p.id)!.trashedAt).toBeNull();
    // Expiry: Project ids and lone Video ids, never both for one Project.
    ws.trashProject(p.id);
    const later = new Workspace(
      mem({ 'aive.ws.doc.u1': JSON.stringify(ws.doc()) }),
      'u1',
      () => new Date(Date.now() + 40 * 864e5),
    );
    expect(later.expired(30)).toEqual({ projects: [p.id], videos: [] });
    expect(later.forgetProject(p.id).sort()).toEqual(['v1', 'v2']);
    expect(later.videos({ trashed: true })).toEqual([]);
  });

  it('[RDA-004] names are trimmed to 80 characters in any script and may not be empty', () => {
    const ws = new Workspace(mem(), 'u1');
    const p = ws.addProject({ name: '  नमस्ते '.repeat(20), origin: 'manual' });
    expect([...p.name].length).toBe(80);
    expect(() => ws.renameProject(p.id, '   ')).toThrow(WorkspaceError);
    ws.addVideo({ id: 'v', projectId: p.id, name: 'x', origin: 'manual' });
    ws.renameVideo('v', 'हिंदी नाम');
    expect(ws.video('v')!.name).toBe('हिंदी नाम');
  });

  it('[RDA-004] an editor-made project with no record is adopted as a Project with one Video', () => {
    const ws = new Workspace(mem(), 'u1');
    ws.adopt({ id: 'ed-1', name: 'From the editor' });
    expect(ws.video('ed-1')!.projectId).toBe('pr-ed-1');
    ws.adopt({ id: 'ed-1', name: 'Renamed' });
    expect(ws.video('ed-1')!.name).toBe('Renamed');
    expect(ws.projects()).toHaveLength(1);
  });

  it('[RDA-004] Director pause survives a reload and resumes', () => {
    const store = mem();
    const ws = new Workspace(store, 'u1');
    const p = ws.addProject({ name: 'P', origin: 'director' });
    ws.addVideo({ id: 'v', projectId: p.id, name: 'V', origin: 'ai' });
    ws.pause('v', {
      step: 'assets',
      templateId: 't',
      job: { plan: {}, model: 'm', max: 1, voice: false },
      slots: [slot('a.png')],
    });
    const again = new Workspace(store, 'u1');
    expect(again.fillSlot('v', 'A.JPG')).toBe(true);
    expect(again.video('v')!.stage).toBe('assets');
    again.resume('v');
    again.setStage('v', 'built');
    expect(again.unfinished()).toEqual([]);
  });

  it('[RDA-004] another person never sees this workspace', () => {
    const store = mem();
    new Workspace(store, 'u1').addProject({ name: 'Mine', origin: 'manual' });
    expect(new Workspace(store, 'u2').projects()).toEqual([]);
  });
});

describe('ROUND-A style record', () => {
  it('[RDA-005] the first built Video fills an empty style; a ready-made or edited style is never replaced', () => {
    const ws = new Workspace(mem(), 'u1');
    const p = ws.addProject({ name: 'P', origin: 'director' });
    ws.addVideo({ id: 'v1', projectId: p.id, name: '1', origin: 'ai' });
    ws.addVideo({ id: 'v2', projectId: p.id, name: '2', origin: 'ai' });
    expect(
      ws.fillStyleFromVideo('v1', {
        voice: 'Warm',
        look: {
          palette: ['#112233'],
          headingFont: 'Inter',
          bodyFont: '',
          captionStyle: '',
        },
      }),
    ).toBe(true);
    expect(ws.project(p.id)!.style).toMatchObject({
      voice: 'Warm',
      source: 'video',
      examples: ['v1'],
    });
    expect(ws.fillStyleFromVideo('v2', { voice: 'Cold' })).toBe(false);
    ws.setProjectStyle(p.id, { scriptRules: 'Short sentences.' });
    expect(ws.project(p.id)!.style.source).toBe('user');
    ws.setExample(p.id, 'v1', false);
    ws.setExample(p.id, 'v2', true);
    expect(ws.project(p.id)!.style.examples).toEqual(['v2']);
  });

  it('[RDA-005] a change for one Video stays in it until "Update project style from this video"', () => {
    const ws = new Workspace(mem(), 'u1');
    const p = ws.addProject({ name: 'P', origin: 'director' });
    ws.setProjectStyle(p.id, { voice: 'Warm', music: 'Piano' });
    ws.addVideo({ id: 'v1', projectId: p.id, name: '1', origin: 'ai' });
    ws.addVideo({ id: 'v2', projectId: p.id, name: '2', origin: 'ai' });
    ws.setVideoOverride('v1', {
      voice: 'Excited',
      look: { headingFont: 'Poppins' },
    });
    expect(ws.effectiveStyle('v1')).toMatchObject({
      voice: 'Excited',
      music: 'Piano',
      look: { headingFont: 'Poppins' },
    });
    expect(ws.effectiveStyle('v2')!.voice).toBe('Warm');
    expect(ws.project(p.id)!.style.voice).toBe('Warm');
    ws.promoteOverride('v1');
    expect(ws.video('v1')!.override).toBeNull();
    expect(ws.project(p.id)!.style.voice).toBe('Excited');
    expect(ws.effectiveStyle('v2')!.look.headingFont).toBe('Poppins');
  });
});

describe('asset names', () => {
  it('file names match without the extension and ignore case', () => {
    expect(assetKey(' Apple.PNG ')).toBe('apple');
    expect(sameAsset('apple.png', 'APPLE.jpg')).toBe(true);
  });
});

describe('ROUND-A style sources', () => {
  it('[RDA-005] a ready-made Style and a built plan fill the style record', async () => {
    const { styleFromPlan, styleFromTemplate } =
      await import('../../src/project/style-from');
    const { defaultConfig } = await import('../../src/platform-config');
    const template = defaultConfig().styles[0]!;
    const fromTemplate = styleFromTemplate(template, 'en');
    expect(fromTemplate.source).toBe('ready-made');
    expect(fromTemplate.graphics.length).toBeGreaterThan(0);
    const fromPlan = styleFromPlan({
      feel: {
        palette: { background: '#0A0A0A', text: '#ffffff', accent: 'red' },
        headingFont: 'Poppins',
        pacing: 'fast',
      },
      music: { query: 'calm piano' },
      voice: { voiceId: 'warm-female', speed: 1.1 },
      notes: 'Explain with one example per scene.',
    });
    expect(fromPlan).toMatchObject({
      look: { palette: ['#0a0a0a', '#ffffff'], headingFont: 'Poppins' },
      graphics: 'Pacing: fast',
      music: 'calm piano',
      voice: 'warm-female 1.1×',
      scriptRules: 'Explain with one example per scene.',
    });
    expect(styleFromPlan(null).graphics).toBe('');
  });
});
