// ROUND-C1 C1.1: the media-provider registry and the Director's power rules
// (web tools, rulebook v2, playbook slots, authoring guides, layout safe
// area). Everything here is data the owner edits in Platform Config; the
// code only knows provider KINDS and adapter TYPES, never a fixed list of
// providers. Secrets are never stored: a REST provider names a key-vault
// entry (`keyRef`), the gateway reads the key on the server.
import { z } from 'zod';
import { RULEBOOK_C2 } from './texts/rulebook';
import { RULEBOOK_C3 } from './texts/c3';
import { AUTHORING_GUIDE } from './texts/authoring-guide';
import { CHAPTER_01 } from './texts/creator-playbook-01-audience-and-goal';
import { CHAPTER_02 } from './texts/creator-playbook-02-story-and-script';
import { CHAPTER_03 } from './texts/creator-playbook-03-look-and-feel';
import { CHAPTER_04 } from './texts/creator-playbook-04-media-and-sound';
import { CHAPTER_05 } from './texts/creator-playbook-05-camera-and-motion';
import { CHAPTER_06 } from './texts/creator-playbook-06-review-and-publish';
import { PLAYBOOK_EXPLAINER } from './texts/playbook-explainer';
import { PLAYBOOK_DOCUMENTARY } from './texts/playbook-documentary';
import { PLAYBOOK_SHORT_REEL } from './texts/playbook-short-reel';
import { PLAYBOOK_ENHANCE_RECORDING } from './texts/playbook-enhance-recording';
import { PLAYBOOK_LOGO_INTRO } from './texts/playbook-logo-intro';
import { PLAYBOOK_PRODUCT_PROMO } from './texts/playbook-product-promo';
import { PLAYBOOK_EDU_ANIMATION } from './texts/playbook-edu-animation';
import { PLAYBOOK_STORY_COMIC } from './texts/playbook-story-comic';

const id = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9-]{0,47}$/, 'id: letters, digits, dash');
const lt = z
  .object({ en: z.string(), hi: z.string().optional() })
  .passthrough();

/**
 * The kinds the editor knows today. The list is data: a provider may name
 * any kind matching the id pattern; tools ask for kinds by name.
 */
export const MEDIA_KINDS = [
  'stock-photo',
  'stock-video',
  'icon',
  'sticker',
  'sound-effect',
  'music',
  'speech-to-text',
  'text-to-speech',
  'image-gen',
  'video-gen',
  'web-search',
] as const;
export const mediaKindSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,39}$/, 'kind: lower-case words with "-"');

/**
 * A plain path expression into JSON: dot-separated keys and `[n]` indexes,
 * optionally several alternatives separated by `|` (the first non-empty
 * wins), e.g. `hits`, `src.large2x`, `videos[0].files[0].link|url`.
 * No code: only letters, digits, `_`, `-`, `.`, `[n]` and `|`.
 */
export const pathExpr = z
  .string()
  .max(200)
  .regex(
    /^[A-Za-z0-9_$-]+(\[\d{1,3}\])*(\.[A-Za-z0-9_$-]+(\[\d{1,3}\])*)*(\|[A-Za-z0-9_$-]+(\[\d{1,3}\])*(\.[A-Za-z0-9_$-]+(\[\d{1,3}\])*)*)*$/,
    'path: keys separated by "." with [n] indexes, alternatives by "|"',
  );

export const restDescriptorSchema = z
  .object({
    /** https only; the runtime never leaves this host. */
    baseUrl: z
      .string()
      .url()
      .refine((v) => v.startsWith('https://'), 'baseUrl must be https'),
    /** Path appended to the base for a search (no host). */
    searchPath: z
      .string()
      .max(200)
      .regex(/^\/[^\s]*$/)
      .default('/'),
    auth: z
      .object({
        style: z.enum(['header', 'query', 'none']).default('none'),
        /** Header name (e.g. Authorization) or query name (e.g. key). */
        name: z
          .string()
          .max(60)
          .regex(/^[A-Za-z0-9_-]*$/)
          .default(''),
        /** Text before the key in a header, e.g. "Bearer ". */
        prefix: z.string().max(20).default(''),
        /** The NAME of a key-vault entry, never a key. */
        keyRef: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]{1,63}$/)
          .optional(),
      })
      .default({}),
    request: z
      .object({
        /** Query-string names the runtime fills; empty means "not sent". */
        query: z.string().max(40).default('q'),
        orientation: z.string().max(40).default(''),
        page: z.string().max(40).default(''),
        limit: z.string().max(40).default(''),
        /** Values sent as they are (e.g. {"media_type": "photo"}). */
        fixed: z.record(z.string().max(40), z.string().max(200)).default({}),
        /** Provider's own words for each orientation. */
        orientationValues: z
          .object({
            landscape: z.string().max(40).default('landscape'),
            portrait: z.string().max(40).default('portrait'),
            square: z.string().max(40).default('square'),
          })
          .default({}),
      })
      .default({}),
    response: z
      .object({
        items: pathExpr,
        id: pathExpr,
        title: pathExpr.optional(),
        thumbnail: pathExpr,
        preview: pathExpr.optional(),
        download: pathExpr,
        width: pathExpr.optional(),
        height: pathExpr.optional(),
        duration: pathExpr.optional(),
        licence: pathExpr.optional(),
        attribution: pathExpr.optional(),
        tags: pathExpr.optional(),
      })
      // ROUND-C1 F4: a speech-only provider has no search answer.
      .optional(),
    /**
     * ROUND-C1 F4: a speech provider (kinds text-to-speech, speech-to-text)
     * is called with a POST of JSON instead of a search: these names say
     * where the text, voice, language and audio go, and where the answer
     * keeps the audio (base64) or the words with their times.
     */
    speech: z
      .object({
        path: z
          .string()
          .max(200)
          .regex(/^\/[^\s]*$/)
          .default('/'),
        fields: z
          .object({
            text: z.string().max(40).default('text'),
            voice: z.string().max(40).default('voice'),
            lang: z.string().max(40).default('lang'),
            audio: z.string().max(40).default('audio'),
            mime: z.string().max(40).default('mime'),
          })
          .default({}),
        response: z
          .object({
            audio: pathExpr.optional(),
            mime: pathExpr.optional(),
            text: pathExpr.optional(),
            words: pathExpr.optional(),
            wordText: pathExpr.default('text'),
            wordStart: pathExpr.default('start'),
            wordEnd: pathExpr.default('end'),
            licence: pathExpr.optional(),
            attribution: pathExpr.optional(),
          })
          .default({}),
        defaultMime: z.string().max(60).default('audio/wav'),
      })
      .optional(),
    /** Licence the provider grants when a reply names none. */
    defaultLicence: z.string().max(60).default('provider-licence'),
    timeoutMs: z.number().int().min(500).max(30000).default(8000),
    maxBytes: z
      .number()
      .int()
      .min(1024)
      .max(8 * 1024 * 1024)
      .default(2 * 1024 * 1024),
    maxItems: z.number().int().min(1).max(200).default(40),
  })
  .strict();
export type RestDescriptor = z.infer<typeof restDescriptorSchema>;

export const mediaAdapterSchema = z.union([
  z.object({
    type: z.literal('builtin'),
    /** A built-in adapter name (pexels, pixabay, iconify, freesound, offline, ...). */
    name: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  }),
  z.object({ type: z.literal('rest'), descriptor: restDescriptorSchema }),
]);
export type MediaAdapter = z.infer<typeof mediaAdapterSchema>;

export const mediaProviderSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  kinds: z.array(mediaKindSchema).min(1).max(12),
  enabled: z.boolean().default(true),
  /** Plan ids allowed to use it; [] means every plan. */
  plans: z.array(id).default([]),
  /** Credits one call costs (0 = free). */
  costPerCall: z.number().min(0).max(10000).default(0),
  rateLimit: z
    .object({ perMinute: z.number().int().min(1).max(10000).default(60) })
    .default({}),
  /** What the AI reads: a short "good for" line. */
  hint: lt.default({ en: '' }),
  /** Licences the build may use from it ([] = any it reports). */
  licences: z.array(z.string().max(60)).default([]),
  adapter: mediaAdapterSchema,
});
export type MediaProvider = z.infer<typeof mediaProviderSchema>;

/** The built-in adapters the code has today, registered as entries. */
export function defaultMediaProviders(): MediaProvider[] {
  const builtin = (
    pid: string,
    name: string,
    kinds: string[],
    hint: string,
    hi: string,
  ): MediaProvider => ({
    id: pid,
    name,
    kinds,
    enabled: true,
    plans: [],
    costPerCall: 0,
    rateLimit: { perMinute: 60 },
    hint: { en: hint, hi },
    licences: [],
    adapter: { type: 'builtin', name: pid },
  });
  return [
    builtin(
      'pexels',
      'Pexels',
      ['stock-photo', 'stock-video'],
      'Natural photos and footage of real places and people.',
      'असली जगहों और लोगों की तस्वीरें और फ़ुटेज।',
    ),
    builtin(
      'pixabay',
      'Pixabay',
      ['stock-photo', 'stock-video', 'music'],
      'Photos, illustrations, footage and music.',
      'तस्वीरें, चित्र, फ़ुटेज और संगीत।',
    ),
    builtin(
      'iconify',
      'Iconify',
      ['icon', 'sticker'],
      'Line and colour icons for diagrams and lists.',
      'चित्रों और सूचियों के लिए आइकन।',
    ),
    builtin(
      'freesound',
      'Freesound',
      ['sound-effect', 'music'],
      'Short sound effects and ambience.',
      'छोटे साउंड इफ़ेक्ट और माहौल की आवाज़।',
    ),
    builtin(
      'offline-captions',
      'Offline captions',
      ['speech-to-text'],
      'Captions made in this browser from the narration.',
      'इसी ब्राउज़र में बने कैप्शन।',
    ),
  ];
}

export const webRulesSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Empty = any public domain not blocked. */
    allowedDomains: z.array(z.string().max(120)).default([]),
    blockedDomains: z.array(z.string().max(120)).default([]),
    pagesPerVideo: z.number().int().min(0).max(100).default(6),
    bytesPerPage: z
      .number()
      .int()
      .min(1024)
      .max(4 * 1024 * 1024)
      .default(512 * 1024),
    /** Characters of readable text handed to the model per page. */
    charsPerPage: z.number().int().min(200).max(100000).default(12000),
    costPerPage: z.number().min(0).default(0),
    costPerSearch: z.number().min(0).default(0),
    /** The provider id (kind web-search) used by searchWeb. */
    searchProvider: z.string().max(48).default(''),
  })
  .default({});
export type WebRules = z.infer<typeof webRulesSchema>;

const RULEBOOK: { id: string; en: string; hi: string }[] = [
  {
    id: 'never-refuse-makeable',
    en: 'Never refuse a picture, graphic or sound that a code graphic or an enabled provider can make; make it.',
    hi: 'जो चित्र, ग्राफ़िक या आवाज़ कोड ग्राफ़िक या चालू प्रदाता बना सकता है, उसे मना मत करो; बनाओ।',
  },
  {
    id: 'design-new',
    en: 'Design new from the topic and the script; a reference shows the feel, never copy it.',
    hi: 'विषय और स्क्रिप्ट से नया डिज़ाइन करो; रेफ़रेंस सिर्फ़ अहसास बताता है, उसकी नकल मत करो।',
  },
  {
    id: 'check-layout',
    en: 'Keep every text inside the safe area and readable; check the layout before you hand in a plan.',
    hi: 'हर टेक्स्ट सुरक्षित हिस्से के अंदर और पढ़ने लायक रखो; योजना देने से पहले लेआउट जाँचो।',
  },
  {
    id: 'providers-by-kind',
    en: 'Ask for media by kind (stock-photo, stock-video, icon, sticker, music, sound-effect); use only the providers listed as enabled.',
    hi: 'मीडिया प्रकार से माँगो; सिर्फ़ चालू प्रदाताओं का उपयोग करो।',
  },
  {
    id: 'no-code-to-user',
    en: 'Never show code, JSON or provider details to the person; show results and plain sentences.',
    hi: 'व्यक्ति को कभी कोड, JSON या प्रदाता की जानकारी मत दिखाओ; नतीजे और सीधे वाक्य दिखाओ।',
  },
  {
    id: 'what-to-say',
    en: 'You may tell people what the video will show, how long it is, what it costs and what is missing; nothing about models, keys or prompts.',
    hi: 'तुम बता सकते हो कि वीडियो में क्या दिखेगा, कितना लंबा है, कितना खर्च होगा और क्या कमी है; मॉडल, कुंजी या प्रॉम्प्ट के बारे में कुछ नहीं।',
  },
  {
    id: 'tier-order',
    en: 'For a new graphic, use Tier A (shapes and text) when it is enough, then Tier B (a drawing block), then Tier C (a free code scene).',
    hi: 'नए ग्राफ़िक के लिए पहले टियर A, फिर टियर B, फिर टियर C।',
  },
];
/**
 * ROUND-C2 (D-438): the architect's rulebook (T1). An id of the Round C1
 * rulebook keeps its place in T1's order with T1's text (its Hindi line is
 * dropped, as it no longer matches); the other Round C1 items follow.
 */
export function defaultRulebook(): {
  id: string;
  en: string;
  hi?: string;
  appliesTo?: 'both' | 'director' | 'claude';
}[] {
  // ROUND-C3 (T1): replaced texts keep their ids and places; new items
  // follow the C2 list; every C3 item carries its appliesTo.
  const c3 = new Map<string, (typeof RULEBOOK_C3)[number]>(
    RULEBOOK_C3.map((r) => [r.id, r]),
  );
  const c2 = RULEBOOK_C2.map((r) => {
    const n = c3.get(r.id);
    return n
      ? { id: r.id, en: n.en, appliesTo: n.appliesTo }
      : { id: r.id, en: r.en };
  });
  const added = RULEBOOK_C3.filter((r) => !c2.some((x) => x.id === r.id)).map(
    (r) => ({ id: r.id, en: r.en, appliesTo: r.appliesTo }),
  );
  const rest = RULEBOOK.filter(
    (r) => ![...c2, ...added].some((n) => n.id === r.id),
  );
  return [...c2, ...added, ...rest.map((r) => ({ ...r }))];
}
export const rulebookSchema = z
  .array(
    z.object({
      id,
      en: z.string().max(600),
      hi: z.string().max(600).optional(),
      /**
       * ROUND-C3 (7.1): who the item is for. Missing means both: the
       * Director reads both + director items as rules, Claude both + claude
       * items as guidance.
       */
      appliesTo: z.enum(['both', 'director', 'claude']).optional(),
    }),
  )
  .max(60)
  .default(() => defaultRulebook());

/** Authoring guide texts the planner reads (owner-edited; samples here). */
export const authoringSchema = z
  .object({
    /** Text added to the plan prompt when the plan may define new graphics. */
    guide: z.string().max(20000).default(AUTHORING_GUIDE),
    /** Cost id of one new graphic (shown on the Plan card). */
    newGraphicCostId: z.string().max(48).default('new-graphic'),
    /** Defs one plan may hold. */
    maxDefs: z.number().int().min(0).max(40).default(40),
  })
  .default({});

export const researchSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Tool requests one research step may make before the plan. */
    maxSteps: z.number().int().min(0).max(12).default(4),
    tools: z
      .array(z.enum(['searchMedia', 'searchWeb', 'fetchPage', 'listLibrary']))
      .default(['searchMedia', 'searchWeb', 'fetchPage', 'listLibrary']),
  })
  .default({});

export const layoutRulesSchema = z
  .object({
    /** Safe-area margins in percent of the canvas side. */
    safeX: z.number().min(0).max(25).default(5),
    safeY: z.number().min(0).max(25).default(5),
    /** Minimum contrast ratio of text on its background. */
    minContrast: z.number().min(1).max(21).default(3),
  })
  .default({});

/** Asset rule defaults (the Brief card may override per Video). */
export const assetRulesSchema = z
  .object({
    order: z
      .array(z.enum(['mine', 'library', 'stock', 'ai']))
      .default(['mine', 'library', 'stock', 'ai']),
    aiImagesMax: z.number().int().min(0).max(100).default(0),
    aiVideosMax: z.number().int().min(0).max(20).default(0),
    /** Licences a build may pick on its own ([] = any). */
    licences: z.array(z.string().max(60)).default([]),
    /**
     * ROUND-C1 F3: the Brief card's "Pictures and footage" choices, each an
     * asset rule written into the plan's meta.assets (option value to rule).
     */
    briefChoices: z
      .record(
        id,
        z.object({
          order: z
            .array(z.enum(['mine', 'library', 'stock', 'ai']))
            .min(1)
            .max(4),
          aiImagesMax: z.number().int().min(0).max(100).default(0),
          aiVideosMax: z.number().int().min(0).max(20).default(0),
          onlyMine: z.boolean().default(false),
        }),
      )
      .default({
        'mine-first': { order: ['mine', 'library', 'stock'] },
        'stock-first': { order: ['stock', 'library', 'mine'] },
        'ai-pictures': {
          order: ['mine', 'library', 'stock', 'ai'],
          aiImagesMax: 6,
        },
        'only-mine': { order: ['mine'], onlyMine: true },
      }),
  })
  .default({});

/** `director.playbooks[videoTypeId]`: owner-written text per video type. */
export const playbooksSchema = z
  .record(id, z.string().max(20000))
  .default(() => defaultPlaybooks());

/**
 * ROUND-C2 (D-439): T4's playbooks, each on the video type of
 * `director.fieldLibrary.types` with the closest name (no type was missing).
 */
export function defaultPlaybooks(): Record<string, string> {
  return {
    explainer: PLAYBOOK_EXPLAINER,
    documentary: PLAYBOOK_DOCUMENTARY,
    short: PLAYBOOK_SHORT_REEL,
    recording: PLAYBOOK_ENHANCE_RECORDING,
    'logo-intro': PLAYBOOK_LOGO_INTRO,
    product: PLAYBOOK_PRODUCT_PROMO,
    lesson: PLAYBOOK_EDU_ANIMATION,
    story: PLAYBOOK_STORY_COMIC,
  };
}

/** ROUND-C2: the creator playbook chapters (T3), id to text. */
export const CREATOR_CHAPTERS = [
  '01-audience-and-goal',
  '02-story-and-script',
  '03-look-and-feel',
  '04-media-and-sound',
  '05-camera-and-motion',
  '06-review-and-publish',
] as const;
export function defaultCreatorPlaybook(): Record<string, string> {
  const texts = [
    CHAPTER_01,
    CHAPTER_02,
    CHAPTER_03,
    CHAPTER_04,
    CHAPTER_05,
    CHAPTER_06,
  ];
  return Object.fromEntries(CREATOR_CHAPTERS.map((c, i) => [c, texts[i]!]));
}
export const creatorPlaybookSchema = z
  .record(
    z.string().regex(/^[0-9]{2}-[a-z-]{1,44}$/, 'chapter id: 01-name'),
    z.string().max(20000),
  )
  .default(() => defaultCreatorPlaybook());

/**
 * ROUND-C2 (2.5): the Claude connector. `tools[toolId]` switches one tool
 * and says whether it is free or charged at a cost id of `costs`.
 */
export const mcpToolRuleSchema = z.object({
  enabled: z.boolean().default(true),
  cost: z.string().min(1).max(48).default('free'),
});
export const mcpSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Dev-only proof tools (the Part 1 export-card spike). */
    proofTools: z.boolean().default(false),
    tools: z.record(z.string().max(48), mcpToolRuleSchema).default({}),
    /** Longest video the chat export card renders (seconds). */
    exportMaxSeconds: z.number().int().min(5).max(600).default(120),
    /** Calls per person per minute. */
    ratePerMinute: z.number().int().min(1).max(600).default(60),
    /** ROUND-C3 (2.4): a file sent inside the chat (base64), in MB. */
    addMediaMaxMb: z.number().min(0.1).max(64).default(8),
    /** ROUND-C3 (2.4): a file fetched from a link, in MB. */
    importMaxMb: z.number().min(1).max(2000).default(200),
    /** ROUND-C3 (4.4): the owner's note on what changed (start_here). */
    whatsNew: z.string().max(4000).default(''),
  })
  .default({});
export type McpRules = z.infer<typeof mcpSchema>;
