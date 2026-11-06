// P4: the person's workspace. Everything starts as a Project. A Style is made
// from a project ("Save to your styles") and then holds that project and the
// ones made after it. This file keeps only the small facts (which project is in
// which Style, AI or manual, where Director waits, what is in the Trash); the
// project documents live in the Projects library and the files in the Asset
// store. No DOM and no network, so it is easy to test.

export type Origin = 'ai' | 'manual';
export type LibraryKind = 'ai' | 'templates' | 'media';
export type SlotKind = 'image' | 'audio' | 'video';
export type SlotMode = 'ai' | 'upload' | 'prompt';

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

export interface WsStyle {
  id: string;
  name: string;
  createdAt: string;
  /** The project it was made from. */
  sourceProjectId: string | null;
  /** The Style Director learned (the DirectorService record), when there is one. */
  recordId: string | null;
}

export interface WsProject {
  /** The same id as the project in the Projects library. */
  id: string;
  name: string;
  origin: Origin;
  styleId: string | null;
  aspect: string;
  createdAt: string;
  updatedAt: string;
  pause: DirectorPause | null;
  trashedAt: string | null;
}

interface Doc {
  v: 1;
  styles: WsStyle[];
  projects: WsProject[];
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export class WorkspaceError extends Error {
  constructor(
    readonly code:
      | 'unknown-project'
      | 'unknown-style'
      | 'style-cap'
      | 'style-project-cap'
      | 'name',
    message: string,
  ) {
    super(message);
  }
}

const rid = (p: string) =>
  `${p}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

export class Workspace {
  #doc: Doc;
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
  #read(): Doc {
    try {
      const raw = JSON.parse(this.storage.getItem(this.#key) ?? 'null') as Doc;
      if (
        raw &&
        raw.v === 1 &&
        Array.isArray(raw.styles) &&
        Array.isArray(raw.projects)
      )
        return raw;
    } catch {
      /* start empty */
    }
    return { v: 1, styles: [], projects: [] };
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

  // ---- reading --------------------------------------------------------
  styles(): readonly WsStyle[] {
    return this.#doc.styles;
  }
  style(id: string): WsStyle | undefined {
    return this.#doc.styles.find((s) => s.id === id);
  }
  /** Every project, newest first; the Trash only when asked for. */
  projects(opts: { trashed?: boolean } = {}): readonly WsProject[] {
    return this.#doc.projects
      .filter((p) => (opts.trashed ? !!p.trashedAt : !p.trashedAt))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  project(id: string): WsProject | undefined {
    return this.#doc.projects.find((p) => p.id === id);
  }
  projectsOf(styleId: string | null): readonly WsProject[] {
    return this.projects().filter((p) => p.styleId === styleId);
  }
  /** Projects that wait for the person in Director. */
  paused(): readonly WsProject[] {
    return this.projects().filter((p) => p.pause);
  }
  /**
   * Cards for the Assets Library in the order they were made: Style cards (with
   * their projects inside), projects that are in no Style. The Studio card is
   * added by the screen, at the time of the first Studio asset.
   */
  cards(): readonly (
    | { kind: 'style'; style: WsStyle; at: string }
    | { kind: 'project'; project: WsProject; at: string }
  )[] {
    return [
      ...this.#doc.styles.map((style) => ({
        kind: 'style' as const,
        style,
        at: style.createdAt,
      })),
      ...this.projects()
        .filter((p) => !p.styleId)
        .map((project) => ({
          kind: 'project' as const,
          project,
          at: project.createdAt,
        })),
    ].sort((a, b) => a.at.localeCompare(b.at));
  }

  // ---- projects -------------------------------------------------------
  /** Notes a project the editor made (or an older one) so it has a card. */
  adopt(input: { id: string; name: string; aspect?: string; at?: string }) {
    const known = this.project(input.id);
    if (known) {
      if (known.name !== input.name) {
        known.name = input.name;
        this.#write();
      }
      return known;
    }
    const at = input.at ?? this.#stamp();
    const p: WsProject = {
      id: input.id,
      name: input.name,
      origin: 'manual',
      styleId: null,
      aspect: input.aspect ?? '16:9',
      createdAt: at,
      updatedAt: at,
      pause: null,
      trashedAt: null,
    };
    this.#doc.projects.push(p);
    this.#write();
    return p;
  }
  /** Makes a project record for an id that already exists in the library. */
  addProject(input: {
    id: string;
    name: string;
    origin: Origin;
    styleId?: string | null;
    aspect?: string;
  }): WsProject {
    const name = input.name.trim();
    if (!name) throw new WorkspaceError('name', 'A project needs a name.');
    const styleId = input.styleId ?? null;
    if (styleId && !this.style(styleId))
      throw new WorkspaceError('unknown-style', 'That Style is gone.');
    const at = this.#stamp();
    const p: WsProject = {
      id: input.id,
      name: name.slice(0, 80),
      origin: input.origin,
      styleId,
      aspect: input.aspect ?? '16:9',
      createdAt: at,
      updatedAt: at,
      pause: null,
      trashedAt: null,
    };
    this.#doc.projects = this.#doc.projects.filter((x) => x.id !== p.id);
    this.#doc.projects.push(p);
    this.#write();
    return p;
  }
  #need(id: string): WsProject {
    const p = this.project(id);
    if (!p)
      throw new WorkspaceError('unknown-project', 'That project is gone.');
    return p;
  }
  rename(id: string, name: string) {
    const p = this.#need(id);
    const n = name.trim().slice(0, 80);
    if (!n) throw new WorkspaceError('name', 'A project needs a name.');
    p.name = n;
    p.updatedAt = this.#stamp();
    this.#write();
  }
  /** Director was used on the project (panel or editor): it is an AI project. */
  markAi(id: string) {
    const p = this.#need(id);
    if (p.origin === 'ai') return;
    p.origin = 'ai';
    p.updatedAt = this.#stamp();
    this.#write();
  }
  touch(id: string) {
    const p = this.project(id);
    if (!p) return;
    p.updatedAt = this.#stamp();
    this.#write();
  }

  // ---- Director waits -------------------------------------------------
  pause(id: string, state: Omit<DirectorPause, 'updatedAt'>) {
    const p = this.#need(id);
    p.pause = { ...state, updatedAt: this.#stamp() };
    p.origin = 'ai';
    p.updatedAt = this.#stamp();
    this.#write();
  }
  /** Marks a slot as filled (or not) by name; extensions never matter. */
  fillSlot(id: string, name: string, filled = true) {
    const p = this.#need(id);
    const slot = p.pause?.slots.find((s) => sameAsset(s.name, name));
    if (!slot) return false;
    slot.filled = filled;
    p.pause!.updatedAt = this.#stamp();
    this.#write();
    return true;
  }
  /** Director is done waiting (the project was built, or the person chose to go on). */
  resume(id: string) {
    const p = this.#need(id);
    p.pause = null;
    p.updatedAt = this.#stamp();
    this.#write();
  }

  // ---- Styles ---------------------------------------------------------
  /** The person may save a Style now, under the plan's rules. */
  canMakeStyle(rules: { maxStyles: number | null }): boolean {
    return (
      rules.maxStyles === null || this.#doc.styles.length < rules.maxStyles
    );
  }
  /** "Save to your styles": a new Style card; the project moves inside it. */
  makeStyle(input: {
    name: string;
    fromProjectId?: string | null;
    recordId?: string | null;
    maxStyles?: number | null;
  }): WsStyle {
    const name = input.name.trim().slice(0, 80);
    if (!name) throw new WorkspaceError('name', 'A Style needs a name.');
    if (
      input.maxStyles !== undefined &&
      input.maxStyles !== null &&
      this.#doc.styles.length >= input.maxStyles
    )
      throw new WorkspaceError(
        'style-cap',
        'Your plan has no room for another Style.',
      );
    const from = input.fromProjectId ? this.#need(input.fromProjectId) : null;
    const style: WsStyle = {
      id: rid('st'),
      name,
      createdAt: this.#stamp(),
      sourceProjectId: from?.id ?? null,
      recordId: input.recordId ?? null,
    };
    this.#doc.styles.push(style);
    if (from) {
      from.styleId = style.id;
      from.updatedAt = this.#stamp();
    }
    this.#write();
    return style;
  }
  renameStyle(id: string, name: string) {
    const s = this.style(id);
    if (!s) throw new WorkspaceError('unknown-style', 'That Style is gone.');
    const n = name.trim().slice(0, 80);
    if (!n) throw new WorkspaceError('name', 'A Style needs a name.');
    s.name = n;
    this.#write();
  }
  /** A project made inside a Style (checks the plan's cap). */
  addToStyle(
    projectId: string,
    styleId: string,
    rules: { maxProjectsPerStyle: number | null },
  ) {
    const p = this.#need(projectId);
    if (!this.style(styleId))
      throw new WorkspaceError('unknown-style', 'That Style is gone.');
    if (
      rules.maxProjectsPerStyle !== null &&
      p.styleId !== styleId &&
      this.projectsOf(styleId).length >= rules.maxProjectsPerStyle
    )
      throw new WorkspaceError(
        'style-project-cap',
        'This Style is full on your plan.',
      );
    p.styleId = styleId;
    p.updatedAt = this.#stamp();
    this.#write();
  }
  /** Takes a project out of its Style (it becomes a plain project card). */
  removeFromStyle(projectId: string) {
    const p = this.#need(projectId);
    p.styleId = null;
    this.#write();
  }

  // ---- Trash ----------------------------------------------------------
  trash(id: string) {
    const p = this.#need(id);
    p.trashedAt = this.#stamp();
    this.#write();
  }
  restore(id: string) {
    const p = this.#need(id);
    p.trashedAt = null;
    p.updatedAt = this.#stamp();
    this.#write();
  }
  /** Removes the record for good (the caller deletes the project and its files). */
  forget(id: string) {
    this.#doc.projects = this.#doc.projects.filter((p) => p.id !== id);
    this.#write();
  }
  /** Ids of trashed projects older than `days`. */
  expired(days: number): string[] {
    const limit = this.now().getTime() - days * 864e5;
    return this.#doc.projects
      .filter((p) => p.trashedAt && Date.parse(p.trashedAt) <= limit)
      .map((p) => p.id);
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
