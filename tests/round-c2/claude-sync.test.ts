// ROUND-C2 Part 3 (RDC2-043): the panel pulls what Claude made into this
// browser: Claude's Projects and Videos (origin claude), a built Video's
// editor file and its media, and Claude's steps per Video for AI mode.
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_KEY,
  claudeActivity,
  syncClaude,
  type SyncDeps,
} from '../../src/panel/claude-sync';

const FP = 'a'.repeat(32);
const remoteWs = {
  projects: [
    {
      id: 'proj-1',
      name: 'Rivers',
      origin: 'claude',
      videos: [
        {
          id: 'vid-1',
          name: 'Delta',
          origin: 'claude',
          built: true,
          activity: [
            { at: '2026-11-15T10:00:00.000Z', text: 'Made the plan', by: 'c' },
            {
              at: '2026-11-15T10:01:00.000Z',
              text: 'Built the video',
              by: 'c',
            },
          ],
        },
      ],
    },
  ],
};

function deps() {
  const projects = new Map<string, unknown>();
  const videos = new Map<string, unknown>();
  const kv = new Map<string, string>();
  const saved: unknown[] = [];
  const media = new Map<string, Blob>();
  const posted: unknown[] = [];
  const d = {
    remote: {
      api: async (path: string, body?: unknown) =>
        path === '/mcp/workspace' && body
          ? void posted.push(body)
          : path === '/mcp/workspace'
            ? remoteWs
            : {
                document: JSON.stringify({
                  id: 'vid-1',
                  assets: [{ source: { reference: `media/${FP}` } }],
                }),
              },
    },
    ws: {
      project: (id: string) => projects.get(id),
      video: (id: string) => videos.get(id),
      addProject: (p: { id: string }) => projects.set(p.id, p),
      addVideo: (v: { id: string }) => videos.set(v.id, v),
      doc: () => ({
        projects: [
          ...projects.values(),
          { id: 'proj-mine', name: 'Mine', origin: 'manual' },
        ],
        videos: [...videos.values()],
      }),
    },
    saveProject: async (doc: unknown) => void saved.push(doc),
    hasProject: async () => saved.length > 0,
    media: {
      has: async (k: string) => media.has(k),
      write: async (k: string, b: Blob) => void media.set(k, b),
    },
    kv: {
      getItem: (k: string) => kv.get(k) ?? null,
      setItem: (k: string, v: string) => void kv.set(k, v),
    },
    fetchMedia: async () => new Blob(['x']),
  } as unknown as SyncDeps;
  return { d, projects, videos, kv, saved, media, posted };
}

describe('Claude sync', () => {
  it("[RDC2-043] Claude's Projects, Videos, a built Video's file and media, and Claude's steps reach this browser; AI mode reads the steps", async () => {
    const s = deps();
    await syncClaude(s.d);
    expect(s.projects.get('proj-1')).toMatchObject({ origin: 'claude' });
    expect(s.videos.get('vid-1')).toMatchObject({
      projectId: 'proj-1',
      stage: 'built',
      claude: true,
    });
    expect(s.saved).toHaveLength(1);
    expect(s.media.has(`media/${FP}`)).toBe(true);
    const steps = claudeActivity('vid-1', {
      getItem: (k) => s.kv.get(k) ?? null,
    });
    expect(steps.map((x) => x.text)).toEqual([
      'Made the plan',
      'Built the video',
    ]);
    expect(s.kv.get(ACTIVITY_KEY('vid-1'))).not.toContain('"by"');
    // The panel's own Projects go back to the server; Claude's do not.
    expect(s.posted[0]).toEqual({
      projects: [{ id: 'proj-mine', name: 'Mine', videos: [] }],
    });
    // A second sync adds nothing twice.
    await syncClaude(s.d);
    expect(s.saved).toHaveLength(1);
    expect(claudeActivity('missing', { getItem: () => 'not json' })).toEqual(
      [],
    );
  });
});
