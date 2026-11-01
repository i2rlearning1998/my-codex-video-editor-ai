// P2-0: the Platform Config. One versioned document that the website, the user
// panel and the editor all read; Admin (Phase 3) only edits it. Nothing the
// person sees or the AI may do is fixed in code (docs/PLATFORM-CONFIG.md).
// Secrets never live here: the config only names adapters.
import { z } from 'zod';

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

/** P2-05: the roles a model can serve (Director, interview, Studio tools). */
export const roleId = z
  .string()
  .regex(
    /^(director-plan|interview|write|studio-[a-z0-9-]{1,40})$/,
    'role: director-plan, interview, write or studio-…',
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
  /** What it makes: drives the result view and the Asset Library kind. */
  output: z.enum(STUDIO_OUTPUTS).default('text'),
  /** The form the person fills (same field types as the Brief). */
  inputs: z.array(fieldSchema).default([]),
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
  roles: z.array(roleId).min(1),
  /** Plan features needed to pick this model ([] means every plan). */
  requires: z.array(id).default([]),
  enabled: z.boolean().default(true),
  recommendedForDirector: z.boolean().default(false),
  /** False until the adapter has been run against the real provider. */
  tested: z.boolean().default(false),
  /** The price is a sample the owner must replace. */
  samplePrice: z.boolean().default(true),
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
  brief: z.object({ fields: z.array(fieldSchema) }),
  interview: z.object({
    maxQuestions: z.number().int().min(0).max(20).default(5),
    questions: z.array(interviewQuestionSchema).default([]),
    creativeUpgrade: z.boolean().default(true),
    /** P2-R2: the only follow-ups a model may ask. */
    followUps: z.array(z.object({ id, ask: textSchema })).default([]),
  }),
  order: z.number().default(0),
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
      kind: z.enum(['hero', 'showcase', 'styles', 'pricing', 'faq', 'text']),
      enabled: z.boolean().default(true),
      title: textSchema.optional(),
      body: textSchema.optional(),
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
      if (s.enabled && roleModels(s.role).length === 0)
        ctx.addIssue({
          code: 'custom',
          message: `studio ${s.id}: no model serves role ${s.role}`,
        });
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
