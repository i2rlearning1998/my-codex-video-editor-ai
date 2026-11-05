import { expect, it, vi } from 'vitest';
import { createMemoryEngine, estimateTokens } from '../../src/memory';
import type {
  ChatRecord,
  MemorySettings,
  ProjectMemory,
  StyleRecord,
  TextCall,
} from '../../src/contracts/p3';
const engine = createMemoryEngine();
const settings: MemorySettings = {
  keepRecent: 2,
  summariseAboveTokens: 200,
  maxFacts: 3,
  maxStyleRules: 2,
};
const at = '2026-11-05T00:00:00.000Z';
const chat: ChatRecord = {
  id: 'c',
  projectId: 'p',
  title: 'Chat',
  messages: Array.from({ length: 5 }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 ? ('assistant' as const) : ('user' as const),
    text: `Turn ${i}: ` + 'content '.repeat(50),
    attachmentIds: [],
    at,
  })),
  summary: { text: 'Earlier decisions.', coversUpTo: 'earlier', tokens: 5 },
  updatedAt: at,
};
const memory: ProjectMemory = {
  projectId: 'p',
  styleId: null,
  facts: [
    { id: 'f1', text: 'Use teal', source: 'user', pinned: true, createdAt: at },
  ],
  updatedAt: at,
};
const body = {
  rules: ['Use flat shapes'],
  dos: ['Be clear'],
  donts: ['No gradients'],
  palette: ['teal'],
  fonts: { heading: 'Inter', body: 'Inter' },
  voice: { language: 'hi', tone: 'warm' },
  pacing: 'calm',
};
const style: StyleRecord = {
  ...body,
  id: 's',
  ownerId: 'u',
  name: 'Style',
  status: 'active',
  sourceProjectId: 'p',
  version: 1,
  updatedAt: at,
};
it('[P3E-040] summary includes older turns and previous summary, preserving keepRecent verbatim', async () => {
  const call = vi
    .fn<TextCall>()
    .mockResolvedValue('All earlier decisions in a summary.');
  const before = structuredClone(chat);
  const out = await engine.summarise(chat, settings, call);
  expect(out.messages).toEqual(chat.messages.slice(-2));
  expect(out.summary).toMatchObject({
    coversUpTo: 'm2',
    tokens: estimateTokens('All earlier decisions in a summary.'),
  });
  expect(JSON.parse(call.mock.calls[0]![0].user)).toEqual({
    previousSummary: chat.summary,
    older: chat.messages.slice(0, 3),
  });
  expect(chat).toEqual(before);
  const emptyRecent = await engine.summarise(
    chat,
    { ...settings, keepRecent: 0 },
    call,
  );
  expect(emptyRecent.messages).toEqual([]);
  expect(emptyRecent.summary?.coversUpTo).toBe('m4');
  call.mockClear();
  await engine.summarise({ ...chat, messages: [] }, settings, call);
  expect(call).not.toHaveBeenCalled();
});
it('[P3E-041] context puts the unchanged read-only style first and stays under the estimated token budget', () => {
  const before = structuredClone(style);
  const context = engine.context({ style, memory, chat, settings });
  expect(
    context.text.startsWith('STYLE (read-only):\n' + JSON.stringify(style)),
  ).toBe(true);
  expect(context.tokens).toBeLessThanOrEqual(settings.summariseAboveTokens);
  expect(context.tokens).toBe(estimateTokens(context.text));
  expect(style).toEqual(before);
  expect(() =>
    engine.context({
      style,
      memory,
      chat,
      settings: { ...settings, summariseAboveTokens: 1 },
    }),
  ).toThrow('style exceeds');
});
it('[P3E-042] facts normalise duplicates, preserve pinned facts and cap unpinned additions', async () => {
  const call = vi.fn<TextCall>().mockResolvedValue(
    JSON.stringify({
      facts: [
        ' use   TEAL ',
        'Make titles clear',
        'MAKE TITLES CLEAR',
        'Use Hindi',
        'Too many',
      ],
    }),
  );
  const out = await engine.extractFacts(memory, chat.messages, settings, call);
  expect(out.facts).toHaveLength(3);
  expect(out.facts[0]).toEqual(memory.facts[0]);
  expect(out.facts.map((f) => f.text)).toEqual([
    'Use teal',
    'Make titles clear',
    'Use Hindi',
  ]);
  const pinned = {
    ...memory,
    facts: [
      ...out.facts.map((f) => ({ ...f, pinned: true })),
      { ...memory.facts[0]!, id: 'extra' },
    ],
  };
  expect(
    (
      await engine.extractFacts(
        pinned,
        chat.messages,
        { ...settings, maxFacts: 1 },
        call,
      )
    ).facts,
  ).toEqual(pinned.facts);
});
it('[P3E-043] distillation returns a deterministic draft and repairs malformed JSON once', async () => {
  const call = vi
    .fn<TextCall>()
    .mockResolvedValueOnce('not JSON')
    .mockResolvedValueOnce(JSON.stringify(body));
  const input = { ownerId: 'u', memory, chats: [chat], name: 'New style' };
  const result = await engine.distillStyle(input, settings, call);
  expect(result).toMatchObject({
    ...body,
    status: 'draft',
    ownerId: 'u',
    sourceProjectId: 'p',
  });
  expect(call).toHaveBeenCalledTimes(2);
  expect(
    await engine.distillStyle(input, settings, async () =>
      JSON.stringify(body),
    ),
  ).toEqual(result);
});
it('[P3E-044] over-limit rules and invalid repair fail with one plain sentence and no third call', async () => {
  const call = vi
    .fn<TextCall>()
    .mockResolvedValue(JSON.stringify({ ...body, rules: ['a', 'b', 'c'] }));
  await expect(
    engine.distillStyle(
      { ownerId: 'u', memory, chats: [chat], name: 'New style' },
      settings,
      call,
    ),
  ).rejects.toThrow('A style draft could not be created.');
  expect(call).toHaveBeenCalledTimes(2);
});
