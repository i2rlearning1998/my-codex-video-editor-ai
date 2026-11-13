// ROUND-B B1: what Director remembers, by level. No DOM, no network.
//
//   Account        Brand Kit and language live in the person's preferences;
//                  the voice preference is kept here.
//   Project memory facts and decisions for EVERY Video of a Project
//                  (the style record itself is in the workspace).
//   Video sheet    brief, one line per scene, assets and decisions for THIS
//                  Video. Updated after every approved step.
//   File notes     one short note per attached file, so a file is read once.
//   Chats          many per Video, each with a rolling summary.
//   Canvas         never stored: read live on every message.
//
// Storage: `aive.vmem.<userId>` (one JSON document). The panel (Project page
// Memory tab) and AI mode both use this module; neither holds a copy.

export interface Entry {
  id: string;
  text: string;
  pinned: boolean;
  source: 'user' | 'director';
  at: string;
  /** A sheet entry made by an applied change: layer hashes before and after. */
  check?: { before: Record<string, string>; after: Record<string, string> };
}
export type SheetPart = 'brief' | 'scenes' | 'assets' | 'decisions';
export interface Sheet {
  brief: Entry[];
  scenes: Entry[];
  assets: Entry[];
  decisions: Entry[];
}
export interface FileNote {
  id: string;
  name: string;
  kind: string;
  bytes: number;
  note: string;
  at: string;
}
export interface Turn {
  id: string;
  role: 'user' | 'director';
  text: string;
  /** A card shown with this turn (brief, plan, assets, proposal ...), as data. */
  card?: { kind: string; state: unknown };
  at: string;
}
export interface Chat {
  id: string;
  title: string;
  turns: Turn[];
  /** Covers every turn before `turns[0]`. */
  summary: string;
  updatedAt: string;
}
export interface VideoMemory {
  sheet: Sheet;
  notes: FileNote[];
  chats: Chat[];
  /** Layer id to the hash Director last left it with (hand edits differ). */
  touched: Record<string, string>;
  /** Where the flow stands, so a reload resumes there. */
  flow?: unknown;
  /** Plan rewrites used (the limit is the owner's). */
  rewrites: number;
}
export interface MemoryDoc {
  version: 1;
  account: { voice: string };
  projects: Record<string, { facts: Entry[] }>;
  videos: Record<string, VideoMemory>;
  /** P3 chats moved from Projects to Videos (done once). */
  migrated?: boolean;
}
export interface MemoryCaps {
  maxProjectFacts: number;
  maxSheetEntries: number;
  maxFileNotes: number;
  maxNoteChars: number;
  maxChatsPerVideo: number;
  /** Turns kept word for word; older ones go into the summary. */
  keepTurns: number;
  maxSummaryChars: number;
}
export const DEFAULT_CAPS: MemoryCaps = {
  maxProjectFacts: 40,
  maxSheetEntries: 60,
  maxFileNotes: 12,
  maxNoteChars: 400,
  maxChatsPerVideo: 20,
  keepTurns: 16,
  maxSummaryChars: 1200,
};

type KV = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
};
const emptySheet = (): Sheet => ({
  brief: [],
  scenes: [],
  assets: [],
  decisions: [],
});
export const emptyVideoMemory = (): VideoMemory => ({
  sheet: emptySheet(),
  notes: [],
  chats: [],
  touched: {},
  rewrites: 0,
});
const emptyDoc = (): MemoryDoc => ({
  version: 1,
  account: { voice: '' },
  projects: {},
  videos: {},
});
let seq = 0;
const newId = (p: string) =>
  `${p}-${Date.now().toString(36)}-${(++seq).toString(36)}`;
const clip = (s: string, n: number) =>
  [...s].length > n ? `${[...s].slice(0, n - 1).join('')}…` : s;

/** Pinned entries first, then the newest; never more than `max`. */
export function capEntries(list: Entry[], max: number): Entry[] {
  if (list.length <= max) return list;
  const keep = new Set(
    [...list]
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at),
      )
      .slice(0, max)
      .map((e) => e.id),
  );
  return list.filter((e) => keep.has(e.id));
}

/**
 * Old turns leave the chat and one line of each joins the summary (the model
 * may write a better summary later; this one costs nothing and is always
 * there).
 */
export function rollChat(chat: Chat, caps: MemoryCaps): Chat {
  if (chat.turns.length <= caps.keepTurns) return chat;
  const cut = chat.turns.length - caps.keepTurns;
  const old = chat.turns.slice(0, cut);
  const lines = old.map(
    (t) => `${t.role === 'user' ? 'Person' : 'Director'}: ${clip(t.text, 140)}`,
  );
  const summary = clip(
    [chat.summary, ...lines].filter(Boolean).join('\n'),
    caps.maxSummaryChars * 4,
  );
  // Keep the newest part when it is too long.
  const s = [...summary];
  return {
    ...chat,
    turns: chat.turns.slice(cut),
    summary:
      s.length > caps.maxSummaryChars
        ? `…${s.slice(s.length - caps.maxSummaryChars + 1).join('')}`
        : summary,
  };
}

/** A P3 chat as the real Director service kept it (per Project). */
export interface OldChat {
  id: string;
  projectId: string;
  title: string;
  messages: readonly { id: string; role: string; text: string; at: string }[];
  summary: { text: string } | null;
  updatedAt: string;
}

export class MemoryStore {
  #doc: MemoryDoc;
  readonly #key: string;
  constructor(
    private readonly storage: KV,
    userId: string,
    private readonly caps: () => MemoryCaps = () => DEFAULT_CAPS,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.#key = `aive.vmem.${userId}`;
    this.#doc = this.#read();
  }
  #read(): MemoryDoc {
    try {
      const raw = JSON.parse(
        this.storage.getItem(this.#key) ?? 'null',
      ) as MemoryDoc | null;
      if (raw && raw.version === 1)
        return {
          ...emptyDoc(),
          ...raw,
          projects: raw.projects ?? {},
          videos: raw.videos ?? {},
        };
    } catch {
      /* A damaged document starts empty; nothing else depends on it. */
    }
    return emptyDoc();
  }
  #save() {
    this.storage.setItem(this.#key, JSON.stringify(this.#doc));
  }
  /** Reads again (another tab, or the panel after the editor). */
  reload() {
    this.#doc = this.#read();
  }
  doc(): Readonly<MemoryDoc> {
    return this.#doc;
  }
  #at() {
    return this.now().toISOString();
  }
  #entry(text: string, source: Entry['source'], pinned = false): Entry {
    return {
      id: newId('m'),
      text: text.trim(),
      pinned,
      source,
      at: this.#at(),
    };
  }

  // ---- account ------------------------------------------------------------
  voice(): string {
    return this.#doc.account.voice;
  }
  setVoice(v: string) {
    this.#doc.account.voice = v;
    this.#save();
  }

  // ---- Project memory -----------------------------------------------------
  facts(projectId: string): readonly Entry[] {
    return this.#doc.projects[projectId]?.facts ?? [];
  }
  addFact(
    projectId: string,
    text: string,
    source: Entry['source'] = 'user',
    pinned = false,
  ): Entry | null {
    const clean = text.trim();
    if (!clean) return null;
    const p = (this.#doc.projects[projectId] ??= { facts: [] });
    const same = p.facts.find(
      (f) => f.text.toLowerCase() === clean.toLowerCase(),
    );
    if (same) return same;
    const e = this.#entry(clean, source, pinned);
    p.facts = capEntries([...p.facts, e], this.caps().maxProjectFacts);
    this.#save();
    return e;
  }
  patchFact(projectId: string, id: string, patch: Partial<Entry>) {
    const p = this.#doc.projects[projectId];
    if (!p) return;
    p.facts = p.facts.map((f) => (f.id === id ? { ...f, ...patch, id } : f));
    this.#save();
  }
  forgetFact(projectId: string, id: string) {
    const p = this.#doc.projects[projectId];
    if (!p) return;
    p.facts = p.facts.filter((f) => f.id !== id);
    this.#save();
  }

  // ---- Video ----------------------------------------------------------------
  video(videoId: string): VideoMemory {
    return (this.#doc.videos[videoId] ??= emptyVideoMemory());
  }
  has(videoId: string): boolean {
    return !!this.#doc.videos[videoId];
  }
  forgetVideo(videoId: string) {
    delete this.#doc.videos[videoId];
    this.#save();
  }
  forgetProject(projectId: string) {
    delete this.#doc.projects[projectId];
    this.#save();
  }
  /** A copy of one Video's sheet, notes and brief for a duplicate (no chats). */
  copyVideo(fromId: string, toId: string) {
    const v = this.#doc.videos[fromId];
    if (!v) return;
    this.#doc.videos[toId] = {
      ...emptyVideoMemory(),
      sheet: JSON.parse(JSON.stringify(v.sheet)) as Sheet,
      notes: v.notes.map((n) => ({ ...n })),
    };
    this.#save();
  }
  sheet(videoId: string): Sheet {
    return this.video(videoId).sheet;
  }
  /** Adds one line to a part of the sheet (the same text twice is one line). */
  note(
    videoId: string,
    part: SheetPart,
    text: string,
    source: Entry['source'] = 'director',
    check?: Entry['check'],
  ): Entry | null {
    const clean = text.trim();
    if (!clean) return null;
    const v = this.video(videoId);
    const same = v.sheet[part].find((e) => e.text === clean);
    if (same) return same;
    const e = { ...this.#entry(clean, source), ...(check ? { check } : {}) };
    v.sheet[part] = capEntries(
      [...v.sheet[part], e],
      this.caps().maxSheetEntries,
    );
    this.#save();
    return e;
  }
  /** Replaces a whole part (the brief after it is approved, the scene lines). */
  setPart(
    videoId: string,
    part: SheetPart,
    lines: readonly string[],
    source: Entry['source'] = 'director',
  ) {
    const v = this.video(videoId);
    const old = v.sheet[part];
    // A line the person pinned or wrote stays; a line that did not change
    // keeps its id (so a pin survives a rebuild of the part).
    const kept = old.filter((e) => e.pinned || e.source === 'user');
    const next: Entry[] = [];
    for (const text of lines.map((l) => l.trim()).filter(Boolean)) {
      const same = old.find((e) => e.text === text);
      next.push(same ?? this.#entry(text, source));
    }
    for (const e of kept) if (!next.some((n) => n.id === e.id)) next.push(e);
    v.sheet[part] = capEntries(next, this.caps().maxSheetEntries);
    this.#save();
  }
  patchEntry(
    videoId: string,
    part: SheetPart,
    id: string,
    patch: Partial<Entry>,
  ) {
    const v = this.video(videoId);
    v.sheet[part] = v.sheet[part].map((e) =>
      e.id === id ? { ...e, ...patch, id } : e,
    );
    this.#save();
  }
  forgetEntry(videoId: string, part: SheetPart, id: string) {
    const v = this.video(videoId);
    v.sheet[part] = v.sheet[part].filter((e) => e.id !== id);
    this.#save();
  }

  // ---- file notes -----------------------------------------------------------
  fileNote(
    videoId: string,
    file: { name: string; kind: string; bytes: number },
    note: string,
  ): FileNote {
    const v = this.video(videoId);
    const caps = this.caps();
    const same = v.notes.find(
      (n) => n.name === file.name && n.bytes === file.bytes,
    );
    if (same) return same;
    const made: FileNote = {
      id: newId('file'),
      ...file,
      note: clip(note.trim(), caps.maxNoteChars),
      at: this.#at(),
    };
    v.notes = [...v.notes, made].slice(-caps.maxFileNotes);
    this.#save();
    return made;
  }
  noteFor(
    videoId: string,
    file: { name: string; bytes: number },
  ): FileNote | undefined {
    return this.video(videoId).notes.find(
      (n) => n.name === file.name && n.bytes === file.bytes,
    );
  }

  // ---- chats ----------------------------------------------------------------
  chats(videoId: string): readonly Chat[] {
    return this.video(videoId).chats;
  }
  chat(videoId: string, chatId: string): Chat | undefined {
    return this.video(videoId).chats.find((c) => c.id === chatId);
  }
  /** The newest chat, or a new one when the Video has none. */
  currentChat(videoId: string): Chat {
    const list = this.video(videoId).chats;
    return list.length
      ? [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!
      : this.newChat(videoId);
  }
  newChat(videoId: string, title = ''): Chat {
    const v = this.video(videoId);
    const c: Chat = {
      id: newId('chat'),
      title,
      turns: [],
      summary: '',
      updatedAt: this.#at(),
    };
    v.chats = [...v.chats, c].slice(-this.caps().maxChatsPerVideo);
    this.#save();
    return c;
  }
  addTurn(
    videoId: string,
    chatId: string,
    turn: Pick<Turn, 'role' | 'text'> & { card?: Turn['card'] },
  ): Turn {
    const v = this.video(videoId);
    const made: Turn = {
      id: newId('t'),
      at: this.#at(),
      role: turn.role,
      text: turn.text,
      ...(turn.card ? { card: turn.card } : {}),
    };
    v.chats = v.chats.map((c) => {
      if (c.id !== chatId) return c;
      const title =
        c.title || (turn.role === 'user' ? clip(turn.text, 48) : c.title);
      return rollChat(
        { ...c, title, turns: [...c.turns, made], updatedAt: made.at },
        this.caps(),
      );
    });
    this.#save();
    return made;
  }
  /** Changes a turn's card (a proposal applied, a plan approved ...). */
  setCard(videoId: string, chatId: string, turnId: string, card: Turn['card']) {
    const v = this.video(videoId);
    v.chats = v.chats.map((c) =>
      c.id !== chatId
        ? c
        : {
            ...c,
            turns: c.turns.map((t) => {
              if (t.id !== turnId) return t;
              const { card: _old, ...rest } = t;
              void _old;
              return card ? { ...rest, card } : rest;
            }),
          },
    );
    this.#save();
  }
  setSummary(videoId: string, chatId: string, summary: string) {
    const v = this.video(videoId);
    v.chats = v.chats.map((c) =>
      c.id === chatId
        ? { ...c, summary: clip(summary, this.caps().maxSummaryChars) }
        : c,
    );
    this.#save();
  }

  // ---- flow, rewrites, touched layers -----------------------------------------
  flow<T>(videoId: string): T | undefined {
    return this.video(videoId).flow as T | undefined;
  }
  setFlow(videoId: string, flow: unknown) {
    this.video(videoId).flow = flow;
    this.#save();
  }
  rewrites(videoId: string): number {
    return this.video(videoId).rewrites;
  }
  countRewrite(videoId: string) {
    this.video(videoId).rewrites += 1;
    this.#save();
  }
  touched(videoId: string): Readonly<Record<string, string>> {
    return this.video(videoId).touched;
  }
  setTouched(videoId: string, hashes: Record<string, string>) {
    const v = this.video(videoId);
    v.touched = { ...v.touched, ...hashes };
    this.#save();
  }
  /** Layers that no longer exist are forgotten. */
  pruneTouched(videoId: string, alive: ReadonlySet<string>) {
    const v = this.video(videoId);
    v.touched = Object.fromEntries(
      Object.entries(v.touched).filter(([id]) => alive.has(id)),
    );
    this.#save();
  }
  /**
   * Sheet and canvas agree: a decision whose layers are back at their state
   * before the change (it was undone in the editor) leaves the sheet.
   * Returns the lines removed.
   */
  reconcile(
    videoId: string,
    hashes: Readonly<Record<string, string>>,
  ): string[] {
    const v = this.video(videoId);
    const gone: string[] = [];
    v.sheet.decisions = v.sheet.decisions.filter((e) => {
      if (!e.check) return true;
      const ids = Object.keys(e.check.after);
      if (!ids.length) return true;
      const undone = ids.every(
        (id) =>
          (hashes[id] ?? '') === (e.check!.before[id] ?? '') &&
          (hashes[id] ?? '') !== (e.check!.after[id] ?? ''),
      );
      if (undone) gone.push(e.text);
      return !undone;
    });
    if (gone.length) {
      for (const [id, hash] of Object.entries(hashes))
        if (id in v.touched) v.touched[id] = hash;
      this.#save();
    }
    return gone;
  }

  // ---- migration of P3 chats (Project to its first Video) ---------------------
  /**
   * P3 kept Director chats and facts per Project. Each chat moves to the
   * Project's first Video; facts become Project memory. Runs once; a second
   * run changes nothing.
   */
  migrateOld(
    old: {
      chats: readonly OldChat[];
      facts: Readonly<
        Record<
          string,
          readonly { text: string; pinned: boolean; source: string }[]
        >
      >;
    },
    firstVideoOf: (projectId: string) => string | undefined,
  ): { chats: number; facts: number } {
    if (this.#doc.migrated) return { chats: 0, facts: 0 };
    let chats = 0;
    let facts = 0;
    for (const c of old.chats) {
      // A chat already keyed by a Video stays there.
      const videoId = firstVideoOf(c.projectId) ?? c.projectId;
      const v = this.video(videoId);
      if (v.chats.some((x) => x.id === c.id)) continue;
      v.chats.push(
        rollChat(
          {
            id: c.id,
            title: c.title,
            summary: c.summary?.text ?? '',
            updatedAt: c.updatedAt,
            turns: c.messages.map((m) => ({
              id: m.id,
              role:
                m.role === 'user' ? ('user' as const) : ('director' as const),
              text: m.text,
              at: m.at,
            })),
          },
          this.caps(),
        ),
      );
      chats++;
    }
    for (const [projectId, list] of Object.entries(old.facts))
      for (const f of list) {
        const before = this.facts(projectId).length;
        this.addFact(
          projectId,
          f.text,
          f.source === 'user' ? 'user' : 'director',
          f.pinned,
        );
        if (this.facts(projectId).length > before) facts++;
      }
    this.#doc.migrated = true;
    this.#save();
    return { chats, facts };
  }
}
