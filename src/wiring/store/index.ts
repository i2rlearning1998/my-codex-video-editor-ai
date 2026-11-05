// P3-WIRING (W2): the Style > Project > Chat store for the signed-in person.
// Every key starts with the owner's id, so a person only ever reads their own
// records (the Projects library rule, D-356); each value also carries its
// owner and is checked on read. Caps from config are enforced on create.
import type {
  ChatRecord,
  ProjectMemory,
  StyleRecord,
} from '../../contracts/p3';
import {
  capFor,
  type PlatformConfig,
  type StyleCap,
} from '../../platform-config';
import { failure, P3Error } from '../errors';
import type { RecordBackend } from './backend';

export * from './backend';

interface Owned<T> {
  readonly owner: string;
  readonly value: T;
}
export interface StoreDeps {
  readonly backend: RecordBackend;
  /** The signed-in person, or null. */
  readonly owner: () => string | null;
  readonly config: () => PlatformConfig;
  /** The person's plan id (caps are per plan). */
  readonly planId: () => string;
}

const CAP_TEXT: Record<
  keyof StyleCap,
  { en: string; hi: string; code: string }
> = {
  maxStyles: {
    code: 'cap-styles',
    en: 'Your plan keeps up to {n} Styles. Upgrade to keep more.',
    hi: 'आपके प्लान में {n} Style तक रखे जा सकते हैं। ज़्यादा के लिए अपग्रेड करें।',
  },
  maxProjects: {
    code: 'cap-projects',
    en: 'Your plan keeps up to {n} projects. Upgrade to make more.',
    hi: 'आपके प्लान में {n} प्रोजेक्ट तक रखे जा सकते हैं। ज़्यादा के लिए अपग्रेड करें।',
  },
  maxChatsPerProject: {
    code: 'cap-chats',
    en: 'Your plan allows {n} chats in one project. Upgrade to start more.',
    hi: 'आपके प्लान में एक प्रोजेक्ट में {n} चैट हो सकती हैं। ज़्यादा के लिए अपग्रेड करें।',
  },
};
function capError(which: keyof StyleCap, n: number): P3Error {
  const t = CAP_TEXT[which];
  return new P3Error(
    failure(
      t.code,
      {
        en: t.en.replace('{n}', String(n)),
        hi: t.hi.replace('{n}', String(n)),
      },
      '/credits',
    ),
  );
}
const SIGNED_OUT = () =>
  new P3Error(
    failure('signed-out', {
      en: 'Please sign in first.',
      hi: 'पहले साइन इन करें।',
    }),
  );

export function createWiringStore(d: StoreDeps) {
  const me = (): string => {
    const id = d.owner();
    if (!id) throw SIGNED_OUT();
    return id;
  };
  const enc = encodeURIComponent;
  const k = {
    style: (o: string, id: string) => `${enc(o)}/style/${enc(id)}`,
    project: (o: string, id: string) => `${enc(o)}/project/${enc(id)}`,
    chat: (o: string, p: string, id: string) =>
      `${enc(o)}/chat/${enc(p)}/${enc(id)}`,
    chatIndex: (o: string, id: string) => `${enc(o)}/chatof/${enc(id)}`,
    plan: (o: string, id: string) => `${enc(o)}/plan/${enc(id)}`,
  };
  async function read<T>(key: string): Promise<T | null> {
    const o = me();
    const v = (await d.backend.get(key)) as Owned<T> | undefined;
    return v && v.owner === o ? v.value : null;
  }
  async function write<T>(key: string, value: T) {
    await d.backend.put(key, { owner: me(), value } satisfies Owned<T>);
  }
  async function all<T>(prefix: string): Promise<T[]> {
    const out: T[] = [];
    for (const key of await d.backend.keys(prefix)) {
      const v = await read<T>(key);
      if (v) out.push(v);
    }
    return out;
  }
  const cap = () => capFor(d.config(), d.planId());

  const store = {
    async styles(): Promise<StyleRecord[]> {
      const o = me();
      return (await all<StyleRecord>(`${enc(o)}/style/`)).filter(
        (s) => s.ownerId === o,
      );
    },
    async style(id: string): Promise<StyleRecord | null> {
      const s = await read<StyleRecord>(k.style(me(), id));
      return s && s.ownerId === me() ? s : null;
    },
    /** A new Style (draft or active), within the plan's Style cap. */
    async createStyle(s: StyleRecord): Promise<StyleRecord> {
      const o = me();
      const max = cap().maxStyles;
      if (max !== null && (await store.styles()).length >= max)
        throw capError('maxStyles', max);
      const rec = { ...s, ownerId: o };
      await write(k.style(o, rec.id), rec);
      return rec;
    },
    /** Saves a changed Style. Only "accept" calls it (never a chat). */
    async saveStyle(s: StyleRecord): Promise<StyleRecord> {
      const o = me();
      if (!(await store.style(s.id)))
        throw new P3Error(
          failure('style-unknown', { en: 'That Style was not found.' }),
        );
      const rec = { ...s, ownerId: o };
      await write(k.style(o, rec.id), rec);
      return rec;
    },
    async projects(): Promise<ProjectMemory[]> {
      return all<ProjectMemory>(`${enc(me())}/project/`);
    },
    memory(projectId: string): Promise<ProjectMemory | null> {
      return read<ProjectMemory>(k.project(me(), projectId));
    },
    /** A new project's memory, within the plan's project cap. */
    async createProject(m: ProjectMemory): Promise<ProjectMemory> {
      const max = cap().maxProjects;
      if (max !== null && (await store.projects()).length >= max)
        throw capError('maxProjects', max);
      await write(k.project(me(), m.projectId), m);
      return m;
    },
    async saveMemory(m: ProjectMemory): Promise<ProjectMemory> {
      await write(k.project(me(), m.projectId), m);
      return m;
    },
    chats(projectId: string): Promise<ChatRecord[]> {
      return all<ChatRecord>(`${enc(me())}/chat/${enc(projectId)}/`);
    },
    async chat(chatId: string): Promise<ChatRecord | null> {
      const o = me();
      const projectId = await read<string>(k.chatIndex(o, chatId));
      return projectId ? read<ChatRecord>(k.chat(o, projectId, chatId)) : null;
    },
    /** A new chat in a project, within the plan's chats-per-project cap. */
    async createChat(c: ChatRecord): Promise<ChatRecord> {
      const max = cap().maxChatsPerProject;
      if (max !== null && (await store.chats(c.projectId)).length >= max)
        throw capError('maxChatsPerProject', max);
      return store.saveChat(c);
    },
    async saveChat(c: ChatRecord): Promise<ChatRecord> {
      const o = me();
      await write(k.chatIndex(o, c.id), c.projectId);
      await write(k.chat(o, c.projectId, c.id), c);
      return c;
    },
    /** A plan the Director made (the video plan JSON, checked). */
    async savePlan(id: string, plan: unknown, chatId: string): Promise<void> {
      await write(k.plan(me(), id), { plan, chatId });
    },
    async plan(id: string): Promise<{ plan: unknown; chatId: string } | null> {
      return read<{ plan: unknown; chatId: string }>(k.plan(me(), id));
    },
    /** User messages the person sent since `since` (the per-day limit). */
    async userMessagesSince(since: string): Promise<number> {
      const o = me();
      let n = 0;
      for (const c of await all<ChatRecord>(`${enc(o)}/chat/`))
        n += c.messages.filter(
          (m) => m.role === 'user' && m.at >= since,
        ).length;
      return n;
    },
  };
  return store;
}
export type WiringStore = ReturnType<typeof createWiringStore>;
