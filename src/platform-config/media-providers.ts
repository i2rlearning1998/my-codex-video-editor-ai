// ROUND-C1 C1.1: the media-provider registry and the Director's power rules
// (web tools, rulebook v2, playbook slots, authoring guides, layout safe
// area). Everything here is data the owner edits in Platform Config; the
// code only knows provider KINDS and adapter TYPES, never a fixed list of
// providers. Secrets are never stored: a REST provider names a key-vault
// entry (`keyRef`), the gateway reads the key on the server.
import { z } from 'zod';

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
    response: z.object({
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
    }),
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
export const rulebookSchema = z
  .array(
    z.object({
      id,
      en: z.string().max(600),
      hi: z.string().max(600).optional(),
    }),
  )
  .max(60)
  .default(() => RULEBOOK.map((r) => ({ ...r })));

/** Authoring guide texts the planner reads (owner-edited; samples here). */
export const authoringSchema = z
  .object({
    /** Text added to the plan prompt when the plan may define new graphics. */
    guide: z.string().max(20000).default(''),
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
  })
  .default({});

/** `director.playbooks[videoTypeId]`: owner-written text per video type. */
export const playbooksSchema = z.record(id, z.string().max(20000)).default({});
