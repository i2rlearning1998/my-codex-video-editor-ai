// ROUND-C3 Part 5 (RDC3-051): the panel's sync brings a Claude Video's AI
// library (its graphics), its Video sheet and file notes into this browser,
// once each, so the editor, AI mode and the Director see them.
import { describe, expect, it } from 'vitest';
import { syncClaude, type SyncDeps } from '../../src/panel/claude-sync';

const g = {
  id: 'bar-rise',
  name: 'Rising bars',
  summary: 'Bars rise.',
  tier: 'B' as const,
  source: '({})',
  meta: { duration: 4 },
  videoId: 'vid-1',
};
const remote = {
  projects: [
    {
      id: 'proj-1',
      name: 'Charts',
      origin: 'claude',
      library: [g, { ...g, id: 'other', videoId: 'vid-2' }],
      videos: [
        {
          id: 'vid-1',
          name: 'Bars',
          origin: 'claude',
          built: false,
          activity: [],
          sheet: [
            'Scene 1 "Growth": It grows.',
            'The person approved the plan.',
          ],
          fileNotes: [
            {
              name: 'chart.png',
              kind: 'image',
              bytes: 10,
              note: 'A bar chart.',
            },
          ],
        },
      ],
    },
  ],
};

describe('[RDC3-051] the AI library, sheet and notes reach this browser', () => {
  it("[RDC3-051] syncClaude saves the Video's own graphics to its My library and one Asset Library row each (once), and writes its sheet lines and file notes to the Video memory", async () => {
    const saved: unknown[] = [];
    const rows = new Map<string, unknown>();
    const memory: unknown[] = [];
    const d = {
      remote: {
        api: async (path: string, body?: unknown) =>
          path === '/mcp/workspace' && !body ? remote : {},
      },
      ws: {
        project: () => ({ id: 'proj-1' }),
        video: () => ({ id: 'vid-1' }),
        addProject: () => {},
        addVideo: () => {},
        doc: () => ({ projects: [], videos: [] }),
      },
      saveProject: async () => {},
      hasProject: async () => true,
      media: null,
      kv: { getItem: () => null, setItem: () => {} },
      fetchMedia: async () => null,
      graphics: async (videoId: string, items: readonly unknown[]) =>
        void saved.push([videoId, items.map((x) => (x as { id: string }).id)]),
      asset: {
        has: (id: string) => rows.has(id),
        save: (row: { id: string }) => void rows.set(row.id, row),
      },
      memory: (
        videoId: string,
        sheet: readonly string[],
        notes: readonly unknown[],
      ) => void memory.push([videoId, sheet.length, notes.length]),
    } as unknown as SyncDeps;
    await syncClaude(d);
    await syncClaude(d);
    expect(saved[0]).toEqual(['vid-1', ['bar-rise']]);
    expect([...rows.keys()]).toEqual(['claude-gfx-vid-1-bar-rise']);
    expect(rows.get('claude-gfx-vid-1-bar-rise')).toMatchObject({
      projectId: 'vid-1',
      kind: 'pack',
      library: 'ai',
      name: 'Rising bars',
    });
    expect(memory[0]).toEqual(['vid-1', 2, 1]);
  });
});
