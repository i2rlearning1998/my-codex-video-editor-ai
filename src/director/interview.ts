// P2-26: Director's interview, from the Style's interview rules: skip what
// the Brief already answers, stop at the cap, accept free text, and offer the
// owner's creative-upgrade line once.
import {
  nextQuestions,
  text as say,
  type Answers,
  type Locale,
  type PlatformConfig,
  type Style,
} from '../platform-config';
import { refusalFor } from './refusals';

export type Question = Style['interview']['questions'][number];
export interface ChatMessage {
  readonly from: 'director' | 'user';
  readonly text: string;
  readonly kind:
    'greeting' | 'question' | 'answer' | 'refusal' | 'upgrade' | 'done';
  readonly questionId?: string;
}
export interface Interview {
  readonly answers: Answers;
  readonly asked: readonly string[];
  readonly messages: readonly ChatMessage[];
  readonly upgradeOffered: boolean;
  /** Free-text notes the person added (they go into the brief). */
  readonly notes: readonly string[];
}

/** The questions still to ask (Brief answers and already-asked skipped, capped). */
export function pendingQuestions(style: Style, iv: Interview): Question[] {
  const left = style.interview.maxQuestions - iv.asked.length;
  if (left <= 0) return [];
  return nextQuestions(style, iv.answers)
    .filter((q) => !iv.asked.includes(q.id))
    .slice(0, left);
}

export function startInterview(
  c: PlatformConfig,
  style: Style,
  answers: Answers,
  locale: Locale,
): Interview {
  const iv: Interview = {
    answers: { ...answers },
    asked: [],
    messages: c.director.greeting
      ? [
          {
            from: 'director',
            text: say(c.director.greeting, locale),
            kind: 'greeting',
          },
        ]
      : [],
    upgradeOffered: false,
    notes: [],
  };
  return advance(c, style, iv, locale);
}

/** Asks the next question, or offers the upgrade, or says the brief is complete. */
function advance(
  c: PlatformConfig,
  style: Style,
  iv: Interview,
  locale: Locale,
): Interview {
  const next = pendingQuestions(style, iv)[0];
  if (next)
    return {
      ...iv,
      asked: [...iv.asked, next.id],
      messages: [
        ...iv.messages,
        {
          from: 'director',
          text: say(next.ask, locale),
          kind: 'question',
          questionId: next.id,
        },
      ],
    };
  const up = c.director.creativeUpgrade;
  if (style.interview.creativeUpgrade && up?.enabled && !iv.upgradeOffered)
    return {
      ...iv,
      upgradeOffered: true,
      messages: [
        ...iv.messages,
        { from: 'director', text: say(up.text, locale), kind: 'upgrade' },
      ],
    };
  return iv;
}

/** Matches a reply to a choice field's options by value or label. */
function matchOption(
  style: Style,
  fieldId: string,
  reply: string,
  locale: Locale,
): string | null {
  const f = style.brief.fields.find((x) => x.id === fieldId);
  if (!f || !f.options.length) return null;
  const r = reply.trim().toLowerCase();
  for (const o of f.options) {
    const labels = [o.value, o.label.en, say(o.label, locale)].map((x) =>
      x.toLowerCase(),
    );
    if (labels.some((l) => l === r || (l.length > 2 && r.includes(l))))
      return o.value;
  }
  return null;
}

export interface ReplyResult {
  readonly interview: Interview;
  /** Set when the reply was refused (owner's text, never the model's). */
  readonly refused: boolean;
}
/** The person answers the open question (or writes freely). */
export function reply(
  c: PlatformConfig,
  style: Style,
  iv: Interview,
  textIn: string,
  locale: Locale,
): ReplyResult {
  const t = textIn.trim();
  if (!t) return { interview: iv, refused: false };
  const withUser: Interview = {
    ...iv,
    messages: [...iv.messages, { from: 'user', text: t, kind: 'answer' }],
  };
  const r = refusalFor(c.director, t);
  if (r) {
    const parts = [
      say(r.reply, locale),
      r.alternative ? say(r.alternative, locale) : '',
    ]
      .filter(Boolean)
      .join(' ');
    return {
      refused: true,
      interview: {
        ...withUser,
        messages: [
          ...withUser.messages,
          { from: 'director', text: parts, kind: 'refusal' },
        ],
      },
    };
  }
  const open = [...iv.messages].reverse().find((m) => m.kind === 'question');
  const q =
    open && style.interview.questions.find((x) => x.id === open.questionId);
  let answers = withUser.answers;
  let notes = withUser.notes;
  const field = q?.fills
    ? style.brief.fields.find((f) => f.id === q.fills)
    : undefined;
  if (field && answers[field.id] === undefined) {
    const value =
      field.type === 'choice'
        ? matchOption(style, field.id, t, locale)
        : field.type === 'text' || field.type === 'longtext'
          ? t
          : null;
    if (value !== null) answers = { ...answers, [field.id]: value };
    else if (q?.allowFreeText) notes = [...notes, t];
  } else notes = [...notes, t];
  return {
    refused: false,
    interview: advance(c, style, { ...withUser, answers, notes }, locale),
  };
}

/** What a model may do with a reply (P2B-21): fill a config field or pick an allowed follow-up. */
export interface ModelTurn {
  fill?: { field: string; value: string } | null;
  followUp?: string | null;
}
/**
 * The interview with a model. Refusals are matched first and never reach the
 * model. The model may only fill a field one of the Style's questions fills
 * (a choice must be one of its options) or ask one of the Style's follow-ups;
 * anything else is ignored and the deterministic interview runs.
 */
export async function modelReply(
  c: PlatformConfig,
  style: Style,
  iv: Interview,
  textIn: string,
  locale: Locale,
  ask: (system: string, user: string) => Promise<string>,
): Promise<ReplyResult> {
  const t = textIn.trim();
  if (!t || refusalFor(c.director, t) || !c.director.prompts)
    return reply(c, style, iv, textIn, locale);
  const fields = style.interview.questions
    .map((q) => q.fills)
    .filter((f): f is string => !!f)
    .map((id) => style.brief.fields.find((f) => f.id === id))
    .filter(
      (f): f is NonNullable<typeof f> => !!f && iv.answers[f.id] === undefined,
    );
  const open = [...iv.messages].reverse().find((m) => m.kind === 'question');
  const system = c.director.prompts.interview
    .replace(
      /\{\{\s*fields\s*\}\}/g,
      fields
        .map(
          (f) =>
            `${f.id}${f.options.length ? ` (one of ${f.options.map((o) => o.value).join('|')})` : ''}`,
        )
        .join(', ') || 'none',
    )
    .replace(
      /\{\{\s*followUps\s*\}\}/g,
      style.interview.followUps.map((x) => x.id).join(', ') || 'none',
    )
    .replace(/\{\{\s*question\s*\}\}/g, open?.text ?? '');
  let turn: ModelTurn = {};
  try {
    const raw = await ask(system, t);
    const s = raw.indexOf('{');
    const e = raw.lastIndexOf('}');
    turn =
      s >= 0 && e > s ? (JSON.parse(raw.slice(s, e + 1)) as ModelTurn) : {};
  } catch {
    turn = {};
  }
  const base = reply(c, style, iv, textIn, locale);
  let answers = base.interview.answers;
  const f = turn.fill && fields.find((x) => x.id === turn.fill!.field);
  if (
    f &&
    typeof turn.fill!.value === 'string' &&
    answers[f.id] === undefined
  ) {
    const v = turn.fill!.value.slice(0, 2000);
    if (!f.options.length || f.options.some((o) => o.value === v))
      answers = { ...answers, [f.id]: v };
  }
  let next: Interview = { ...base.interview, answers };
  const follow = style.interview.followUps.find((x) => x.id === turn.followUp);
  if (follow && !next.asked.includes(`follow:${follow.id}`))
    next = {
      ...next,
      asked: [...next.asked, `follow:${follow.id}`],
      messages: [
        ...next.messages,
        {
          from: 'director',
          text: say(follow.ask, locale),
          kind: 'question',
          questionId: `follow:${follow.id}`,
        },
      ],
    };
  return { refused: false, interview: next };
}
