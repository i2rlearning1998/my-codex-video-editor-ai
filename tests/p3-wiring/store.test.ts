// P3-WIRING W2: Style > Project > Chat store, caps, start paths, Style drafts.
import { describe, expect, it } from 'vitest';
import type { StyleRecord } from '../../src/contracts/p3';
import { defaultConfig, p3Settings } from '../../src/platform-config';
import { P3Error } from '../../src/wiring/errors';
import {
  acceptStyle,
  contextFor,
  makeStyle,
  startConversation,
  styleSource,
} from '../../src/wiring/memory-levels';
import { createWiringStore, memoryBackend } from '../../src/wiring/store';
import { stubMemoryEngine } from './stubs/engines';

function setup(plan = 'free') {
  const backend = memoryBackend();
  let user: string | null = 'u1';
  const config = defaultConfig();
  let n = 0;
  const store = createWiringStore({
    backend,
    owner: () => user,
    config: () => config,
    planId: () => plan,
  });
  const d = {
    store,
    config: () => config,
    now: () => new Date('2026-11-05T10:00:00Z'),
    newId: (p: string) => `${p}-${++n}`,
  };
  return { d, store, config, as: (u: string | null) => (user = u) };
}
const style = (over: Partial<StyleRecord> = {}): StyleRecord => ({
  id: 's1',
  ownerId: 'u1',
  name: 'Mine',
  status: 'active',
  rules: ['Use Hindi'],
  dos: [],
  donts: [],
  palette: [],
  fonts: { heading: 'Inter', body: 'Inter' },
  voice: { language: 'hi', tone: 'warm' },
  pacing: '',
  sourceProjectId: null,
  version: 1,
  updatedAt: '2026-11-05T00:00:00Z',
  ...over,
});
const failureOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof P3Error) return e.failure;
    throw e;
  }
  throw new Error('expected a refusal');
};

describe('P3-WIRING store and memory levels', () => {
  it('[P3W-005] a person sees only their own Styles, projects and chats', async () => {
    const { d, store, as } = setup('pro');
    await store.createStyle(style());
    const { chat } = await startConversation(d, { kind: 'blank' });
    as('u2');
    expect(await store.styles()).toEqual([]);
    expect(await store.style('s1')).toBeNull();
    expect(await store.chat(chat.id)).toBeNull();
    expect(await store.projects()).toEqual([]);
    as(null);
    expect((await failureOf(store.styles())).code).toBe('signed-out');
  });

  it('[P3W-006] the Style cap from config is enforced on create with a plain sentence and upgrade', async () => {
    const { store, config } = setup('free');
    expect(config.styleCaps.free!.maxStyles).toBe(1);
    await store.createStyle(style());
    const f = await failureOf(store.createStyle(style({ id: 's2' })));
    expect(f).toMatchObject({ code: 'cap-styles', upgrade: '/credits' });
    expect(f.message.en).toBe(
      'Your plan keeps up to 1 Styles. Upgrade to keep more.',
    );
    // Projects and chats-per-project caps too.
    config.styleCaps.free = {
      maxStyles: 1,
      maxProjects: 1,
      maxChatsPerProject: 1,
    };
    const { d } = setup('free');
    d.config = () => config;
    const s2 = createWiringStore({
      backend: memoryBackend(),
      owner: () => 'u1',
      config: () => config,
      planId: () => 'free',
    });
    const dd = { ...d, store: s2 };
    const a = await startConversation(dd, { kind: 'blank' });
    expect(
      (
        await failureOf(
          startConversation(dd, { kind: 'blank' }, a.project.projectId),
        )
      ).code,
    ).toBe('cap-chats');
    expect(
      (await failureOf(startConversation(dd, { kind: 'blank' }))).code,
    ).toBe('cap-projects');
  });

  it('[P3W-007] the three start paths make the same chat; brief answers become the first facts', async () => {
    const { d, store } = setup('pro');
    await store.createStyle(style());
    const blank = await startConversation(d, { kind: 'blank' });
    const fromStyle = await startConversation(d, {
      kind: 'style',
      styleId: 's1',
    });
    const brief = await startConversation(d, {
      kind: 'brief',
      styleId: 'story-explainer',
      answers: { idea: 'How Eratosthenes measured the Earth', language: 'hi' },
    });
    for (const r of [blank, fromStyle, brief]) {
      expect(Object.keys(r.chat).sort()).toEqual(
        ['id', 'messages', 'projectId', 'summary', 'title', 'updatedAt'].sort(),
      );
      expect(r.chat.messages).toEqual([]);
      expect(await store.chat(r.chat.id)).toEqual(r.chat);
    }
    expect(blank.project.styleId).toBeNull();
    expect(fromStyle.project.styleId).toBe('s1');
    expect(brief.project.styleId).toBe('story-explainer');
    expect(brief.project.facts.map((f) => f.text)).toContain(
      'The idea: How Eratosthenes measured the Earth',
    );
    expect(
      brief.project.facts.every((f) => f.source === 'user' && f.pinned),
    ).toBe(true);
  });

  it('[P3W-008] "Make this my Style" saves a draft; a draft is never read into a call; accept makes it active, version + 1', async () => {
    const { d, store } = setup('pro');
    const engine = stubMemoryEngine();
    const { project } = await startConversation(d, {
      kind: 'brief',
      styleId: 'story-explainer',
      answers: { idea: 'Tides' },
    });
    const settings = p3Settings(defaultConfig()).memory;
    const draft = await makeStyle(
      { ...d, engine, call: async () => 'ok' },
      'u1',
      project.projectId,
      'Explainers',
      settings,
    );
    expect(draft.status).toBe('draft');
    expect(draft.version).toBe(0);
    expect(draft.sourceProjectId).toBe(project.projectId);
    // A draft is not a Style source and cannot start a chat.
    expect(await styleSource(d, draft.id)).toBeNull();
    expect(
      (
        await failureOf(
          startConversation(d, { kind: 'style', styleId: draft.id }),
        )
      ).code,
    ).toBe('style-draft');
    const memory = (await store.memory(project.projectId))!;
    const ctx = contextFor(
      engine,
      await styleSource(d, draft.id),
      { ...memory, styleId: draft.id },
      (await store.chats(project.projectId))[0]!,
      settings,
    );
    expect(ctx.text.startsWith('STYLE\n(none)')).toBe(true);
    expect(ctx.text).not.toContain('Explainers');
    const active = await acceptStyle(
      d,
      draft.id,
      {
        name: 'My explainers',
        rules: ['Slow down'],
        status: 'draft',
        version: 99,
        ownerId: 'x',
      },
      settings,
    );
    expect(active).toMatchObject({
      status: 'active',
      version: 1,
      name: 'My explainers',
      rules: ['Slow down'],
      ownerId: 'u1',
    });
    const after = contextFor(
      engine,
      await styleSource(d, draft.id),
      memory,
      (await store.chats(project.projectId))[0]!,
      settings,
    );
    expect(after.text.startsWith('STYLE: My explainers (version 1)')).toBe(
      true,
    );
  });
});
