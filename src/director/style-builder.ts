// ROUND-C4: the Readymade Styles builder's rules, DOM-free and shared by the
// Owner App's server (owner/server/styles.ts) and the tests. Status moves,
// what a save changes, the template's slot report, the owner's plain
// messages (T1, English and Hindi), the style file (export and import), a
// draft Style from a Video's plan, and the field library's checks.
import {
  styleSchema,
  type PlatformConfig,
  type Style,
} from '../platform-config';
import { fillTemplate, templateSlots, validateStyle } from './style-check';
import type { Library } from './field-library';

export type Lang = 'en' | 'hi';
export type Status = 'draft' | 'tested' | 'published';

// ------------------------------------------------------------ the texts (T1)

/** T1: the builder's plain messages (the architect's English, word for word). */
export const BUILDER_TEXTS = {
  'publish-needs-tests': {
    en: 'A Style can be Published only after three passed tests on three different topics. This one has {n} passed on {m} different topics. Add the missing tests, or write a reason to publish anyway.',
    hi: 'कोई स्टाइल तीन अलग-अलग विषयों पर तीन पास हुए टेस्ट के बाद ही पब्लिश हो सकता है। इसके {m} अलग विषयों पर {n} टेस्ट पास हुए हैं। बाकी टेस्ट जोड़ें, या फिर भी पब्लिश करने का कारण लिखें।',
  },
  'publish-blocked-invalid': {
    en: 'This Style does not pass its checks, so it cannot be Tested or Published. Fix the problems listed below first.',
    hi: 'यह स्टाइल अपनी जाँच में पास नहीं होता, इसलिए इसे टेस्टेड या पब्लिश नहीं किया जा सकता। पहले नीचे लिखी समस्याएँ ठीक करें।',
  },
  'template-missing-slot': {
    en: 'The template uses {{{name}}} but the slot list has no slot with that name.',
    hi: 'टेम्पलेट में {{{name}}} है, पर स्लॉट सूची में इस नाम का कोई स्लॉट नहीं है।',
  },
  'template-unused-slot': {
    en: 'The slot "{name}" is in the list but the template never uses it.',
    hi: 'स्लॉट "{name}" सूची में है, पर टेम्पलेट इसे कहीं इस्तेमाल नहीं करता।',
  },
  'template-not-plan': {
    en: 'This is not a Video Plan the platform can read. Paste the plan the template was made from.',
    hi: 'यह ऐसा वीडियो प्लान नहीं है जिसे प्लेटफ़ॉर्म पढ़ सके। वह प्लान पेस्ट करें जिससे टेम्पलेट बना था।',
  },
  'delete-warning': {
    en: 'Deleting this Style hides it from everyone. Projects already made from it keep working. You can restore it from the Deleted list.',
    hi: 'यह स्टाइल हटाने पर यह सबसे छिप जाएगा। इससे बने प्रोजेक्ट चलते रहेंगे। आप इसे "हटाए गए" सूची से वापस ला सकते हैं।',
  },
  'from-project-no-plan': {
    en: 'This Video was made by hand, so there is no plan to turn into a Style. Open it in AI mode or make it through Claude first.',
    hi: 'यह वीडियो हाथ से बना है, इसलिए इसमें स्टाइल बनाने लायक कोई प्लान नहीं है। पहले इसे AI मोड में खोलें या Claude से बनाएँ।',
  },
  'plan-locked': {
    en: 'This Style is part of the {plan} plan.',
    hi: 'यह स्टाइल {plan} प्लान में शामिल है।',
  },
  'import-newer': {
    en: 'This file was made by a newer version of the platform. Nothing was changed.',
    hi: 'यह फ़ाइल प्लेटफ़ॉर्म के नए वर्ज़न से बनी है। कुछ भी नहीं बदला गया।',
  },
  'import-clash': {
    en: 'A Style with this id already exists. Import it as a copy, or as a new version of the existing one?',
    hi: 'इस id का एक स्टाइल पहले से है। इसे कॉपी के रूप में लाएँ, या मौजूदा स्टाइल के नए वर्ज़न के रूप में?',
  },
  'rollback-bad': {
    en: 'That version can no longer be read, so it cannot be restored. Nothing was changed.',
    hi: 'वह वर्ज़न अब पढ़ा नहीं जा सकता, इसलिए उसे वापस नहीं लाया जा सकता। कुछ भी नहीं बदला गया।',
  },
  'look-no-hindi': {
    en: 'This look has no Hindi name yet; people who read Hindi will see the English name.',
    hi: 'इस लुक का अभी कोई हिंदी नाम नहीं है; हिंदी पढ़ने वालों को अंग्रेज़ी नाम दिखेगा।',
  },
} as const;
export type BuilderText = keyof typeof BUILDER_TEXTS;

/** A T1 message with its {name} places filled (`{{{name}}}` keeps braces). */
export function bt(
  key: BuilderText,
  vars: Record<string, string | number> = {},
  lang: Lang = 'en',
): string {
  return BUILDER_TEXTS[key][lang].replace(/\{(\w+)\}/g, (whole, k: string) =>
    k in vars ? String(vars[k]) : whole,
  );
}

// -------------------------------------------------------------- the status

export const statusOf = (s: Pick<Style, 'status'>): Status =>
  s.status ?? 'published';
/** A Style from before Readymade Styles: no status, no template. */
export const isLegacy = (s: Pick<Style, 'status' | 'planTemplate'>) =>
  s.status === undefined && !s.planTemplate;

/** Passed tests and the different topics among them (trimmed, any case). */
export function passedTopics(s: Pick<Style, 'tests'>): {
  n: number;
  m: number;
} {
  const passed = (s.tests ?? []).filter((t) => t.passed);
  return {
    n: passed.length,
    m: new Set(passed.map((t) => t.topic.trim().toLowerCase())).size,
  };
}

const ORDER: Status[] = ['draft', 'tested', 'published'];
export type Move = { ok: true } | { ok: false; message: string };

/**
 * Whether a Style may move to a status. Moving back is always allowed. A
 * Style that fails validateStyle can never be Tested or Published; skipping
 * a step, Tested without a passed test and Published without three passed
 * tests on three topics each need the owner's written reason (1 to 600).
 */
export function canMove(
  style: Style,
  to: Status,
  override = '',
  lang: Lang = 'en',
): Move {
  const from = statusOf(style);
  if (ORDER.indexOf(to) <= ORDER.indexOf(from) || to === 'draft')
    return { ok: true };
  const reason = override.trim();
  if (reason.length > 600)
    return {
      ok: false,
      message:
        lang === 'hi'
          ? 'कारण 600 अक्षरों तक हो सकता है।'
          : 'The reason may be up to 600 characters.',
    };
  const target: Style = {
    ...style,
    status: to,
    ...(reason ? { publishOverride: reason } : {}),
  };
  if (!validateStyle(target).ok && !onlyTestRule(target))
    return { ok: false, message: bt('publish-blocked-invalid', {}, lang) };
  const skips = ORDER.indexOf(to) - ORDER.indexOf(from) > 1;
  const { n, m } = passedTopics(style);
  if (to === 'tested' && n < 1 && !reason)
    return {
      ok: false,
      message:
        lang === 'hi'
          ? 'टेस्टेड के लिए कम से कम एक पास हुआ टेस्ट चाहिए, या कारण लिखें।'
          : 'Tested needs at least one passed test, or a written reason.',
    };
  if (to === 'published' && m < 3 && !reason)
    return { ok: false, message: bt('publish-needs-tests', { n, m }, lang) };
  if (skips && !reason)
    return {
      ok: false,
      message:
        lang === 'hi'
          ? 'कोई कदम छोड़ने के लिए कारण लिखें।'
          : 'Skipping a step needs a written reason.',
    };
  return { ok: true };
}
/** True when the only check that fails is the published-tests rule. */
function onlyTestRule(s: Style): boolean {
  const e = validateStyle(s).errors;
  return e.length > 0 && e.every((x) => x.includes('passed tests'));
}

// ------------------------------------------------------------ saves

/** The top-level fields that differ (the history's "what changed"). */
export function changedFields(a: unknown, b: unknown): string[] {
  const x = (a ?? {}) as Record<string, unknown>;
  const y = (b ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
  return keys.filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
}

/**
 * A save of `next` over `prev`: the version goes up by one; a Published
 * Style whose template or slots changed goes back to Tested (its tests are
 * kept). Text, looks, art and order never change the status.
 */
export function applySave(
  prev: Style | null,
  next: Style,
): { style: Style; changed: string[]; demoted: boolean } {
  const changed = changedFields(prev, next).filter((k) => k !== 'version');
  let style: Style = { ...next, version: (prev?.version ?? 0) + 1 };
  let demoted = false;
  if (
    prev &&
    statusOf(prev) === 'published' &&
    statusOf(style) === 'published' &&
    !isLegacy(prev) &&
    (changed.includes('planTemplate') || changed.includes('slots'))
  ) {
    style = { ...style, status: 'tested' };
    demoted = true;
  }
  // Tests are never removed by an edit: what the save left out comes back.
  const kept = prev?.tests ?? [];
  if (kept.length > (style.tests?.length ?? 0))
    style = {
      ...style,
      tests: [...(style.tests ?? []), ...kept.slice(style.tests?.length ?? 0)],
    };
  return { style, changed, demoted };
}

/** A copy: a new id, Draft, no tests and no override. */
export function copyStyle(s: Style, taken: readonly string[]): Style {
  let id = `${s.id}-copy`.slice(0, 48);
  for (let i = 2; taken.includes(id); i++)
    id = `${s.id.slice(0, 40)}-copy-${i}`;
  const { publishOverride: _o, tests: _t, ...rest } = s;
  return {
    ...rest,
    id,
    name: { ...s.name, en: `${s.name.en} (copy)` },
    status: 'draft',
    version: 1,
  };
}

// ------------------------------------------------------- the template

export interface SlotReport {
  readonly found: string[];
  readonly missing: string[];
  readonly unused: string[];
  /** Plain messages with the place, e.g. "scene 3, field text: ...". */
  readonly messages: string[];
}
const MARK = /\{\{([a-z0-9][a-z0-9-]*)\}\}/g;
/** Where each marker sits in the template ("scene 2, field narration"). */
function places(template: unknown): Map<string, string> {
  const at = new Map<string, string>();
  const walk = (v: unknown, path: string[]) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(MARK))
        if (!at.has(m[1]!)) at.set(m[1]!, describe(path));
    } else if (Array.isArray(v))
      v.forEach((x, i) => walk(x, [...path, `${i}`]));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) walk(x, [...path, k]);
  };
  walk(template, []);
  return at;
}
function describe(path: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const k = path[i]!;
    const next = path[i + 1];
    if (k === 'scenes' && next !== undefined && /^\d+$/.test(next)) {
      out.push(`scene ${Number(next) + 1}`);
      i++;
    } else if (k === 'layers' && next !== undefined && /^\d+$/.test(next)) {
      out.push(`layer ${Number(next) + 1}`);
      i++;
    } else if (!/^\d+$/.test(k)) out.push(`field ${k}`);
  }
  return out.join(', ') || 'the plan';
}
/** The slots a template uses against the slot list. */
export function slotReport(
  template: unknown,
  slots: readonly { name: string }[],
  lang: Lang = 'en',
): SlotReport {
  const found = templateSlots(template);
  const names = slots.map((s) => s.name);
  const where = places(template);
  const missing = found.filter((n) => !names.includes(n));
  const unused = names.filter((n) => !found.includes(n));
  return {
    found,
    missing,
    unused,
    messages: [
      ...missing.map(
        (n) =>
          `${where.get(n)}: ${bt('template-missing-slot', { name: n }, lang)}`,
      ),
      ...unused.map((n) => bt('template-unused-slot', { name: n }, lang)),
    ],
  };
}

/** Reads a pasted or uploaded template: a Video Plan v4 object, or why not. */
export function readTemplate(
  text: string,
  lang: Lang = 'en',
):
  | { ok: true; template: Record<string, unknown> }
  | { ok: false; message: string } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, message: bt('template-not-plan', {}, lang) };
  }
  const p = v as { format?: unknown; version?: unknown; scenes?: unknown };
  if (
    !p ||
    typeof p !== 'object' ||
    Array.isArray(p) ||
    p.format !== 'video-plan' ||
    !Array.isArray(p.scenes)
  )
    return { ok: false, message: bt('template-not-plan', {}, lang) };
  if (p.version !== 4)
    return {
      ok: false,
      message:
        lang === 'hi'
          ? `यह प्लान वर्ज़न ${String(p.version)} का है; टेम्पलेट वीडियो प्लान वर्ज़न 4 होना चाहिए।`
          : `This plan is version ${String(p.version)}; a template must be a Video Plan version 4.`,
    };
  return { ok: true, template: p as Record<string, unknown> };
}
/** The template with every slot's default filled (read-only view). */
export const filledTemplate = (s: Style) =>
  s.planTemplate
    ? fillTemplate(
        s.planTemplate,
        Object.fromEntries((s.slots ?? []).map((x) => [x.name, x.default])),
      )
    : null;

/** Small warnings (never errors): looks without a real Hindi name. */
export function lookWarnings(s: Style, lang: Lang = 'en'): string[] {
  return (s.looks ?? [])
    .filter((l) => !l.name.hi?.trim() || l.name.hi.trim() === l.name.en.trim())
    .map((l) => `${l.id}: ${bt('look-no-hindi', {}, lang)}`);
}

// --------------------------------------------------------- plans (1.7)

/** Whether a person's plan includes a Style (missing or empty: every plan). */
export const styleInPlan = (s: Pick<Style, 'plans'>, planId: string) =>
  !s.plans?.length || s.plans.includes(planId);
/** The name of the first plan that includes a Style (for "plan-locked"). */
export function lockedPlanName(
  c: PlatformConfig,
  s: Pick<Style, 'plans'>,
  lang: Lang = 'en',
): string {
  const p = c.plans.find((x) => s.plans?.includes(x.id));
  return p ? (lang === 'hi' && p.name.hi ? p.name.hi : p.name.en) : '';
}

// ---------------------------------------------------- export and import

export const STYLE_FILE_FORMAT = 'aive-style';
export const STYLE_FILE_VERSION = 1;
const SCRIPT = /<\s*\/?\s*script|javascript:|on[a-z]+\s*=/i;
const URL_RE = /https?:\/\//i;

/** The style.json of an export. */
export function styleFile(s: Style): Record<string, unknown> {
  return { format: STYLE_FILE_FORMAT, version: STYLE_FILE_VERSION, style: s };
}

/** Texts a person reads: never a script; never a link (D-267's style rule). */
export function unsafeTexts(s: Style): string[] {
  const out: string[] = [];
  const check = (label: string, v: unknown, links = false) => {
    if (typeof v !== 'string') return;
    if (SCRIPT.test(v)) out.push(`${label} holds a script.`);
    else if (!links && URL_RE.test(v)) out.push(`${label} holds a link.`);
  };
  const lt = (
    label: string,
    t: { en: string; hi?: string | undefined } | undefined,
  ) => {
    check(`${label} (English)`, t?.en);
    check(`${label} (Hindi)`, t?.hi);
  };
  lt('The name', s.name);
  lt('The blurb', s.blurb);
  check('The script rules', s.playbookText);
  check('The kit notes', s.kit?.notes);
  for (const l of s.looks ?? []) lt(`The look "${l.id}"`, l.name);
  for (const sl of s.slots ?? []) {
    lt(`The slot "${sl.name}" label`, sl.label);
    check(`The slot "${sl.name}" default`, sl.default);
  }
  for (const f of s.brief.fields) {
    const x = f as { id: string; label?: { en: string; hi?: string } };
    lt(`The field "${x.id}"`, x.label);
  }
  // Art and the sample are files the owner chose: links are fine there.
  check('The card art', s.cardArt, true);
  return out;
}

export type ReadStyle =
  { ok: true; style: Style } | { ok: false; message: string };
/** Reads an imported style.json: format, version, schema, texts. */
export function readStyleFile(text: string, lang: Lang = 'en'): ReadStyle {
  let v: { format?: unknown; version?: unknown; style?: unknown };
  try {
    v = JSON.parse(text) as typeof v;
  } catch {
    return {
      ok: false,
      message:
        lang === 'hi'
          ? 'यह स्टाइल फ़ाइल नहीं है।'
          : 'This is not a Style file.',
    };
  }
  if (v?.format !== STYLE_FILE_FORMAT)
    return {
      ok: false,
      message:
        lang === 'hi'
          ? 'यह स्टाइल फ़ाइल नहीं है।'
          : 'This is not a Style file.',
    };
  if (typeof v.version !== 'number' || v.version > STYLE_FILE_VERSION)
    return { ok: false, message: bt('import-newer', {}, lang) };
  const parsed = styleSchema.safeParse(v.style);
  if (!parsed.success)
    return {
      ok: false,
      message: `The Style in the file is not complete: ${parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    };
  const unsafe = unsafeTexts(parsed.data);
  if (unsafe.length)
    return { ok: false, message: `Nothing was imported. ${unsafe.join(' ')}` };
  const check = validateStyle({ ...parsed.data, status: 'draft' });
  if (!check.ok)
    return {
      ok: false,
      message: `Nothing was imported. ${check.errors.slice(0, 5).join(' ')}`,
    };
  return { ok: true, style: parsed.data };
}

// ------------------------------------------------- a Style from a Video (2.2)

export interface VideoSource {
  /** The Video's stored plan (Video Plan v4), or null when made by hand. */
  readonly plan: unknown;
  readonly name: string;
  /** The Project's style record (look, voice, music, script rules). */
  readonly style?: {
    look?: {
      palette?: readonly string[];
      headingFont?: string;
      bodyFont?: string;
      captionStyle?: string;
    };
    voice?: string;
    music?: string;
    scriptRules?: string;
    graphics?: string;
  } | null;
  /** The approved plan cost (credits). */
  readonly cost?: number | null;
  /** The code graphics the Video uses (from the Project's AI library). */
  readonly graphics?: readonly {
    id: string;
    tier: string;
    name?: string;
    summary?: string;
    source?: string;
    meta?: Record<string, unknown>;
  }[];
  readonly videoType?: string;
}

type Slot = NonNullable<Style['slots']>[number];
const SLOT_ID = (x: string) =>
  x
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'media';

/**
 * A Draft Style from a Video's plan: the topic, narration, language, voice,
 * length and brand become slots; every medium the plan names becomes an
 * asset slot with the plan's own name and kind. Everything else is fixed.
 */
export function draftStyleFromVideo(
  c: PlatformConfig,
  src: VideoSource,
  id: string,
  margin = 0.2,
): { ok: true; style: Style } | { ok: false; message: string } {
  const plan = src.plan as
    | {
        format?: string;
        version?: number;
        meta?: Record<string, unknown>;
        voice?: Record<string, unknown>;
        scenes?: Record<string, unknown>[];
        notes?: unknown;
      }
    | null
    | undefined;
  if (!plan || plan.format !== 'video-plan' || !Array.isArray(plan.scenes))
    return { ok: false, message: bt('from-project-no-plan') };
  const t = JSON.parse(JSON.stringify(plan)) as NonNullable<typeof plan> & {
    version: number;
    scenes: Record<string, unknown>[];
  };
  t.version = 4;
  const slots: Slot[] = [];
  const add = (s: Slot) => {
    if (!slots.some((x) => x.name === s.name)) slots.push(s);
  };
  const topic = String(t.meta?.title ?? src.name).slice(0, 4000);
  const textSlot = (
    name: string,
    def: string,
    en: string,
    hi: string,
  ): Slot => ({
    name,
    kind: 'text',
    default: def,
    route: 'later',
    label: { en, hi },
  });
  if (t.meta) {
    t.meta.title = '{{topic}}';
    add(textSlot('topic', topic, 'Topic', 'विषय'));
    if (typeof t.meta.language === 'string') {
      add(textSlot('language', t.meta.language, 'Language', 'भाषा'));
      t.meta.language = '{{language}}';
    }
    if (typeof t.meta.brand === 'string') {
      add(textSlot('brand', t.meta.brand, 'Brand name', 'ब्रांड का नाम'));
      t.meta.brand = '{{brand}}';
    }
  }
  if (t.voice && typeof t.voice.voiceId === 'string') {
    add({
      ...textSlot('voice', t.voice.voiceId, 'Voice', 'आवाज़'),
      kind: 'choice',
    });
    t.voice.voiceId = '{{voice}}';
  }
  const seconds = t.scenes.reduce(
    (n, sc) => n + (typeof sc.durationHint === 'number' ? sc.durationHint : 0),
    0,
  );
  if (seconds > 0)
    add(
      textSlot(
        'length',
        String(Math.round(seconds)),
        'Length (seconds)',
        'लंबाई (सेकंड)',
      ),
    );
  t.scenes.forEach((sc, i) => {
    if (typeof sc.narration === 'string' && sc.narration.trim()) {
      const name = `narration-${i + 1}`;
      add(
        textSlot(
          name,
          sc.narration,
          `Narration, scene ${i + 1}`,
          `नरेशन, सीन ${i + 1}`,
        ),
      );
      sc.narration = `{{${name}}}`;
    }
    for (const l of (sc.layers as Record<string, unknown>[] | undefined) ??
      []) {
      const mi = l.mediaIntent as { query?: string; type?: string } | undefined;
      if (
        l.kind === 'media' &&
        mi?.query &&
        !['icon', 'emoji', 'sticker'].includes(mi.type ?? 'photo')
      ) {
        const name = SLOT_ID(mi.query);
        add({
          name,
          kind:
            mi.type === 'video'
              ? 'video'
              : mi.type === 'audio'
                ? 'audio'
                : 'image',
          default: mi.query,
          route: 'later',
          label: { en: mi.query, hi: mi.query },
        });
        mi.query = `{{${name}}}`;
      }
      if (l.kind === 'logo' || l.id === 'logo') {
        const q = (l.mediaIntent as { query?: string } | undefined)?.query;
        if (!q)
          add({
            name: 'logo',
            kind: 'image',
            default: '',
            route: 'upload',
            label: { en: 'Logo', hi: 'लोगो' },
          });
      }
    }
  });
  // The length slot is used once, in the meta (the planner's length hint).
  if (slots.some((s) => s.name === 'length')) {
    t.meta = { ...(t.meta ?? {}), length: '{{length}}' };
  }
  const look = src.style?.look;
  const palette = (look?.palette ?? [])
    .filter((x) => /^#[0-9a-fA-F]{6}$/.test(x))
    .slice(0, 8);
  const looks: NonNullable<Style['looks']> = palette.length
    ? [
        {
          id: 'look-1',
          name: { en: 'Look 1', hi: 'लुक 1' },
          palette,
          headingFont: look?.headingFont || 'Inter',
          bodyFont: look?.bodyFont || 'Inter',
          captionStyle: look?.captionStyle || 'clean',
        },
      ]
    : [];
  const type =
    c.director.fieldLibrary.types.find((x) => x.id === src.videoType) ??
    c.director.fieldLibrary.types.find(
      (x) => x.id === c.director.fieldLibrary.fallbackType,
    ) ??
    c.director.fieldLibrary.types[0]!;
  const blockFields = type.blocks
    .map((b) => c.director.fieldLibrary.blocks.find((x) => x.id === b.id))
    .filter((b): b is NonNullable<typeof b> => !!b)
    .map((b) => ({
      id: b.id,
      label: b.label,
      type:
        b.type === 'longtext'
          ? 'longtext'
          : b.type === 'choice'
            ? 'choice'
            : 'text',
      required: false,
      ...(b.type === 'choice' ? { options: b.options } : {}),
    }));
  const slotFields = slots
    .filter((s) => !blockFields.some((f) => f.id === s.name))
    .map((s) => ({
      id: s.name,
      label: s.label ?? { en: s.name },
      type:
        s.kind === 'text'
          ? s.default.length > 120
            ? 'longtext'
            : 'text'
          : 'text',
      required: s.name === 'topic',
    }));
  const inputs: NonNullable<Style['inputs']> = [];
  if (slots.some((s) => s.kind === 'image')) inputs.push('photo');
  if (slots.some((s) => s.name.startsWith('narration'))) inputs.push('script');
  const cost = Math.max(0, Math.round(src.cost ?? 0));
  const draft = {
    id,
    name: {
      en: src.name.slice(0, 80) || 'New Style',
      hi: src.name.slice(0, 80) || 'नया स्टाइल',
    },
    blurb: {
      en: `Made from the Video "${src.name}".`,
      hi: `वीडियो "${src.name}" से बना।`,
    },
    playbook: '',
    playbookText: [
      src.style?.scriptRules ?? '',
      typeof plan.notes === 'string' ? plan.notes : '',
    ]
      .filter((x) => x.trim())
      .join('\n')
      .slice(0, 8000),
    enabled: true,
    status: 'draft',
    cardArt: '',
    formats: [
      ['16:9', '9:16', '1:1', '4:5'].includes(String(t.meta?.aspect))
        ? (String(t.meta?.aspect) as '16:9')
        : '16:9',
    ],
    requires: [],
    priceHint: { min: cost, max: Math.ceil(cost * (1 + margin)), per: 'video' },
    brief: { fields: [...blockFields, ...slotFields], groups: [] },
    interview: {
      maxQuestions: 5,
      questions: [],
      creativeUpgrade: true,
      followUps: [],
    },
    order: 100,
    projectStyle: {
      palette,
      headingFont: look?.headingFont ?? '',
      bodyFont: look?.bodyFont ?? '',
      captionStyle: look?.captionStyle ?? '',
      ...(src.style?.voice ? { voice: { en: src.style.voice } } : {}),
      ...(src.style?.music ? { music: { en: src.style.music } } : {}),
      ...(src.style?.graphics ? { graphics: { en: src.style.graphics } } : {}),
    },
    version: 1,
    planTemplate: t,
    slots,
    inputs,
    ...(looks.length ? { looks } : {}),
    kit: {
      notes: (src.graphics ?? [])
        .map((g) => `${g.name ?? g.id} (${g.tier})`)
        .join(', ')
        .slice(0, 4000),
      blocks: (src.graphics ?? [])
        .map((g) => g.id)
        .filter((x) => /^[a-zA-Z][a-zA-Z0-9-]{0,47}$/.test(x))
        .slice(0, 40),
      items: (src.graphics ?? [])
        .filter((g) => g.source && /^[a-zA-Z][a-zA-Z0-9-]{0,47}$/.test(g.id))
        .slice(0, 40)
        .map((g) => ({
          id: g.id,
          tier: g.tier === 'B' ? ('B' as const) : ('C' as const),
          source: g.source ?? '',
          meta: g.meta ?? {},
          name: (g.name ?? g.id).slice(0, 120),
          summary: (g.summary ?? '').slice(0, 600),
        })),
    },
    tests: [],
  };
  const parsed = styleSchema.safeParse(draft);
  if (!parsed.success)
    return {
      ok: false,
      message: `The draft could not be made: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    };
  return { ok: true, style: parsed.data };
}

// ------------------------------------------------------ field library (3)

/** Who uses a block: video types and Styles' Brief fields. */
export function blockUsers(
  lib: Library,
  styles: readonly Style[],
  blockId: string,
): string[] {
  return [
    ...lib.types
      .filter((t) => t.blocks.some((b) => b.id === blockId))
      .map((t) => `video type "${t.id}"`),
    ...styles
      .filter((s) =>
        s.brief.fields.some((f) => (f as { id: string }).id === blockId),
      )
      .map((s) => `Style "${s.id}"`),
  ];
}
/** The field library's own rules, in plain sentences. */
export function checkFieldLibrary(
  lib: Library,
  playbooks: readonly string[] = [],
): string[] {
  const errors: string[] = [];
  if (!lib.types.length) errors.push('At least one video type must exist.');
  if (!lib.types.some((t) => t.id === lib.fallbackType))
    errors.push(
      `The fallback type "${lib.fallbackType}" does not exist. Choose one of the video types.`,
    );
  const bIds = lib.blocks.map((b) => b.id);
  const dupB = bIds.find((x, i) => bIds.indexOf(x) !== i);
  if (dupB) errors.push(`Two field blocks are both called "${dupB}".`);
  const tIds = lib.types.map((t) => t.id);
  const dupT = tIds.find((x, i) => tIds.indexOf(x) !== i);
  if (dupT) errors.push(`Two video types are both called "${dupT}".`);
  for (const t of lib.types) {
    if (!t.blocks.length)
      errors.push(`The video type "${t.id}" has no field blocks.`);
    for (const b of t.blocks)
      if (!bIds.includes(b.id))
        errors.push(
          `The video type "${t.id}" uses the block "${b.id}", which no block defines.`,
        );
    if (t.playbook && playbooks.length && !playbooks.includes(t.playbook))
      errors.push(
        `The video type "${t.id}" maps to the playbook "${t.playbook}", which does not exist.`,
      );
  }
  for (const b of lib.blocks)
    if (b.type === 'choice' && !b.options.length)
      errors.push(`The choice block "${b.id}" has no options.`);
  return errors;
}

/** Kit block ids the editor does not know (built-in blocks or the kit's own items). */
export function unknownKitBlocks(
  s: Pick<Style, 'kit'>,
  catalog: readonly string[],
): string[] {
  const own = (s.kit?.items ?? []).map((i) => i.id);
  return (s.kit?.blocks ?? []).filter(
    (b) => !catalog.includes(b) && !own.includes(b),
  );
}
