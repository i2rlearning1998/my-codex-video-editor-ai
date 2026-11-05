// Small stand-ins for Part 1's engines (codex/p3-engine), written against the
// frozen contract only. They are NOT Part 1's logic: they exist so Part 2's
// wiring can be tested before Part 1 is merged.
import type {
  ChatRecord,
  EntitlementService,
  FormSpec,
  FormValues,
  LimitAction,
  MemoryEngine,
  MemoryFact,
  P3Failure,
  ParamDecl,
  StudioEngine,
  StyleRecord,
} from '../../../src/contracts/p3';

const tok = (s: string) => Math.ceil(s.length / 4);

export function stubMemoryEngine(): MemoryEngine & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async summarise(chat, settings, call) {
      calls.push('summarise');
      const old = chat.messages.slice(0, -settings.keepRecent);
      if (!old.length) return chat;
      const text = await call({
        system: 'Summarise.',
        user: old.map((m) => `${m.role}: ${m.text}`).join('\n'),
        maxOutputTokens: 200,
      });
      return {
        ...chat,
        messages: chat.messages.slice(-settings.keepRecent),
        summary: { text, coversUpTo: old.at(-1)!.id, tokens: tok(text) },
      };
    },
    context({ style, memory, chat }) {
      calls.push('context');
      const text = [
        style ? `STYLE ${style.name}` : '',
        `FACTS\n${memory.facts.map((f) => `- ${f.text}`).join('\n')}`,
        chat.summary ? `SUMMARY\n${chat.summary.text}` : '',
        `RECENT\n${chat.messages.map((m) => `${m.role}: ${m.text}`).join('\n')}`,
      ]
        .filter(Boolean)
        .join('\n\n');
      return { text, tokens: tok(text) };
    },
    async extractFacts(memory, exchange, settings, call) {
      calls.push('extractFacts');
      const out = await call({
        system: 'Facts.',
        user: exchange.map((m) => m.text).join('\n'),
        maxOutputTokens: 100,
      });
      const lines = out
        .split('\n')
        .map((l) => l.replace(/^FACT:\s*/, '').trim())
        .filter((l) => l && !memory.facts.some((f) => f.text === l));
      const added: MemoryFact[] = lines.map((text, i) => ({
        id: `fact-x${memory.facts.length + i}`,
        text,
        source: 'chat',
        pinned: false,
        createdAt: '2026-11-05T00:00:00.000Z',
      }));
      return {
        ...memory,
        facts: [...memory.facts, ...added].slice(-settings.maxFacts),
      };
    },
    async distillStyle(input, _settings, call) {
      calls.push('distillStyle');
      await call({ system: 'Style.', user: input.name, maxOutputTokens: 100 });
      const s: StyleRecord = {
        id: 'from-engine',
        ownerId: input.ownerId,
        name: input.name,
        status: 'active', // the wiring must force 'draft' whatever this says
        rules: input.memory.facts.map((f) => f.text),
        dos: ['Short sentences'],
        donts: ['Jargon'],
        palette: ['#112233'],
        fonts: { heading: 'Inter', body: 'Inter' },
        voice: { language: 'hi', tone: 'warm' },
        pacing: 'brisk',
        sourceProjectId: null,
        version: 9,
        updatedAt: '2026-11-05T00:00:00.000Z',
      };
      return s;
    },
  };
}

/** Builds the form straight from the params; assemble joins prompt parts. */
export function stubStudioEngine(): StudioEngine {
  const visible = (form: FormSpec, values: FormValues) =>
    [...form.basic, ...form.advanced].filter(
      (p) =>
        !p.showIf || p.showIf.in.includes(String(values[p.showIf.field] ?? '')),
    );
  return {
    buildForm(params, ids, canEnhance) {
      const sorted = [...params].sort((a, b) => a.order - b.order);
      return {
        ...ids,
        basic: sorted.filter((p) => p.group === 'basic'),
        advanced: sorted.filter((p) => p.group === 'advanced'),
        canEnhance,
      };
    },
    visible,
    defaults(form) {
      const out: Record<string, FormValues[string]> = {};
      for (const p of [...form.basic, ...form.advanced])
        if (p.default !== undefined) out[p.id] = p.default;
      return out;
    },
    validate(form, values) {
      const errors: Record<string, { en: string }> = {};
      for (const p of visible(form, values))
        if (p.required && (values[p.id] === undefined || values[p.id] === ''))
          errors[p.id] = { en: `${p.label.en} is needed.` };
      return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
    },
    assemble(form, values) {
      const vis: ParamDecl[] = visible(form, values);
      const val = (p: ParamDecl) => values[p.id] ?? p.default;
      const prompt = [
        ...vis
          .filter((p) => p.role === 'prompt')
          .map((p) => String(val(p) ?? '')),
        ...vis
          .filter((p) => p.role === 'prompt-part' && val(p) !== undefined)
          .map((p) => `${p.label.en}: ${String(val(p))}`),
      ]
        .filter(Boolean)
        .join('\n');
      const neg = vis.find((p) => p.role === 'negative');
      const params: Record<string, string | number | boolean> = {};
      for (const p of vis)
        if (
          (p.role === 'param' || p.role === 'units') &&
          p.sends &&
          val(p) !== undefined
        )
          params[p.sends] = val(p) as string | number | boolean;
      const units = vis.find((p) => p.role === 'units');
      return {
        prompt,
        ...(neg && values[neg.id]
          ? { negativePrompt: String(values[neg.id]) }
          : {}),
        params,
        references: {},
        units: units ? Number(val(units) ?? 1) : 1,
        preview: `PROMPT: ${prompt}`,
      };
    },
  };
}

export function stubEntitlements(
  opts: {
    aiOff?: boolean;
    refuse?: Partial<Record<LimitAction, P3Failure>>;
  } = {},
): Pick<EntitlementService, 'check'> & {
  checks: LimitAction[];
  amounts: (number | undefined)[];
} {
  const checks: LimitAction[] = [];
  const amounts: (number | undefined)[] = [];
  return {
    checks,
    amounts,
    async check(_userId, action, amount) {
      checks.push(action);
      amounts.push(amount);
      if (opts.aiOff)
        return {
          ok: false,
          failure: {
            code: 'ai-off',
            message: { en: 'AI is paused for maintenance.' },
          },
        };
      const f = opts.refuse?.[action];
      return f ? { ok: false, failure: f } : { ok: true };
    },
  };
}

export const emptyChat = (id: string, projectId: string): ChatRecord => ({
  id,
  projectId,
  title: 't',
  messages: [],
  summary: null,
  updatedAt: '2026-11-05T00:00:00.000Z',
});
