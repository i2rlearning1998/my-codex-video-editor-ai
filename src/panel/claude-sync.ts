// ROUND-C2 (Part 3): the panel and Claude share the same Projects and
// Videos. When the panel uses the server, after sign-in it:
// - adds the Projects and Videos Claude made to this browser's workspace
//   (origin "claude": the "Made with Claude" tag), with each built Video's
//   editor file and its media, so they open in the editor and in AI mode;
// - sends the names of its own Projects and Videos, so Claude can list them;
// - keeps Claude's activity per Video for AI mode's chat list (read-only).
// Nothing here runs without a server, and Editor mode shows nothing new.
import type { RemoteGateway } from './remote';
import type { Workspace } from '../project/workspace';
import type { ClaudeGraphic, ClaudeWorkspace } from './screens/claude';

export const ACTIVITY_KEY = (videoId: string) =>
  `aive.claude.activity.${videoId}`;
/** Claude's activity on a Video (what AI mode lists). */
export function claudeActivity(
  videoId: string,
  kv: Pick<Storage, 'getItem'> = localStorage,
): { at: string; text: string }[] {
  try {
    const v = JSON.parse(kv.getItem(ACTIVITY_KEY(videoId)) ?? '[]') as unknown;
    return Array.isArray(v)
      ? v.filter(
          (e): e is { at: string; text: string } =>
            !!e && typeof e.at === 'string' && typeof e.text === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

export interface SyncDeps {
  readonly remote: RemoteGateway;
  readonly ws: Workspace;
  /** Saves an editor file in the Projects library (the editor opens it). */
  saveProject(document: unknown): Promise<void>;
  hasProject(id: string): Promise<boolean>;
  /** The editor's media store (bytes by fingerprint). */
  media: {
    has(key: string): Promise<boolean>;
    write(key: string, data: Blob): Promise<void>;
  } | null;
  readonly kv: Pick<Storage, 'getItem' | 'setItem'>;
  readonly fetchMedia: (fingerprint: string) => Promise<Blob | null>;
  /**
   * ROUND-C3 (5.1, 5.2): a Video's AI library. `graphics` saves Claude's
   * graphics into the editor's My library for that Video (the store the
   * editor's AI category and its import dialog read); `asset` lists each in
   * the panel's Asset Library (Project, Video, AI library).
   */
  graphics?(videoId: string, items: readonly ClaudeGraphic[]): Promise<void>;
  /**
   * ROUND-C3 (5.2): the Video sheet's lines and file notes into this
   * browser's Video memory (AI mode and the Director continue from them).
   */
  memory?(
    videoId: string,
    sheet: readonly string[],
    notes: readonly {
      name: string;
      kind: string;
      bytes: number;
      note: string;
    }[],
  ): void;
  asset?: {
    has(id: string): boolean;
    save(row: {
      id: string;
      projectId: string;
      kind: 'pack';
      name: string;
      studioId: string;
      bytes: number;
      createdAt: string;
      library: 'ai';
      text: string;
    }): void;
  };
}

export async function syncClaude(d: SyncDeps): Promise<ClaudeWorkspace> {
  const remote = await d.remote.api<ClaudeWorkspace>('/mcp/workspace');
  for (const p of remote.projects) {
    if (p.origin === 'claude' && !d.ws.project(p.id))
      d.ws.addProject({ id: p.id, name: p.name, origin: 'claude' });
    for (const v of p.videos) {
      if (v.activity.length)
        d.kv.setItem(
          ACTIVITY_KEY(v.id),
          JSON.stringify(v.activity.map(({ at, text }) => ({ at, text }))),
        );
      if (v.origin !== 'claude' || !d.ws.project(p.id)) continue;
      if (v.built && !(await d.hasProject(v.id))) {
        const file = await d.remote.api<{ document: string | null }>(
          '/mcp/video',
          { id: v.id },
        );
        if (file.document) {
          const doc = JSON.parse(file.document) as {
            assets?: { source?: { reference?: string } }[];
          };
          for (const a of doc.assets ?? []) {
            const fp = /^media\/([0-9a-f]{32})$/.exec(
              a.source?.reference ?? '',
            )?.[1];
            if (!fp || !d.media || (await d.media.has(`media/${fp}`))) continue;
            const blob = await d.fetchMedia(fp);
            if (blob) await d.media.write(`media/${fp}`, blob);
          }
          await d.saveProject(doc);
        }
      }
      if (!d.ws.video(v.id))
        d.ws.addVideo({
          id: v.id,
          projectId: p.id,
          name: v.name,
          origin: 'ai',
          stage: v.built ? 'built' : 'brief',
          claude: true,
        });
    }
  }
  // ROUND-C3 (5.1): Claude's graphics join the Video's AI library.
  for (const p of remote.projects)
    for (const v of p.videos) {
      if (d.memory && (v.sheet?.length || v.fileNotes?.length))
        d.memory(v.id, v.sheet ?? [], v.fileNotes ?? []);
      const mine = (p.library ?? []).filter((g) => g.videoId === v.id);
      if (!mine.length) continue;
      await d.graphics?.(v.id, mine).catch(() => undefined);
      for (const g of mine) {
        const id = `claude-gfx-${v.id}-${g.id}`;
        if (!d.asset || d.asset.has(id)) continue;
        d.asset.save({
          id,
          projectId: v.id,
          kind: 'pack',
          name: g.name,
          studioId: 'director',
          bytes: g.source.length,
          createdAt: new Date().toISOString(),
          library: 'ai',
          text: g.summary,
        });
      }
    }
  // The panel's own names, so Claude can list and continue them.
  const doc = d.ws.doc();
  await d.remote.api('/mcp/workspace', {
    projects: doc.projects
      .filter((p) => p.origin !== 'claude' && !p.trashedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        videos: doc.videos
          .filter((v) => v.projectId === p.id && !v.trashedAt)
          .map((v) => ({ id: v.id, name: v.name })),
      })),
  });
  return remote;
}
