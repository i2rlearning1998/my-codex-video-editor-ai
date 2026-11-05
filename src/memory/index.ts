import { z } from 'zod';
import type {
  ChatRecord,
  MemoryEngine,
  MemoryFact,
  MemorySettings,
  StyleRecord,
} from '../contracts/p3';
import {
  FACTS_PROMPT,
  REPAIR_STYLE_PROMPT,
  STYLE_PROMPT,
  SUMMARY_PROMPT,
} from './prompts';
/** Conservative bookkeeping heuristic, not a model tokenizer: ceil(UTF-16 length / 4). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);
const settingsOf = (s: MemorySettings) => {
  if (
    ![s.keepRecent, s.maxFacts, s.maxStyleRules].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    !Number.isSafeInteger(s.summariseAboveTokens) ||
    s.summariseAboveTokens < 1
  )
    throw new Error('The memory limits are not valid.');
  return s;
};
const bounded = (text: string, chars: number): string => {
  const end = Math.max(0, chars);
  const cut = text.slice(0, end);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
};
const normalized = (text: string) =>
  text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const hash = (text: string) => {
  let n = 2166136261;
  for (const char of text) n = Math.imul(n ^ char.codePointAt(0)!, 16777619);
  return (n >>> 0).toString(16);
};
const recent = (chat: ChatRecord, count: number) =>
  chat.messages.slice(Math.max(0, chat.messages.length - count));
const latest = (dates: readonly string[]) => [...dates].sort().at(-1) ?? '';
export function createMemoryEngine(): MemoryEngine {
  return {
    async summarise(chat, input, call) {
      const s = settingsOf(input),
        keep = recent(chat, s.keepRecent);
      const split = chat.messages.length - keep.length;
      if (
        !split ||
        estimateTokens(JSON.stringify(chat.messages)) <= s.summariseAboveTokens
      )
        return structuredClone(chat);
      const older = chat.messages.slice(0, split);
      let text: string;
      try {
        text = await call({
          system: SUMMARY_PROMPT,
          user: JSON.stringify({ previousSummary: chat.summary, older }),
          maxOutputTokens: s.summariseAboveTokens,
        });
      } catch {
        throw new Error('The conversation could not be summarised.');
      }
      if (!text.trim())
        throw new Error('The conversation could not be summarised.');
      text = bounded(text.trim(), s.summariseAboveTokens * 4);
      return {
        ...structuredClone(chat),
        messages: structuredClone(keep),
        summary: {
          text,
          coversUpTo: older.at(-1)!.id,
          tokens: estimateTokens(text),
        },
        updatedAt: latest([chat.updatedAt, ...chat.messages.map((m) => m.at)]),
      };
    },
    context({ style, memory, chat, settings: input }) {
      const s = settingsOf(input),
        maxChars = s.summariseAboveTokens * 4;
      const first = style ? `STYLE (read-only):\n${JSON.stringify(style)}` : '';
      if (first.length > maxChars)
        throw new Error(
          'The style exceeds the context budget; increase the memory limit.',
        );
      let remaining = maxChars - first.length;
      const take = (text: string) => {
        if (!text || remaining <= 1) return '';
        const out = bounded(text, remaining - 1);
        remaining -= out.length + 1;
        return out;
      };
      // Reserve the newest turns before allocating space to lower-priority facts
      // and summary. The final presentation still follows Style > Project > Chat.
      const turns = [...recent(chat, s.keepRecent)]
        .reverse()
        .map((m) => take(`${m.role}: ${m.text}`))
        .filter(Boolean)
        .reverse();
      const facts = [
        ...memory.facts.filter((f) => f.pinned),
        ...memory.facts.filter((f) => !f.pinned),
      ]
        .map((f) => take(`Fact${f.pinned ? ' (pinned)' : ''}: ${f.text}`))
        .filter(Boolean);
      const summary = take(chat.summary ? `Summary: ${chat.summary.text}` : '');
      const text = [first, ...facts, summary, ...turns]
        .filter(Boolean)
        .join('\n');
      return { text, tokens: estimateTokens(text) };
    },
    async extractFacts(memory, exchange, input, call) {
      const s = settingsOf(input),
        pinned = memory.facts.filter((f) => f.pinned);
      const keep = [
        ...pinned,
        ...memory.facts
          .filter((f) => !f.pinned)
          .slice(0, Math.max(0, s.maxFacts - pinned.length)),
      ];
      const available = Math.max(0, s.maxFacts - keep.length);
      if (!available || !exchange.length)
        return { ...structuredClone(memory), facts: structuredClone(keep) };
      let extracted: string[];
      try {
        const response = await call({
          system: FACTS_PROMPT,
          user: JSON.stringify({
            facts: memory.facts,
            exchange,
            maxFacts: available,
          }),
          maxOutputTokens: s.summariseAboveTokens,
        });
        extracted = z
          .object({ facts: z.array(z.string().trim().min(1)) })
          .strict()
          .parse(JSON.parse(response)).facts;
      } catch {
        throw new Error('Project facts could not be extracted.');
      }
      const seen = new Set(memory.facts.map((f) => normalized(f.text))),
        ids = new Set(memory.facts.map((f) => f.id));
      const at = latest([memory.updatedAt, ...exchange.map((m) => m.at)]);
      const added: MemoryFact[] = [];
      for (const text of extracted) {
        const norm = normalized(text);
        if (seen.has(norm)) continue;
        seen.add(norm);
        let id = `fact-${hash(norm)}`;
        while (ids.has(id)) id += '-new';
        ids.add(id);
        added.push({ id, text, source: 'chat', pinned: false, createdAt: at });
        if (added.length === available) break;
      }
      return {
        ...structuredClone(memory),
        facts: [...structuredClone(keep), ...added],
        updatedAt: added.length ? at : memory.updatedAt,
      };
    },
    async distillStyle(input, settings, call) {
      const s = settingsOf(settings);
      const strings = z.array(z.string().trim().min(1)).max(s.maxStyleRules);
      const schema = z
        .object({
          rules: strings,
          dos: strings,
          donts: strings,
          palette: z.array(z.string()),
          fonts: z.object({ heading: z.string(), body: z.string() }).strict(),
          voice: z.object({ language: z.string(), tone: z.string() }).strict(),
          pacing: z.string(),
        })
        .strict();
      let output: string;
      try {
        output = await call({
          system: STYLE_PROMPT,
          user: JSON.stringify({
            memory: input.memory,
            chats: input.chats,
            maxStyleRules: s.maxStyleRules,
          }),
          maxOutputTokens: s.summariseAboveTokens,
        });
      } catch {
        throw new Error('A style draft could not be created.');
      }
      let parsed: z.infer<typeof schema>;
      try {
        parsed = schema.parse(JSON.parse(output));
      } catch {
        try {
          output = await call({
            system: REPAIR_STYLE_PROMPT,
            user: JSON.stringify({
              invalidOutput: output,
              maxStyleRules: s.maxStyleRules,
            }),
            maxOutputTokens: s.summariseAboveTokens,
          });
          parsed = schema.parse(JSON.parse(output));
        } catch {
          throw new Error('A style draft could not be created.');
        }
      }
      const result: StyleRecord = {
        ...parsed,
        id: `style-${hash(JSON.stringify([input.ownerId, input.memory.projectId, input.name, parsed]))}`,
        ownerId: input.ownerId,
        name: input.name,
        status: 'draft',
        sourceProjectId: input.memory.projectId,
        version: 1,
        updatedAt: latest([
          input.memory.updatedAt,
          ...input.chats.map((c) => c.updatedAt),
        ]),
      };
      return result;
    },
  };
}
