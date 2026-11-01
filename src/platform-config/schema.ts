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

export const studioSchema = z.object({
  id,
  name: textSchema,
  enabled: z.boolean().default(true),
  /** Which gateway provider/model serves this studio (names only, no keys). */
  provider: z.string().default(''),
  model: z.string().default(''),
  costId: id.optional(),
  requires: z.array(id).default([]),
  order: z.number().default(0),
});

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
    }),
  ),
  /** Allow-list of gateway tools with per-tool rules. */
  tools: z.array(
    z.object({
      id,
      enabled: z.boolean().default(true),
      needsApproval: z.boolean().default(true),
      maxCreditsPerRun: z.number().min(0).nullable().default(null),
      requires: z.array(id).default([]),
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
    const costIds = new Set(c.costs.map((x) => x.id));
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

/** A saved version of the config. Versions are immutable once saved. */
export interface ConfigVersion {
  readonly version: number;
  readonly savedAt: string;
  readonly note: string;
  readonly config: PlatformConfig;
}
