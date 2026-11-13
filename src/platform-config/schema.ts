// P2-0: the Platform Config. One versioned document that the website, the user
// panel and the editor all read; Admin (Phase 3) only edits it. Nothing the
// person sees or the AI may do is fixed in code (docs/PLATFORM-CONFIG.md).
// Secrets never live here: the config only names adapters.
import { z } from 'zod';
import { paramDeclSchema } from '../contracts/p3';

export const CONFIG_SCHEMA_VERSION = 1;

/** Owner-written text. English is required, other locales are optional. */
export const textSchema = z
  .object({ en: z.string(), hi: z.string().optional() })
  .passthrough();
export type LText = z.infer<typeof textSchema>;

const id = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9-]{0,47}$/, 'id: letters, digits, dash');
const money = z.object({ inr: z.number().min(0), usd: z.number().min(0) });

export const brandSchema = z.object({
  name: z.string().min(1),
  logoUrl: z.string().default(''),
  tagline: textSchema.optional(),
  defaultLocale: z.enum(['en', 'hi']).default('en'),
  colors: z.record(z.string(), z.string()).default({}),
});

export const planSchema = z.object({
  id,
  name: textSchema,
  price: money,
  period: z.enum(['month', 'year', 'none']).default('month'),
  monthlyCredits: z.number().int().min(0),
  watermark: z.boolean().default(false),
  limits: z
    .object({
      exportsPerMonth: z.number().int().min(0).nullable().default(null),
      maxExportHeight: z.number().int().min(144).default(720),
      storageMb: z.number().int().min(0).default(2048),
      voiceClones: z.number().int().min(0).default(0),
      projects: z.number().int().min(0).nullable().default(null),
      /** ROUND-A: Videos one Project may hold (null: no cap). */
      videosPerProject: z.number().int().min(0).nullable().default(null),
      /** Gateway calls a person may make per minute. */
      callsPerMinute: z.number().int().min(1).default(30),
      /** Credits a person may spend in one day (null: no cap). */
      creditsPerDay: z.number().int().min(0).nullable().default(null),
    })
    .default({}),
  features: z.array(id).default([]),
  sortOrder: z.number().default(0),
  public: z.boolean().default(true),
});
export type Plan = z.infer<typeof planSchema>;

export const costSchema = z.object({
  id,
  label: textSchema,
  unit: z.enum(['each', 'minute', 'scene', 'second']).default('each'),
  min: z.number().min(0),
  max: z.number().min(0),
  /** Plan features needed to use it ([] means every plan). */
  requires: z.array(id).default([]),
});
export type Cost = z.infer<typeof costSchema>;

export const STUDIO_OUTPUTS = [
  'text',
  'audio',
  'image',
  'video',
  'captions',
  'pack',
] as const;
// (fieldSchema is declared below; studios reuse it for their inputs.)

export const FIELD_TYPES = [
  'text',
  'longtext',
  'choice',
  'multi',
  'toggle',
  'number',
  'slider',
  'color',
  'file',
  'voice',
  'ref',
] as const;
export const fieldSchema = z.object({
  id,
  type: z.enum(FIELD_TYPES),
  label: textSchema,
  help: textSchema.optional(),
  required: z.boolean().default(false),
  options: z
    .array(z.object({ value: z.string(), label: textSchema }))
    .default([]),
  min: z.number().optional(),
  max: z.number().optional(),
  default: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
  /** Hide until another field has one of these values. */
  showIf: z.object({ field: id, in: z.array(z.string()).min(1) }).optional(),
  group: id.optional(),
  order: z.number().default(0),
});
export type BriefField = z.infer<typeof fieldSchema>;

/**
 * ROUND-A A4: a Studio field. The Brief's field plus how it is drawn and
 * checked: chips, picture cards, a two-way toggle or a list; character and
 * file limits; a swap button between two uploads; story ideas per category;
 * an Enhance or Generate button under a prompt; fields only some models
 * accept; options a plan must unlock. Every value is the owner's.
 */
export const STUDIO_FIELD_TYPES = [...FIELD_TYPES, 'ideas', 'info'] as const;
export const studioFieldSchema = fieldSchema.extend({
  type: z.enum(STUDIO_FIELD_TYPES),
  options: z
    .array(
      z.object({
        value: z.string(),
        label: textSchema,
        /** Plan features that unlock this option ([] = every plan). */
        requires: z.array(id).optional(),
        /** A picture for a card option: a URL, or a seed the panel draws from. */
        art: z.string().max(300).optional(),
        /** A sample to play (a voice), an https or same-site URL. */
        preview: z.string().max(300).optional(),
      }),
    )
    .default([]),
  display: z.enum(['chips', 'cards', 'toggle', 'select', 'radio']).optional(),
  /** Characters a text may have. */
  maxLength: z.number().int().min(1).max(20000).optional(),
  /** Files: the types (MIME) accepted and the largest size in bytes. */
  accept: z.array(z.string().max(60)).max(12).optional(),
  maxBytes: z.number().int().min(1).optional(),
  /** Another file field this one swaps with (Video: first and last frame). */
  swapWith: id.optional(),
  /** Only these models accept the field ([] or none: every model). */
  onlyModels: z.array(id).optional(),
  /** A button under a prompt: improve it, or write one from the frames. */
  action: z.enum(['enhance', 'generate']).optional(),
  /** `ideas`: the field whose value picks the list, and the field it fills. */
  ideasFor: id.optional(),
  fills: id.optional(),
  ideas: z.record(z.string(), z.array(textSchema)).optional(),
  /** `ideas`: how many show before "View more". */
  ideasShown: z.number().int().min(1).max(50).optional(),
  /** `info`: lines (tips, how it works). */
  lines: z.array(textSchema).optional(),
});
export type StudioField = z.infer<typeof studioFieldSchema>;

/** P2-05: the roles a model can serve (Director, interview, Studio tools). */
export const roleId = z
  .string()
  .regex(
    /^(director-plan|interview|write|editor-chat|studio-[a-z0-9-]{1,40})$/,
    'role: director-plan, interview, write, editor-chat or studio-…',
  );

export const studioSchema = z.object({
  id,
  name: textSchema,
  blurb: textSchema.optional(),
  enabled: z.boolean().default(true),
  /** P2-07: the model role that serves this studio (models list it in `roles`). */
  role: roleId,
  /** Which Director tool this studio is (its allow-list entry), if any. */
  toolId: id.optional(),
  /** P4: studios of one family are tabs of one tool (Voice: speech, changer, effects, music). */
  family: id.optional(),
  familyName: textSchema.optional(),
  /** What it makes: drives the result view and the Asset Library kind. */
  output: z.enum(STUDIO_OUTPUTS).default('text'),
  /** The form the person fills (the Brief's field types plus ROUND-A's). */
  inputs: z.array(studioFieldSchema).default([]),
  /** ROUND-A: collapsible sections of the form (a field's `group`), e.g. Advanced. */
  groups: z
    .array(
      z.object({ id, label: textSchema, open: z.boolean().default(false) }),
    )
    .default([]),
  /**
   * ROUND-A: shown only when the owner assigned a model to this tool's role
   * (Platform Config `assignments`), e.g. Image › Upscale.
   */
  needsAssignment: z.boolean().default(false),
  /** ROUND-A: the heading of this tool's history (My generations, Cloned voices…). */
  historyLabel: textSchema.optional(),
  /** A tick the person must give before it runs (a voice clone's consent). */
  consent: textSchema.optional(),
  /** Ask for the consent only when an input has one of these values. */
  consentIf: z.object({ field: id, in: z.array(z.string()).min(1) }).optional(),
  /** Which input sets the workload: its length in characters, or a count. */
  workload: z
    .object({
      textField: id.optional(),
      countField: id.optional(),
      /** Fixed units per run (images, seconds or minutes) when no count field. */
      units: z.number().min(0).default(1),
    })
    .default({}),
  costId: id.optional(),
  requires: z.array(id).default([]),
  order: z.number().default(0),
});
export type Studio = z.infer<typeof studioSchema>;

/** P2-04: a model provider. `keyRef` is the NAME of a server secret, never a key. */
export const PROVIDER_KINDS = [
  'anthropic',
  'openai',
  'google',
  'xai',
  'openai-compatible',
  'elevenlabs',
  'video-jobs',
  'mock',
] as const;
export const providerSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(PROVIDER_KINDS),
  enabled: z.boolean().default(true),
  keyRef: z
    .string()
    .regex(
      /^[A-Z][A-Z0-9_]{1,63}$/,
      'keyRef: the NAME of a server secret, like ANTHROPIC_API_KEY',
    ),
  baseUrl: z.string().url().optional(),
});
export type Provider = z.infer<typeof providerSchema>;

export const MODEL_KINDS = [
  'text',
  'image',
  'video',
  'voice',
  'music',
  'stt',
] as const;
export const MODEL_TIERS = ['fast', 'balanced', 'best'] as const;
/** P2-05: a model, its price in USD and what it may be used for. */
export const modelSchema = z.object({
  id,
  providerId: id,
  /** The provider's own model name (sent in the request). */
  providerModel: z.string().min(1).max(100),
  kind: z.enum(MODEL_KINDS),
  name: textSchema,
  tier: z.enum(MODEL_TIERS),
  capabilities: z
    .object({
      json: z.boolean().default(false),
      tools: z.boolean().default(false),
      vision: z.boolean().default(false),
    })
    .default({}),
  contextTokens: z.number().int().min(0).default(0),
  /** USD. Text: per million tokens; media: per image, second or minute. */
  price: z
    .object({
      inputPerMTok: z.number().min(0).default(0),
      outputPerMTok: z.number().min(0).default(0),
      perImage: z.number().min(0).default(0),
      perSecond: z.number().min(0).default(0),
      perMinute: z.number().min(0).default(0),
    })
    .default({}),
  /** Multiplies the provider cost before it becomes credits (1 = at cost). */
  creditMargin: z.number().min(1).default(1),
  /** The roles this model may serve; empty means "not offered yet" (P4). */
  roles: z.array(roleId).default([]),
  /** Plan features needed to pick this model ([] means every plan). */
  requires: z.array(id).default([]),
  enabled: z.boolean().default(true),
  recommendedForDirector: z.boolean().default(false),
  /** False until the adapter has been run against the real provider. */
  tested: z.boolean().default(false),
  /** The price is a sample the owner must replace. */
  samplePrice: z.boolean().default(true),
  /** P3-WIRING (W1): the parameters this model takes; the Studio form is built from them. */
  params: z.array(paramDeclSchema).default([]),
  order: z.number().default(0),
});
export type Model = z.infer<typeof modelSchema>;

/** P2-06: a payment provider (interface only in this round; a mock works). */
export const paymentSchema = z.object({
  id,
  name: z.string().min(1),
  kind: z.enum(['mock', 'razorpay', 'stripe']),
  enabled: z.boolean().default(true),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).default([]),
  currencies: z.array(z.enum(['INR', 'USD'])).min(1),
});
/** Credit packs a person can buy on top of the plan. */
export const topUpSchema = z.object({
  id,
  credits: z.number().int().min(1),
  price: z.object({ inr: z.number().min(0), usd: z.number().min(0) }),
});
/** Learn: a list of guides and videos for the panel. */
export const learnSchema = z.object({
  id,
  title: textSchema,
  body: textSchema.optional(),
  url: z.string().default(''),
  minutes: z.number().min(0).default(0),
  order: z.number().default(0),
});

export const interviewQuestionSchema = z.object({
  id,
  ask: textSchema,
  /** Brief field it fills; the question is skipped when that is answered. */
  fills: id.optional(),
  answers: z.array(textSchema).default([]),
  allowFreeText: z.boolean().default(true),
  order: z.number().default(0),
});

export const styleSchema = z.object({
  id,
  name: textSchema,
  blurb: textSchema,
  playbook: z.string().default(''),
  /** P2-R2: the Style's rules for the planning model (config text). */
  playbookText: z.string().max(8000).default(''),
  enabled: z.boolean().default(true),
  cardArt: z.string().default(''),
  formats: z.array(z.enum(['16:9', '9:16', '1:1', '4:5'])).min(1),
  requires: z.array(id).default([]),
  priceHint: z
    .object({ min: z.number(), max: z.number(), per: z.string() })
    .optional(),
  brief: z.object({
    fields: z.array(fieldSchema),
    /** P2B-30: the Brief room's collapsible sections (a field's `group`). */
    groups: z
      .array(
        z.object({ id, label: textSchema, open: z.boolean().default(true) }),
      )
      .default([]),
  }),
  interview: z.object({
    maxQuestions: z.number().int().min(0).max(20).default(5),
    questions: z.array(interviewQuestionSchema).default([]),
    creativeUpgrade: z.boolean().default(true),
    /** P2-R2: the only follow-ups a model may ask. */
    followUps: z.array(z.object({ id, ask: textSchema })).default([]),
  }),
  order: z.number().default(0),
  /**
   * ROUND-A: the style record a Project gets when it starts from this
   * ready-made Style (every field optional; the blurb and the playbook text
   * fill graphics notes and script rules when these are empty).
   */
  projectStyle: z
    .object({
      palette: z
        .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
        .max(8)
        .default([]),
      headingFont: z.string().max(60).default(''),
      bodyFont: z.string().max(60).default(''),
      captionStyle: z.string().max(60).default(''),
      graphics: textSchema.optional(),
      voice: textSchema.optional(),
      music: textSchema.optional(),
      scriptRules: textSchema.optional(),
    })
    .optional(),
});
export type Style = z.infer<typeof styleSchema>;

export const directorSchema = z.object({
  persona: textSchema,
  /** What Director may do. Anything else gets one of `refusals`. */
  scope: z.array(id),
  refusals: z.array(
    z.object({
      id,
      when: textSchema,
      reply: textSchema,
      alternative: textSchema.optional(),
      /** Words or phrases that mark a request as this refusal (lower case). */
      keywords: z.array(z.string().min(2)).default([]),
    }),
  ),
  /** Opening line of the chat, and the creative-upgrade suggestion. */
  greeting: textSchema.optional(),
  creativeUpgrade: z
    .object({ enabled: z.boolean().default(true), text: textSchema })
    .optional(),
  /** P2-R2 (P2B-17): the model prompts, with {{variables}} filled by code. */
  prompts: z
    .object({
      plan: z.string().min(20).max(20000),
      repair: z.string().min(20).max(4000),
      interview: z.string().min(20).max(4000),
      upgradeOn: z.string().min(1).max(2000),
      upgradeOff: z.string().min(1).max(2000),
      /** P3-WIRING (W3): the Director chat ({{persona}}, {{scope}}, {{context}}). */
      chat: z.string().min(20).max(8000).optional(),
      /** P3-WIRING (W5): "Enhance with Director" ({{fields}}, {{values}}). */
      enhance: z.string().min(20).max(4000).optional(),
      /** P3-WIRING (W9): the editor chat ({{commands}}, {{context}}). */
      edit: z.string().min(20).max(8000).optional(),
    })
    .optional(),
  /** P2-R2: what a plan may hold (checked before it is shown). */
  limits: z
    .object({
      maxScenes: z.number().int().min(1).max(40).default(12),
      maxSceneSeconds: z.number().min(1).max(600).default(30),
      maxNarrationChars: z.number().int().min(20).max(4000).default(600),
      planOutputTokens: z.number().int().min(500).max(64000).default(8000),
    })
    .default({}),
  /** P2-07: which model role plans, interviews and writes. */
  roles: z
    .object({
      plan: roleId.default('director-plan'),
      interview: roleId.default('interview'),
      write: roleId.default('write'),
    })
    .default({}),
  /** Token sizes the estimator uses (owner can tune). */
  estimate: z
    .object({
      systemTokens: z.number().int().min(0).default(3000),
      inputTokensPerScene: z
        .object({ min: z.number().min(0), max: z.number().min(0) })
        .default({ min: 300, max: 600 }),
      outputTokensPerScene: z
        .object({ min: z.number().min(0), max: z.number().min(0) })
        .default({ min: 500, max: 1200 }),
      secondsPerScene: z.number().min(1).default(8),
    })
    .default({}),
  /** Allow-list of gateway tools with per-tool rules. */
  tools: z.array(
    z.object({
      id,
      enabled: z.boolean().default(true),
      needsApproval: z.boolean().default(true),
      maxCreditsPerRun: z.number().min(0).nullable().default(null),
      requires: z.array(id).default([]),
      /** The credit cost of one scene made this way (a scene method). */
      costId: id.optional(),
      name: textSchema.optional(),
    }),
  ),
  methodOrder: z.array(id),
  budget: z.object({
    maxCreditsPerVideo: z.number().min(0).nullable().default(null),
    approvalAbove: z.number().min(0).default(0),
  }),
  reveal: z.object({
    plan: z.boolean().default(true),
    methods: z.boolean().default(true),
    credits: z.boolean().default(true),
    code: z.boolean().default(false),
    modelNames: z.boolean().default(false),
  }),
});
export type DirectorRules = z.infer<typeof directorSchema>;

export const siteSchema = z.object({
  sections: z.array(
    z.object({
      id,
      kind: z.enum([
        'hero',
        'story',
        'showcase',
        'styles',
        'pricing',
        'faq',
        'text',
      ]),
      enabled: z.boolean().default(true),
      title: textSchema.optional(),
      body: textSchema.optional(),
      /** P2B-33: the story's steps, or the FAQ's questions and answers. */
      items: z
        .array(z.object({ title: textSchema, body: textSchema }))
        .default([]),
      order: z.number().default(0),
    }),
  ),
  showcase: z.array(
    z.object({
      id,
      title: textSchema,
      videoUrl: z.string(),
      posterUrl: z.string().default(''),
    }),
  ),
});

export const backendSchema = z.object({
  auth: z.string().default('local'),
  database: z.string().default('local'),
  storage: z.string().default('local'),
  payments: z.array(z.string()).default([]),
  /** Public settings only, e.g. a project URL. Never keys. */
  publicSettings: z.record(z.string(), z.string()).default({}),
});

/**
 * P3-WIRING (W1): the owner's P3 settings (chat, vision, memory, login).
 * Every default is a SAMPLE (`sample: true`) the owner replaces in Admin.
 */
const posInt = z.number().int().min(1);
export const p3Schema = z
  .object({
    sample: z.boolean().default(true),
    chat: z
      .object({
        enabled: z.boolean().default(true),
        maxMessagesPerDay: posInt.default(200),
        maxHistoryTokens: posInt.default(6000),
      })
      .default({}),
    vision: z
      .object({
        enabled: z.boolean().default(true),
        creditsPerImage: z.number().min(0).default(2),
        maxImagesPerMessage: z.number().int().min(0).default(4),
      })
      .default({}),
    memory: z
      .object({
        keepRecent: posInt.default(8),
        summariseAboveTokens: posInt.default(4000),
        maxFacts: posInt.default(60),
        maxStyleRules: posInt.default(20),
      })
      .default({}),
    /** What a person may attach to one chat message. */
    attach: z
      .object({
        maxBytes: z
          .object({
            image: posInt.default(10 * 1024 * 1024),
            audio: posInt.default(25 * 1024 * 1024),
            video: posInt.default(200 * 1024 * 1024),
            text: posInt.default(1024 * 1024),
            pdf: posInt.default(20 * 1024 * 1024),
          })
          .default({}),
        maxFilesPerMessage: posInt.default(6),
        /** Characters of a text or PDF file read into the model's context. */
        maxTextChars: posInt.default(20000),
      })
      .default({}),
    /** W8: sign-in limits (samples until the owner sets them). */
    login: z
      .object({
        maxFailuresPerEmail: posInt.default(5),
        maxFailuresPerIp: posInt.default(20),
        /** First lock; doubles with each further failure. */
        lockSeconds: posInt.default(60),
        maxLockSeconds: posInt.default(3600),
        /** Failures older than this are forgotten. */
        windowSeconds: posInt.default(900),
        minPasswordLength: z.number().int().min(6).max(128).default(10),
      })
      .default({}),
    entitlementTtlSeconds: posInt.default(600),
    webhookReplayWindowSeconds: posInt.default(300),
  })
  .default({});
export type P3Config = z.infer<typeof p3Schema>;

/** W1: a time-limited bonus on top-ups. */
export const campaignSchema = z.object({
  id,
  name: textSchema,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  /** Extra credits on a top-up, in percent of the pack's credits. */
  bonusPercent: z.number().min(0).max(500),
  /** Plans it applies to ([] means every plan). */
  plans: z.array(id).default([]),
  enabled: z.boolean().default(true),
});
export type Campaign = z.infer<typeof campaignSchema>;
/** W1: what a plan may keep (null: no cap). */
export const styleCapSchema = z.object({
  maxStyles: z.number().int().min(0).nullable().default(null),
  maxProjects: z.number().int().min(0).nullable().default(null),
  maxChatsPerProject: z.number().int().min(0).nullable().default(null),
});
export type StyleCap = z.infer<typeof styleCapSchema>;
/** ROUND-A: the ways a New project can start. */
export const NEW_PROJECT_OPTIONS = [
  'style',
  'director',
  'editor',
  'claude',
] as const;
export type NewProjectOption = (typeof NEW_PROJECT_OPTIONS)[number];
/** P4: how projects, Styles and the Trash behave. Every value is the owner's. */
export const workspaceSchema = z.object({
  /** Days a deleted project or asset waits in the Trash before it is gone. */
  trashDays: z.number().int().min(0).max(365).default(30),
  styleCreation: z
    .object({
      /** Plan features that allow saving a Style ([] means every plan). */
      requires: z.array(id).default([]),
      /** Credits one "Save to your styles" costs (0: free). */
      credits: z.number().int().min(0).default(0),
    })
    .default({}),
  /**
   * P4 start options a plan may use (the Owner App edits these). ROUND-A
   * reads them as limits on the New project options: without "director"
   * a plan has neither Director nor a ready-made Style (both start in
   * Director until Round B); without "blank" it has no "Start with editor".
   */
  startOptions: z
    .record(id, z.array(z.enum(['director', 'blank'])))
    .default({}),
  /** P4: Projects one Style held; ROUND-A reads it as Videos per Project when a plan sets no `videosPerProject`. */
  maxProjectsPerStyle: z.record(id, z.number().int().min(0)).default({}),
  /**
   * ROUND-A: the New project options a plan offers, in order (a plan
   * without an entry: ready-made Style, Director, Start with editor).
   */
  newProjectOptions: z
    .record(id, z.array(z.enum(NEW_PROJECT_OPTIONS)))
    .default({}),
  /** ROUND-A: "Your own Claude" (the connector is Round C). Off: never shown. */
  claudeConnector: z.boolean().default(false),
  /** Whether the Style chat (talking to a Style's Director) is on. */
  styleChat: z.boolean().default(true),
});
export type WorkspaceConfig = z.infer<typeof workspaceSchema>;
/** W1: a named set of models, one per role. */
export const comboSchema = z.object({
  id,
  name: textSchema,
  models: z.record(roleId, id),
  requires: z.array(id).default([]),
  enabled: z.boolean().default(true),
});
export type Combo = z.infer<typeof comboSchema>;

export const platformConfigSchema = z
  .object({
    schemaVersion: z.literal(CONFIG_SCHEMA_VERSION),
    brand: brandSchema,
    plans: z.array(planSchema).min(1),
    costs: z.array(costSchema),
    /** P2-05: credits per USD of provider cost. */
    creditRate: z.number().min(0),
    /** P2-R2 (P2B-26): the owner's sentences when a plan limit is hit ({n} = the limit). */
    limitMessages: z
      .object({
        exports: textSchema.optional(),
        storage: textSchema.optional(),
        voiceClones: textSchema.optional(),
        projects: textSchema.optional(),
        /** ROUND-A: one more Video than a Project may hold ({n}). */
        videos: textSchema.optional(),
        /** ROUND-A: the server could not be reached for a limit check. */
        offline: textSchema.optional(),
      })
      .default({}),
    providers: z.array(providerSchema),
    models: z.array(modelSchema),
    payments: z.array(paymentSchema),
    topUps: z.array(topUpSchema).default([]),
    learn: z.array(learnSchema).default([]),
    studios: z.array(studioSchema),
    styles: z.array(styleSchema),
    director: directorSchema,
    site: siteSchema,
    backend: backendSchema,
    p3: p3Schema,
    campaigns: z.array(campaignSchema).default([]),
    /** Keyed by plan id; a plan without an entry has no caps. */
    styleCaps: z.record(id, styleCapSchema).default({}),
    workspace: workspaceSchema.default({}),
    combos: z.array(comboSchema).default([]),
    /** P4: the owner's main model for a role (a model id). Nothing is pre-assigned. */
    assignments: z.record(roleId, id).default({}),
  })
  .superRefine((c, ctx) => {
    const dup = (label: string, ids: string[]) => {
      const seen = new Set<string>();
      for (const v of ids) {
        if (seen.has(v))
          ctx.addIssue({
            code: 'custom',
            message: `duplicate ${label} id: ${v}`,
          });
        seen.add(v);
      }
    };
    dup(
      'plan',
      c.plans.map((p) => p.id),
    );
    dup(
      'cost',
      c.costs.map((x) => x.id),
    );
    dup(
      'studio',
      c.studios.map((x) => x.id),
    );
    dup(
      'style',
      c.styles.map((x) => x.id),
    );
    dup(
      'provider',
      c.providers.map((x) => x.id),
    );
    dup(
      'model',
      c.models.map((x) => x.id),
    );
    dup(
      'payment',
      c.payments.map((x) => x.id),
    );
    const providerIds = new Set(c.providers.map((x) => x.id));
    for (const m of c.models)
      if (!providerIds.has(m.providerId))
        ctx.addIssue({
          code: 'custom',
          message: `model ${m.id}: unknown provider ${m.providerId}`,
        });
    const roleModels = (role: string) =>
      c.models.filter((m) => m.roles.includes(role as never));
    for (const s of c.studios)
      if (s.enabled && !s.needsAssignment && roleModels(s.role).length === 0)
        ctx.addIssue({
          code: 'custom',
          message: `studio ${s.id}: no model serves role ${s.role}`,
        });
    for (const [role, modelId] of Object.entries(c.assignments)) {
      const m = c.models.find((x) => x.id === modelId);
      if (!m)
        ctx.addIssue({
          code: 'custom',
          message: `assignment ${role}: unknown model ${modelId}`,
        });
      else if (!m.roles.includes(role))
        ctx.addIssue({
          code: 'custom',
          message: `assignment ${role}: model ${modelId} does not serve that role`,
        });
    }
    for (const role of Object.values(c.director.roles))
      if (roleModels(role).length === 0)
        ctx.addIssue({
          code: 'custom',
          message: `director: no model serves role ${role}`,
        });
    const toolIds = new Set(c.director.tools.map((t) => t.id));
    for (const m of c.director.methodOrder)
      if (!toolIds.has(m))
        ctx.addIssue({
          code: 'custom',
          message: `director: method ${m} is not a tool`,
        });
    const costIds = new Set(c.costs.map((x) => x.id));
    for (const t of c.director.tools)
      if (t.costId && !costIds.has(t.costId))
        ctx.addIssue({
          code: 'custom',
          message: `tool ${t.id}: unknown cost ${t.costId}`,
        });
    for (const s of c.studios)
      if (s.costId && !costIds.has(s.costId))
        ctx.addIssue({
          code: 'custom',
          message: `studio ${s.id}: unknown cost ${s.costId}`,
        });
    // W1: combos, campaigns, caps.
    dup(
      'combo',
      c.combos.map((x) => x.id),
    );
    dup(
      'campaign',
      c.campaigns.map((x) => x.id),
    );
    for (const combo of c.combos)
      for (const [role, modelId] of Object.entries(combo.models)) {
        const m = c.models.find((x) => x.id === modelId);
        if (!m)
          ctx.addIssue({
            code: 'custom',
            message: `Combo ${combo.id} names model ${modelId}, which is not in the model list.`,
          });
        else if (!m.roles.includes(role))
          ctx.addIssue({
            code: 'custom',
            message: `Combo ${combo.id} uses model ${modelId} for ${role}, but that model does not do ${role}.`,
          });
      }
    const planIds = new Set(c.plans.map((p) => p.id));
    for (const k of c.campaigns) {
      if (Date.parse(k.endsAt) <= Date.parse(k.startsAt))
        ctx.addIssue({
          code: 'custom',
          message: `Campaign ${k.id} ends before it starts.`,
        });
      for (const p of k.plans)
        if (!planIds.has(p))
          ctx.addIssue({
            code: 'custom',
            message: `Campaign ${k.id} names plan ${p}, which does not exist.`,
          });
    }
    for (const p of Object.keys(c.styleCaps))
      if (!planIds.has(p))
        ctx.addIssue({
          code: 'custom',
          message: `Style caps name plan ${p}, which does not exist.`,
        });
    for (const m of c.models)
      dup(
        `param in ${m.id}`,
        m.params.map((x) => x.id),
      );
    for (const st of c.styles) {
      dup(
        `field in ${st.id}`,
        st.brief.fields.map((f) => f.id),
      );
      const fieldIds = new Set(st.brief.fields.map((f) => f.id));
      for (const f of st.brief.fields) {
        if (f.showIf && !fieldIds.has(f.showIf.field))
          ctx.addIssue({
            code: 'custom',
            message: `style ${st.id}: showIf names unknown field ${f.showIf.field}`,
          });
        if (
          (f.type === 'choice' || f.type === 'multi') &&
          f.options.length === 0
        )
          ctx.addIssue({
            code: 'custom',
            message: `style ${st.id}: field ${f.id} needs options`,
          });
      }
      for (const q of st.interview.questions)
        if (q.fills && !fieldIds.has(q.fills))
          ctx.addIssue({
            code: 'custom',
            message: `style ${st.id}: question ${q.id} fills unknown field ${q.fills}`,
          });
    }
  });
export type PlatformConfig = z.infer<typeof platformConfigSchema>;
export type PlatformConfigInput = z.input<typeof platformConfigSchema>;

/** A saved version of the config. Versions are immutable once saved. */
export interface ConfigVersion {
  readonly version: number;
  readonly savedAt: string;
  readonly note: string;
  readonly config: PlatformConfig;
}
