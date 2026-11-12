// ROUND-A: the person's workspace (panel metadata only; the editor project
// file, schema 9, never changes). A Project is a container and one style:
// its style record, memory, assets and many Videos. A Video is one editor
// project (the same id as in the Projects library) with its own brief, plan,
// chats and assets. Users have no Style cards: their Projects are their
// styles. No DOM and no network, so it is easy to test.
//
// Storage: `aive.ws.doc.<userId>`. Version 1 (P4: Styles holding projects)
// is migrated to version 2 once, on first read, by `migrateWorkspace` (pure,
// idempotent); the version 1 text is kept under `aive.ws.doc.<userId>.v1`.

export type Origin = 'ai' | 'manual';
export type ProjectOrigin = 'style' | 'director' | 'manual' | 'claude';
export type LibraryKind = 'ai' | 'templates' | 'media';
export type SlotKind = 'image' | 'audio' | 'video';
export type SlotMode = 'ai' | 'upload' | 'prompt';
/** Where a Video is: waiting at the brief, the plan or the assets; built; or made in the editor. */
export type VideoStage = 'brief' | 'plan' | 'assets' | 'built' | 'editor';

/** One file the plan expects, by the exact name the composition looks for. */
export interface AssetSlot {
  name: string;
  /** The scene that uses it (none: the narration). */
  sceneId?: string;
  /** Whether AI can make it (the scene's method is an AI one). */
  ai?: boolean;
  kind: SlotKind;
  mode: SlotMode;
  /** The prompt Director wrote for it (always kept, so "give me prompts" works). */
  prompt: string;
  /** True once a file with this name is in the project's libraries. */
  filled: boolean;
}

/** Where Director waits when the person leaves; reopening resumes here. */
export interface DirectorPause {
  step: 'assets';
  /** The Platform Config style (template) the brief used. */
  templateId: string;
  /** What the build needs: the approved plan, the model, the hold and the voice. */
  job: { plan: unknown; model: string; max: number; voice: boolean };
  slots: AssetSlot[];
  updatedAt: string;
}

/** A Project's style: what every Video in it follows. */
export interface StyleLook {
  /** Colours as #rrggbb. */
  palette: string[];
  headingFont: string;
  bodyFont: string;
  captionStyle: string;
}
export interface StyleRecord {
  look: StyleLook;
  /** Graphics type and animation manner, in the person's words. */
  graphics: string;
  voice: string;
  music: string;
  scriptRules: string;
  /** Video ids that count as examples of this style. */
  examples: string[];
  /** Where it came from: nothing yet, a ready-made Style, the first built Video, or the person. */
  source: 'empty' | 'ready-made' | 'video' | 'user';
}
/** The editable fields (a per-Video override holds some of them). */
export type StyleFields = Pick<
  StyleRecord,
  'graphics' | 'voice' | 'music' | 'scriptRules'
> & { look: StyleLook };
export type StyleOverride = Partial<Omit<StyleFields, 'look'>> & {
  look?: Partial<StyleLook>;
};

export const emptyStyle = (): StyleRecord => ({
  look: { palette: [], headingFont: '', bodyFont: '', captionStyle: '' },
  graphics: '',
  voice: '',
  music: '',
  scriptRules: '',
  examples: [],
  source: 'empty',
});

export interface WsProject {
  id: string;
  name: string;
  origin: ProjectOrigin;
  /** The ready-made Style (Platform Config `styles[].id`) it started from. */
  templateId: string | null;
  style: StyleRecord;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  /** The Director style record a P4 Style had (kept from the migration). */
  legacyRecordId?: string | null;
}

export interface WsVideo {
  /** The same id as the project in the Projects library (the editor file). */
  id: string;
  projectId: string;
  name: string;
  origin: Origin;
  aspect: string;
  stage: VideoStage;
  createdAt: string;
  updatedAt: string;
  pause: DirectorPause | null;
  trashedAt: string | null;
  /** Set when it went to the Trash with its Project (it comes back with it). */
  withProject?: boolean;
  /** A style change made for this Video only. */
  override: StyleOverride | null;
}

export interface WorkspaceDoc {
  v: 2;
  projects: WsProject[];
  videos: WsVideo[];
}

/** The P4 document (version 1), as the migration reads it. */
export interface WorkspaceV1 {
  v: 1;
  styles: {
    id: string;
    name: string;
    createdAt: string;
    sourceProjectId: string | null;
    recordId: string | null;
  }[];
  projects: {
    id: string;
    name: string;
    origin: Origin;
    styleId: string | null;
    aspect: string;
    createdAt: string;
    updatedAt: string;
    pause: DirectorPause | null;
    trashedAt: string | null;
  }[];
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export class WorkspaceError extends Error {
  constructor(
    readonly code: 'unknown-project' | 'unknown-video' | 'name',
    message: string,
  ) {
    super(message);
  }
}

const rid = (p: string) =>
  `${p}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
/** Names: trimmed, 1 to 80 characters (any script). */
export const cleanName = (name: string) =>
  [...name.trim()].slice(0, 80).join('');
const stageOf = (p: WorkspaceV1['projects'][number]): VideoStage =>
  p.pause ? 'assets' : p.origin === 'ai' ? 'built' : 'editor';

/**
 * ROUND-A A1: version 1 to version 2, pure and idempotent. A user Style
 * becomes a Project (same id) and its projects its Videos; a project in no
 * Style becomes a Project (`pr-<its id>`) holding one Video of the same
 * name. Video ids are the old project ids, so assets, Trash and Director
 * pauses follow their Video unchanged. A version 2 document is returned as
 * it is.
 */
export function migrateWorkspace(raw: unknown): WorkspaceDoc {
  const doc = raw as Partial<WorkspaceDoc> & Partial<WorkspaceV1>;
  if (
    doc &&
    doc.v === 2 &&
    Array.isArray(doc.projects) &&
    Array.isArray(doc.videos)
  )
    return doc as WorkspaceDoc;
  if (
    !doc ||
    doc.v !== 1 ||
    !Array.isArray(doc.styles) ||
    !Array.isArray(doc.projects)
  )
    return { v: 2, projects: [], videos: [] };
  const v1 = doc as WorkspaceV1;
  const projects: WsProject[] = [];
  const videos: WsVideo[] = [];
  const styles = new Set(v1.styles.map((s) => s.id));
  for (const s of v1.styles) {
    const inside = v1.projects.filter((p) => p.styleId === s.id);
    const latest = inside.reduce(
      (at, p) => (p.updatedAt > at ? p.updatedAt : at),
      s.createdAt,
    );
    projects.push({
      id: s.id,
      name: cleanName(s.name) || 'Untitled',
      origin: inside.some((p) => p.origin === 'ai') ? 'director' : 'manual',
      templateId: null,
      style: { ...emptyStyle(), examples: inside.map((p) => p.id) },
      createdAt: s.createdAt,
      updatedAt: latest,
      trashedAt: null,
      legacyRecordId: s.recordId,
    });
  }
  for (const p of v1.projects) {
    const inStyle = !!p.styleId && styles.has(p.styleId);
    const projectId = inStyle ? p.styleId! : `pr-${p.id}`;
    if (!inStyle)
      projects.push({
        id: projectId,
        name: cleanName(p.name) || 'Untitled',
        origin: p.origin === 'ai' ? 'director' : 'manual',
        templateId: p.pause?.templateId ?? null,
        style: emptyStyle(),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        // A project alone in the Trash: its new Project goes there with it.
        trashedAt: p.trashedAt,
      });
    videos.push({
      id: p.id,
      projectId,
      name: cleanName(p.name) || 'Untitled',
      origin: p.origin,
      aspect: p.aspect || '16:9',
      stage: stageOf(p),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      pause: p.pause,
      trashedAt: p.trashedAt,
      ...(p.trashedAt && !inStyle ? { withProject: true } : {}),
      override: null,
    });
  }
  return { v: 2, projects, videos };
}

export class Workspace {
  #doc: WorkspaceDoc;
  constructor(
    private readonly storage: KV,
    readonly userId: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.#doc = this.#read();
  }
  get #key() {
    return `aive.ws.doc.${this.userId}`;
  }
  #read(): WorkspaceDoc {
    let raw: unknown = null;
    const text = this.storage.getItem(this.#key);
    try {
      raw = JSON.parse(text ?? 'null');
    } catch {
      raw = null;
    }
    const doc = migrateWorkspace(raw);
    if ((raw as { v?: number } | null)?.v === 1 && text) {
      // Keep the old text once (never overwritten), then store version 2.
      if (this.storage.getItem(`${this.#key}.v1`) === null)
        this.storage.setItem(`${this.#key}.v1`, text);
      this.storage.setItem(this.#key, JSON.stringify(doc));
    }
    return doc;
  }
  #write() {
    this.storage.setItem(this.#key, JSON.stringify(this.#doc));
  }
  /** Another tab (or the editor) may have written; always start from disk. */
  reload() {
    this.#doc = this.#read();
  }
  #stamp() {
    return this.now().toISOString();
  }
  /** The whole document (read-only use: the server registry sync). */
  doc(): Readonly<WorkspaceDoc> {
    return this.#doc;
  }

  // ---- reading --------------------------------------------------------
  /** Projects, newest activity first; the Trash only when asked for. */
  projects(opts: { trashed?: boolean } = {}): readonly WsProject[] {
    return this.#doc.projects
      .filter((p) => (opts.trashed ? !!p.trashedAt : !p.trashedAt))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  project(id: string): WsProject | undefined {
    return this.#doc.projects.find((p) => p.id === id);
  }
  /** Every Video not in the Trash (or only the trashed ones), newest first. */
  videos(opts: { trashed?: boolean } = {}): readonly WsVideo[] {
    return this.#doc.videos
      .filter((v) => (opts.trashed ? !!v.trashedAt : !v.trashedAt))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  video(id: string): WsVideo | undefined {
    return this.#doc.videos.find((v) => v.id === id);
  }
  /** A Project's Videos in series order (oldest first); trashed ones left out. */
  videosOf(projectId: string): readonly WsVideo[] {
    return this.#doc.videos
      .filter((v) => v.projectId === projectId && !v.trashedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  /** The Video's number in its Project's series (1-based; 0 when trashed). */
  numberOf(videoId: string): number {
    const v = this.video(videoId);
    if (!v) return 0;
    return this.videosOf(v.projectId).findIndex((x) => x.id === videoId) + 1;
  }
  /** Videos Director waits on or has not finished, newest first. */
  unfinished(): readonly WsVideo[] {
    return this.videos().filter(
      (v) =>
        v.stage !== 'built' &&
        v.stage !== 'editor' &&
        !this.project(v.projectId)?.trashedAt,
    );
  }
  /** Projects in the order they were made (the Assets Library's cards). */
  cards(): readonly WsProject[] {
    return this.projects()
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // ---- making ---------------------------------------------------------
  addProject(input: {
    name: string;
    origin: ProjectOrigin;
    templateId?: string | null;
    style?: StyleRecord;
    id?: string;
  }): WsProject {
    const name = cleanName(input.name);
    if (!name) throw new WorkspaceError('name', 'A project needs a name.');
    const at = this.#stamp();
    const p: WsProject = {
      id: input.id ?? rid('pr'),
      name,
      origin: input.origin,
      templateId: input.templateId ?? null,
      style: input.style ?? emptyStyle(),
      createdAt: at,
      updatedAt: at,
      trashedAt: null,
    };
    this.#doc.projects = this.#doc.projects.filter((x) => x.id !== p.id);
    this.#doc.projects.push(p);
    this.#write();
    return p;
  }
  /** Notes a Video (an editor project that already exists) in a Project. */
  addVideo(input: {
    id: string;
    projectId: string;
    name: string;
    origin: Origin;
    aspect?: string;
    stage?: VideoStage;
  }): WsVideo {
    const p = this.#needProject(input.projectId);
    const name = cleanName(input.name);
    if (!name) throw new WorkspaceError('name', 'A video needs a name.');
    const at = this.#stamp();
    const v: WsVideo = {
      id: input.id,
      projectId: p.id,
      name,
      origin: input.origin,
      aspect: input.aspect ?? '16:9',
      stage: input.stage ?? (input.origin === 'ai' ? 'brief' : 'editor'),
      createdAt: at,
      updatedAt: at,
      pause: null,
      trashedAt: null,
      override: null,
    };
    this.#doc.videos = this.#doc.videos.filter((x) => x.id !== v.id);
    this.#doc.videos.push(v);
    p.updatedAt = at;
    this.#write();
    return v;
  }
  /**
   * An editor project with no record (made from the editor's own File menu,
   * or before P4): a Project holding it as its one Video.
   */
  adopt(input: { id: string; name: string; aspect?: string; at?: string }) {
    const known = this.video(input.id);
    if (known) {
      const n = cleanName(input.name);
      if (n && known.name !== n) {
        known.name = n;
        this.#write();
      }
      return known;
    }
    const at = input.at ?? this.#stamp();
    const name = cleanName(input.name) || 'Untitled';
    const projectId = `pr-${input.id}`;
    if (!this.project(projectId))
      this.#doc.projects.push({
        id: projectId,
        name,
        origin: 'manual',
        templateId: null,
        style: emptyStyle(),
        createdAt: at,
        updatedAt: at,
        trashedAt: null,
      });
    const v: WsVideo = {
      id: input.id,
      projectId,
      name,
      origin: 'manual',
      aspect: input.aspect ?? '16:9',
      stage: 'editor',
      createdAt: at,
      updatedAt: at,
      pause: null,
      trashedAt: null,
      override: null,
    };
    this.#doc.videos.push(v);
    this.#write();
    return v;
  }
  #needProject(id: string): WsProject {
    const p = this.project(id);
    if (!p)
      throw new WorkspaceError('unknown-project', 'That project is gone.');
    return p;
  }
  #need(id: string): WsVideo {
    const v = this.video(id);
    if (!v) throw new WorkspaceError('unknown-video', 'That video is gone.');
    return v;
  }
  renameProject(id: string, name: string) {
    const p = this.#needProject(id);
    const n = cleanName(name);
    if (!n) throw new WorkspaceError('name', 'A project needs a name.');
    p.name = n;
    p.updatedAt = this.#stamp();
    this.#write();
  }
  renameVideo(id: string, name: string) {
    const v = this.#need(id);
    const n = cleanName(name);
    if (!n) throw new WorkspaceError('name', 'A video needs a name.');
    v.name = n;
    v.updatedAt = this.#stamp();
    this.#write();
  }
  /** Director was used on the Video (panel or editor): it is an AI video. */
  markAi(id: string) {
    const v = this.#need(id);
    if (v.origin === 'ai') return;
    v.origin = 'ai';
    if (v.stage === 'editor') v.stage = 'brief';
    v.updatedAt = this.#stamp();
    this.#write();
  }
  setStage(id: string, stage: VideoStage) {
    const v = this.video(id);
    if (!v || v.stage === stage) return;
    v.stage = stage;
    v.updatedAt = this.#stamp();
    this.#touchProject(v.projectId);
    this.#write();
  }
  touch(id: string) {
    const v = this.video(id);
    if (!v) return;
    v.updatedAt = this.#stamp();
    this.#touchProject(v.projectId);
    this.#write();
  }
  #touchProject(id: string) {
    const p = this.project(id);
    if (p) p.updatedAt = this.#stamp();
  }

  // ---- Director waits -------------------------------------------------
  pause(id: string, state: Omit<DirectorPause, 'updatedAt'>) {
    const v = this.#need(id);
    v.pause = { ...state, updatedAt: this.#stamp() };
    v.origin = 'ai';
    v.stage = 'assets';
    v.updatedAt = this.#stamp();
    this.#write();
  }
  /** Marks a slot as filled (or not) by name; extensions never matter. */
  fillSlot(id: string, name: string, filled = true) {
    const v = this.#need(id);
    const slot = v.pause?.slots.find((s) => sameAsset(s.name, name));
    if (!slot) return false;
    slot.filled = filled;
    v.pause!.updatedAt = this.#stamp();
    this.#write();
    return true;
  }
  /** Director is done waiting (the Video was built, or the person went on). */
  resume(id: string) {
    const v = this.#need(id);
    v.pause = null;
    v.updatedAt = this.#stamp();
    this.#write();
  }

  // ---- style ----------------------------------------------------------
  /** The Project's style with this Video's own changes on top. */
  effectiveStyle(videoId: string): StyleFields | null {
    const v = this.video(videoId);
    const p = v && this.project(v.projectId);
    if (!v || !p) return null;
    const o = v.override ?? {};
    return {
      look: { ...p.style.look, ...(o.look ?? {}) },
      graphics: o.graphics ?? p.style.graphics,
      voice: o.voice ?? p.style.voice,
      music: o.music ?? p.style.music,
      scriptRules: o.scriptRules ?? p.style.scriptRules,
    };
  }
  /** The person edits the Project's style. */
  setProjectStyle(projectId: string, fields: Partial<StyleFields>) {
    const p = this.#needProject(projectId);
    p.style = {
      ...p.style,
      ...fields,
      look: { ...p.style.look, ...(fields.look ?? {}) },
      source: 'user',
    };
    p.updatedAt = this.#stamp();
    this.#write();
  }
  /**
   * The first built Video fills an empty style (a style that came from a
   * ready-made Style or the person is never replaced).
   */
  fillStyleFromVideo(videoId: string, fields: Partial<StyleFields>): boolean {
    const v = this.#need(videoId);
    const p = this.#needProject(v.projectId);
    if (p.style.source !== 'empty') return false;
    p.style = {
      ...p.style,
      ...fields,
      look: { ...p.style.look, ...(fields.look ?? {}) },
      examples: p.style.examples.includes(videoId)
        ? p.style.examples
        : [...p.style.examples, videoId],
      source: 'video',
    };
    p.updatedAt = this.#stamp();
    this.#write();
    return true;
  }
  /** A change for this Video only (the Project's style is not touched). */
  setVideoOverride(videoId: string, change: StyleOverride | null) {
    const v = this.#need(videoId);
    if (!change) v.override = null;
    else
      v.override = {
        ...(v.override ?? {}),
        ...change,
        ...(change.look || v.override?.look
          ? { look: { ...(v.override?.look ?? {}), ...(change.look ?? {}) } }
          : {}),
      };
    v.updatedAt = this.#stamp();
    this.#write();
  }
  /** "Update project style from this video": the override becomes the Project's. */
  promoteOverride(videoId: string) {
    const v = this.#need(videoId);
    if (!v.override) return;
    const next = this.effectiveStyle(videoId)!;
    v.override = null;
    this.setProjectStyle(v.projectId, next);
  }
  /** Whether a Video counts as an example of its Project's style. */
  setExample(projectId: string, videoId: string, on: boolean) {
    const p = this.#needProject(projectId);
    const has = p.style.examples.includes(videoId);
    if (on === has) return;
    p.style = {
      ...p.style,
      examples: on
        ? [...p.style.examples, videoId]
        : p.style.examples.filter((x) => x !== videoId),
    };
    this.#write();
  }

  // ---- Trash ----------------------------------------------------------
  /** Only this Video goes to the Trash; its Project stays. */
  trashVideo(id: string) {
    const v = this.#need(id);
    v.trashedAt = this.#stamp();
    delete v.withProject;
    this.#write();
  }
  /** Brings a Video back (and its Project, if that is in the Trash too). */
  restoreVideo(id: string) {
    const v = this.#need(id);
    v.trashedAt = null;
    delete v.withProject;
    v.updatedAt = this.#stamp();
    const p = this.project(v.projectId);
    if (p?.trashedAt) p.trashedAt = null;
    this.#write();
  }
  /** The Project and every Video in it go to the Trash together. */
  trashProject(id: string) {
    const p = this.#needProject(id);
    const at = this.#stamp();
    p.trashedAt = at;
    for (const v of this.#doc.videos)
      if (v.projectId === id && !v.trashedAt) {
        v.trashedAt = at;
        v.withProject = true;
      }
    this.#write();
  }
  /** The Project comes back with the Videos that went with it. */
  restoreProject(id: string) {
    const p = this.#needProject(id);
    p.trashedAt = null;
    p.updatedAt = this.#stamp();
    for (const v of this.#doc.videos)
      if (v.projectId === id && v.withProject) {
        v.trashedAt = null;
        delete v.withProject;
      }
    this.#write();
  }
  /** Removes a Video's record for good (the caller deletes its file and assets). */
  forgetVideo(id: string) {
    this.#doc.videos = this.#doc.videos.filter((v) => v.id !== id);
    for (const p of this.#doc.projects)
      if (p.style.examples.includes(id))
        p.style = {
          ...p.style,
          examples: p.style.examples.filter((x) => x !== id),
        };
    this.#write();
  }
  /** Removes a Project and its Video records (the caller deletes their files). */
  forgetProject(id: string): string[] {
    const gone = this.#doc.videos
      .filter((v) => v.projectId === id)
      .map((v) => v.id);
    this.#doc.videos = this.#doc.videos.filter((v) => v.projectId !== id);
    this.#doc.projects = this.#doc.projects.filter((p) => p.id !== id);
    this.#write();
    return gone;
  }
  /** Trashed Projects and Videos older than `days`. */
  expired(days: number): { projects: string[]; videos: string[] } {
    const limit = this.now().getTime() - days * 864e5;
    const old = (at: string | null) => !!at && Date.parse(at) <= limit;
    const projects = this.#doc.projects
      .filter((p) => old(p.trashedAt))
      .map((p) => p.id);
    const videos = this.#doc.videos
      .filter((v) => old(v.trashedAt) && !projects.includes(v.projectId))
      .map((v) => v.id);
    return { projects, videos };
  }
}

/** File names match without the extension, ignoring case and spaces at the ends. */
export function assetKey(name: string): string {
  return name
    .trim()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .toLowerCase();
}
export const sameAsset = (a: string, b: string) => assetKey(a) === assetKey(b);

/** Where an asset belongs when its row does not say. */
export function libraryOf(a: {
  library?: LibraryKind;
  studioId: string;
}): LibraryKind {
  if (a.library) return a.library;
  return a.studioId === 'director' ? 'ai' : 'media';
}
