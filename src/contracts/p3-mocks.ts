// P3 mocks: in-memory implementations of the P3 services so every screen is
// built and screenshot-tested without Part 1 or Part 2. They are deterministic
// and cover the states the UI must show (thinking, refusing, building,
// failures, empty lists). They are NEVER shipped as the real service.
import type {
  Attachment,
  ChatRecord,
  DirectorEvent,
  DirectorService,
  MemoryFact,
  ProjectMemory,
  Result,
  StartPath,
  StyleRecord,
} from './p3';

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      rej(new DOMException('aborted', 'AbortError'));
    });
  });

const REFUSE = /free credits|hack|password|api key|ignore (all )?previous/i;
const OFFTOPIC = /\b(weather|cricket|stock price|recipe)\b/i;

export interface MockDirectorOptions {
  /** ms between streamed tokens (tests set 0). */
  readonly tokenDelay?: number;
  readonly now?: () => Date;
}

export function createMockDirector(
  opts: MockDirectorOptions = {},
): DirectorService {
  const delay = opts.tokenDelay ?? 28;
  const now = () => (opts.now ?? (() => new Date()))().toISOString();
  const chats = new Map<string, ChatRecord>();
  const memories = new Map<string, ProjectMemory>();
  const styles = new Map<string, StyleRecord>();
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;

  const memoryOf = (projectId: string): ProjectMemory =>
    memories.get(projectId) ?? {
      projectId,
      styleId: null,
      facts: [],
      updatedAt: now(),
    };

  return {
    async start(path: StartPath, projectId = id('project')) {
      const mem: ProjectMemory = {
        ...memoryOf(projectId),
        styleId: path.kind === 'blank' ? null : path.styleId,
        facts:
          path.kind === 'brief'
            ? Object.entries(path.answers).map(([k, v]) => ({
                id: id('fact'),
                text: `${k}: ${v}`,
                source: 'user' as const,
                pinned: false,
                createdAt: now(),
              }))
            : [],
      };
      memories.set(projectId, mem);
      const chat: ChatRecord = {
        id: id('chat'),
        projectId,
        title: 'New chat',
        messages: [],
        summary: null,
        updatedAt: now(),
      };
      chats.set(chat.id, chat);
      return { chat, project: mem };
    },

    async *send(input): AsyncIterable<DirectorEvent> {
      const text = input.text.trim();
      const chat = chats.get(input.chatId);
      if (chat)
        chats.set(chat.id, {
          ...chat,
          messages: [
            ...chat.messages,
            {
              id: id('m'),
              role: 'user',
              text,
              attachmentIds: input.attachmentIds,
              at: now(),
            },
          ],
        });
      try {
        // Refusals come first and never wait for a model.
        if (REFUSE.test(text) || OFFTOPIC.test(text)) {
          yield { type: 'state', state: 'refusing' };
          await wait(delay * 8, input.signal);
          yield {
            type: 'refusal',
            reply: REFUSE.test(text)
              ? {
                  en: 'I cannot help with that. I can only help you make your video.',
                  hi: 'इसमें मैं मदद नहीं कर सकता। मैं सिर्फ़ आपका वीडियो बनाने में मदद कर सकता हूँ।',
                }
              : {
                  en: 'That is outside video making. Tell me about your video instead.',
                  hi: 'यह वीडियो बनाने से बाहर है। अपने वीडियो के बारे में बताइए।',
                },
            alternative: {
              en: 'Try: “Make a 60 second explainer about how rainbows form.”',
              hi: 'आज़माइए: “इंद्रधनुष कैसे बनता है, इस पर 60 सेकंड का एक्सप्लेनर बनाओ।”',
            },
          };
          yield { type: 'state', state: 'idle' };
          yield { type: 'done', creditsUsed: 0 };
          return;
        }
        if (/^fail/i.test(text)) {
          yield { type: 'state', state: 'thinking' };
          await wait(delay * 6, input.signal);
          yield {
            type: 'failure',
            failure: {
              code: 'provider-error',
              message: {
                en: 'The model did not answer. Your credits were not used.',
                hi: 'मॉडल ने जवाब नहीं दिया। आपके क्रेडिट इस्तेमाल नहीं हुए।',
              },
            },
          };
          yield { type: 'state', state: 'idle' };
          return;
        }

        yield { type: 'state', state: 'thinking' };
        await wait(delay * 14, input.signal);
        yield { type: 'state', state: 'speaking' };
        const reply = `Got it. I will make this in your Style: ${
          text.length > 60 ? `${text.slice(0, 57)}…` : text
        }. How long should the video be?`;
        for (const word of reply.split(/(?<=\s)/)) {
          yield { type: 'token', text: word };
          await wait(delay, input.signal);
        }
        yield {
          type: 'question',
          question: {
            id: 'length',
            text: {
              en: 'How long should it be?',
              hi: 'कितना लंबा होना चाहिए?',
            },
            answers: [
              { value: '30', label: { en: '30 seconds', hi: '30 सेकंड' } },
              { value: '60', label: { en: '1 minute', hi: '1 मिनट' } },
              { value: '180', label: { en: '3 minutes', hi: '3 मिनट' } },
            ],
            allowFreeText: true,
          },
        };
        const fact: MemoryFact = {
          id: id('fact'),
          text: text.slice(0, 120),
          source: 'chat',
          pinned: false,
          createdAt: now(),
        };
        if (chat) {
          const mem = memoryOf(chat.projectId);
          memories.set(chat.projectId, {
            ...mem,
            facts: [...mem.facts, fact],
            updatedAt: now(),
          });
        }
        yield { type: 'memory', added: [fact] };
        yield { type: 'state', state: 'idle' };
        yield { type: 'done', creditsUsed: 2 };
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          yield { type: 'state', state: 'idle' };
          return;
        }
        throw e;
      }
    },

    async attach(file: File): Promise<Result<Attachment>> {
      const kind = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
          ? 'audio'
          : file.type.startsWith('video/')
            ? 'video'
            : file.type === 'application/pdf'
              ? 'pdf'
              : 'text';
      if (file.size > 20_000_000)
        return {
          ok: false,
          failure: {
            code: 'attach-size',
            message: {
              en: 'That file is too big. The limit is 20 MB.',
              hi: 'फ़ाइल बहुत बड़ी है। सीमा 20 MB है।',
            },
          },
        };
      return {
        ok: true,
        value: {
          id: id('att'),
          name: file.name,
          kind,
          bytes: file.size,
          credits: kind === 'image' ? 1 : 0,
        },
      };
    },

    async estimate(_chatId, text, attachmentIds) {
      const base = Math.max(1, Math.ceil(text.length / 400));
      return {
        min: base + attachmentIds.length,
        max: base * 2 + attachmentIds.length,
      };
    },

    async makeStyle(projectId, name) {
      const mem = memoryOf(projectId);
      const s: StyleRecord = {
        id: id('style'),
        ownerId: 'mock-user',
        name,
        status: 'draft',
        rules: mem.facts.map((f) => f.text).slice(0, 6),
        dos: [],
        donts: [],
        palette: ['#7c5cff', '#22d3ee', '#ffc247'],
        fonts: { heading: 'Poppins', body: 'Inter' },
        voice: { language: 'hi', tone: 'warm' },
        pacing: 'medium',
        sourceProjectId: projectId,
        version: 1,
        updatedAt: now(),
      };
      styles.set(s.id, s);
      return s;
    },
    async acceptStyle(styleId, edits) {
      const cur = styles.get(styleId);
      if (!cur) throw new Error('unknown style');
      const next: StyleRecord = {
        ...cur,
        ...edits,
        status: 'active',
        version: cur.version + 1,
        updatedAt: now(),
      };
      styles.set(styleId, next);
      return next;
    },
    async listStyles() {
      return [...styles.values()];
    },
    async listChats(projectId) {
      return [...chats.values()].filter((c) => c.projectId === projectId);
    },
    async memory(projectId) {
      return memoryOf(projectId);
    },
    async setMemory(projectId, facts) {
      const m = { ...memoryOf(projectId), facts, updatedAt: now() };
      memories.set(projectId, m);
      return m;
    },
  };
}
