// ROUND-C1 C1.1: the shared tools. One DOM-free registry the Director uses
// now (and the Claude connector in Round C2): typed input (zod), typed
// output, plain-sentence errors, the cost each call may spend, and one row
// in the usage log per call. Anything that needs a browser (rendering
// frames) or a server (fetching, keys) is an interface in the context:
// the browser or the gateway supplies it; tests supply fakes.
import { z } from 'zod';
import type { PlatformConfig } from '../platform-config/schema';
import type { UsageLog } from '../gateway/usage';
import { validatePlan as validatePlanV } from '../video-plan/validate';
import { checkLayout, type LayoutFinding } from '../video-plan/layout-check';
import { liveCapabilitySheet, type KitEntry } from './capabilities';
import {
  searchMedia as searchMediaRun,
  type MediaRuntime,
  type RateLimiter,
  type RestRunner,
  type SearchMediaResult,
} from './media';
import {
  fetchPage as fetchPageRun,
  searchWeb as searchWebRun,
  type PageText,
  type WebResult,
  type WebRuntime,
} from './web';
import { ToolError } from './net-guard';

export { ToolError } from './net-guard';
export type { KitEntry } from './capabilities';

export interface LibraryEntry {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly tags?: readonly string[];
}
export interface KitStore {
  list(): readonly KitEntry[];
  /** Saves an accepted new graphic (a Creator Pack motion item). */
  add(entry: KitEntry & { readonly item: unknown }): void;
}
/** Small PNG frames of a built project (the browser renders them). */
export type RenderFrames = (
  project: unknown,
  times: readonly number[],
  size?: number,
) => Promise<
  readonly { time: number; png: Uint8Array; blank: boolean; outside: boolean }[]
>;
export interface ToolContext {
  readonly config: PlatformConfig;
  readonly planId: string;
  readonly userId: string;
  readonly usage?: UsageLog | undefined;
  readonly now?: (() => number) | undefined;
  readonly media: MediaRuntime;
  readonly limiter?: RateLimiter | undefined;
  /** Server only: guarded fetching for the web tools. */
  readonly web?: (WebRuntime & { readonly rest: RestRunner }) | undefined;
  /** Pages this Video has read (web rules count them). */
  readonly pagesUsed?: (() => number) | undefined;
  readonly notePage?: (() => void) | undefined;
  /** Credits the person may still spend, and the record of a spend. */
  readonly available?: (() => number) | undefined;
  readonly spend?: ((source: string, credits: number) => void) | undefined;
  readonly kit?: KitStore | undefined;
  readonly library?: ((query: string) => readonly LibraryEntry[]) | undefined;
  /**
   * Builds a plan headlessly (the editor supplies buildVideoFromPlan with
   * its services; kept as an interface so a server needs no editor code).
   */
  readonly build?:
    ((plan: unknown, signal?: AbortSignal) => Promise<unknown>) | undefined;
  readonly renderFrames?: RenderFrames | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly locale?: 'en' | 'hi' | undefined;
}
export interface ToolDef<I extends z.ZodTypeAny, O> {
  readonly id: string;
  readonly description: string;
  readonly input: I;
  /** The most credits one call may spend (shown before a paid call). */
  cost(input: z.infer<I>, config: PlatformConfig): number;
  /** Needs the server (keys, fetching): refused in a browser without a gateway. */
  readonly server?: boolean;
  run(input: z.infer<I>, ctx: ToolContext): Promise<O>;
}
const def = <I extends z.ZodTypeAny, O>(d: ToolDef<I, O>) => d;

const kind = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);
export const TOOLS = {
  getCapabilities: def({
    id: 'getCapabilities',
    description:
      'What the editor and the enabled providers can do now (text and a version).',
    input: z.object({}).strict(),
    cost: () => 0,
    run: async (_i, c) =>
      liveCapabilitySheet(c.config, {
        planId: c.planId,
        kit: c.kit?.list(),
        locale: c.locale,
      }),
  }),
  searchMedia: def({
    id: 'searchMedia',
    description: 'Searches every enabled provider of a kind for media.',
    input: z
      .object({
        kind,
        query: z.string().min(1).max(200),
        orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
        minDuration: z.number().min(0).max(600).optional(),
        providers: z.array(z.string().max(48)).max(20).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .strict(),
    cost: (i, config) =>
      config.mediaProviders
        .filter((p) => p.enabled && p.kinds.includes(i.kind))
        .reduce((n, p) => n + p.costPerCall, 0),
    run: (i, c): Promise<SearchMediaResult> =>
      searchMediaRun(i, {
        providers: c.config.mediaProviders,
        planId: c.planId,
        runtime: c.media,
        available: c.available,
        spend: (id, n) => c.spend?.(`media:${id}`, n),
        limiter: c.limiter,
        signal: c.signal,
      }),
  }),
  searchWeb: def({
    id: 'searchWeb',
    description: 'Searches the web (server only); results are untrusted data.',
    input: z.object({ query: z.string().min(1).max(200) }).strict(),
    cost: (_i, config) => config.director.web.costPerSearch,
    server: true,
    run: async (i, c): Promise<readonly WebResult[]> => {
      if (!c.web)
        throw new ToolError('not-available', 'Web search needs the server.');
      const rules = c.config.director.web;
      if (
        rules.costPerSearch > 0 &&
        (c.available?.() ?? Infinity) < rules.costPerSearch
      )
        throw new ToolError(
          'no-credits',
          'There are not enough credits for a web search.',
        );
      const out = await searchWebRun(
        i.query,
        rules,
        c.config.mediaProviders,
        c.web.rest,
        c.signal,
      );
      if (rules.costPerSearch > 0) c.spend?.('web:search', rules.costPerSearch);
      return out;
    },
  }),
  fetchPage: def({
    id: 'fetchPage',
    description: 'Reads one web page as plain, untrusted text (server only).',
    input: z.object({ url: z.string().min(8).max(2000) }).strict(),
    cost: (_i, config) => config.director.web.costPerPage,
    server: true,
    run: async (i, c): Promise<PageText> => {
      if (!c.web)
        throw new ToolError('not-available', 'Reading pages needs the server.');
      const rules = c.config.director.web;
      if (
        rules.costPerPage > 0 &&
        (c.available?.() ?? Infinity) < rules.costPerPage
      )
        throw new ToolError(
          'no-credits',
          'There are not enough credits to read a page.',
        );
      const page = await fetchPageRun(
        i.url,
        rules,
        c.web,
        c.pagesUsed?.() ?? 0,
        c.signal,
      );
      c.notePage?.();
      if (rules.costPerPage > 0) c.spend?.('web:page', rules.costPerPage);
      return page;
    },
  }),
  listLibrary: def({
    id: 'listLibrary',
    description: "Lists the person's media and library items matching words.",
    input: z.object({ query: z.string().max(200).default('') }).strict(),
    cost: () => 0,
    run: async (i, c): Promise<readonly LibraryEntry[]> =>
      (c.library?.(i.query) ?? []).slice(0, 50),
  }),
  validatePlan: def({
    id: 'validatePlan',
    description: 'Checks a plan: fields, ids and the layout.',
    input: z.object({ plan: z.unknown() }).strict(),
    cost: () => 0,
    run: async (i, c) => {
      const r = validatePlanV(i.plan);
      const layout: LayoutFinding[] = r.plan
        ? checkLayout(r.plan, c.config.director.layout)
        : [];
      const types = c.config.director.fieldLibrary.types.map((t) => t.id);
      const extra: string[] = [];
      const vt = r.plan?.meta.videoType;
      if (vt && !types.includes(vt))
        extra.push(
          `The video type "${vt}" is not set up; use one of ${types.join(', ')}.`,
        );
      const defs = r.plan?.defs?.blocks.length ?? 0;
      if (defs > c.config.director.authoring.maxDefs)
        extra.push(
          `A plan may define ${c.config.director.authoring.maxDefs} new graphics here.`,
        );
      let defErrors: string[] = [];
      if (r.plan?.defs?.blocks.length) {
        const { checkDefs } = await import('../video-plan/defs');
        defErrors = [...checkDefs(r.plan.defs.blocks).errors];
      }
      const errors = [
        ...r.errors,
        ...defErrors,
        ...extra,
        ...layout
          .filter((f) => f.level === 'error')
          .map((f) => `${f.text} ${f.fix}`),
      ];
      return {
        ok: errors.length === 0,
        errors,
        warnings: [
          ...r.warnings,
          ...layout
            .filter((f) => f.level === 'warning')
            .map((f) => `${f.text} ${f.fix}`),
        ],
      };
    },
  }),
  checkBlock: def({
    id: 'checkBlock',
    description: 'Compiles and checks one new graphic (Tier B or C).',
    input: z
      .object({
        id: z.string().min(2).max(48),
        tier: z.enum(['B', 'C']),
        source: z.string().min(1).max(32768),
        meta: z.record(z.unknown()).optional(),
      })
      .strict(),
    cost: () => 0,
    run: async (i) => {
      const { checkDef } = await import('../video-plan/defs');
      const r = checkDef(i);
      return {
        ok: r.ok,
        errors: r.errors,
        name: r.name,
        params: (r.params ?? []).map((p) => p.name),
        duration: r.duration,
      };
    },
  }),
  buildPlan: def({
    id: 'buildPlan',
    description: 'Builds a plan into a project (headless, deterministic).',
    input: z.object({ plan: z.unknown() }).strict(),
    cost: () => 0,
    run: async (i, c): Promise<unknown> => {
      if (!c.build)
        throw new ToolError(
          'not-available',
          'Building needs the editor services.',
        );
      return c.build(i.plan, c.signal);
    },
  }),
  renderFrames: def({
    id: 'renderFrames',
    description:
      'Small PNG frames of a built project at given times (the browser renders them).',
    input: z
      .object({
        project: z.unknown(),
        times: z.array(z.number().min(0).max(7200)).min(1).max(12),
        size: z.number().int().min(32).max(512).optional(),
      })
      .strict(),
    cost: () => 0,
    run: async (i, c) => {
      if (!c.renderFrames)
        throw new ToolError(
          'not-available',
          'Frames can only be drawn in the editor.',
        );
      return c.renderFrames(i.project, i.times, i.size);
    },
  }),
  registerBlock: def({
    id: 'registerBlock',
    description: "Saves a checked new graphic to the Project's graphics kit.",
    input: z
      .object({
        id: z.string().min(2).max(48),
        tier: z.enum(['B', 'C']),
        source: z.string().min(1).max(32768),
        meta: z.record(z.unknown()).optional(),
        summary: z.string().max(200).optional(),
      })
      .strict(),
    cost: () => 0,
    run: async (i, c) => {
      if (!c.kit)
        throw new ToolError('not-available', 'There is no Project kit here.');
      const { checkDef } = await import('../video-plan/defs');
      const r = checkDef(i);
      if (!r.ok) throw new ToolError('invalid-input', r.errors.join(' '));
      c.kit.add({
        id: r.id,
        name: r.name ?? r.id,
        tier: i.tier,
        params: (r.params ?? []).map((p) => p.name),
        summary: i.summary,
        item: r.item,
      });
      return { id: r.id, saved: true };
    },
  }),
} as const;
export type ToolId = keyof typeof TOOLS;
export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];
export type ToolOutput<K extends ToolId> = Awaited<
  ReturnType<(typeof TOOLS)[K]['run']>
>;
export type ToolOutcome<K extends ToolId = ToolId> =
  | { readonly ok: true; readonly tool: K; readonly output: ToolOutput<K> }
  | {
      readonly ok: false;
      readonly tool: string;
      readonly code: string;
      readonly error: string;
    };

/** Runs a tool by name: validates input, logs one usage row, never throws. */
export async function runTool<K extends ToolId>(
  id: K | string,
  raw: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome<K>> {
  const started = (ctx.now ?? Date.now)();
  const tool = (TOOLS as Record<string, ToolDef<z.ZodTypeAny, unknown>>)[id];
  const log = (
    outcome: 'ok' | 'failed' | 'refused',
    credits: number,
    code?: string,
  ) =>
    ctx.usage?.append({
      id: `tool-${started.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date(started).toISOString(),
      userId: ctx.userId,
      modelId: `tool:${id}`,
      role: 'tool',
      credits,
      ms: Math.max(0, (ctx.now ?? Date.now)() - started),
      outcome,
      ...(code ? { code } : {}),
    });
  if (!tool || !Object.hasOwn(TOOLS, id)) {
    log('refused', 0, 'unknown-tool');
    return {
      ok: false,
      tool: String(id),
      code: 'unknown-tool',
      error: `There is no tool called "${String(id).slice(0, 40)}".`,
    };
  }
  const parsed = tool.input.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    log('refused', 0, 'invalid-input');
    return {
      ok: false,
      tool: id,
      code: 'invalid-input',
      error: `The ${id} request is not valid: ${issue ? `${issue.path.join('.') || 'input'} ${issue.message.toLowerCase()}` : 'check its fields'}.`,
    };
  }
  let spent = 0;
  const inner: ToolContext = {
    ...ctx,
    spend: (source, n) => ((spent += n), ctx.spend?.(source, n)),
  };
  try {
    const output = await tool.run(parsed.data, inner);
    log('ok', spent);
    return { ok: true, tool: id as K, output: output as ToolOutput<K> };
  } catch (error) {
    const code = error instanceof ToolError ? error.code : 'failed';
    log(
      code === 'not-allowed' || code === 'no-credits' ? 'refused' : 'failed',
      spent,
      code,
    );
    return {
      ok: false,
      tool: id,
      code,
      error:
        error instanceof ToolError
          ? error.message
          : `The ${id} tool failed: ${(error as Error)?.message ?? 'unknown error'}.`,
    };
  }
}
