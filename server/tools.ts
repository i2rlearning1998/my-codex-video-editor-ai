// ROUND-C1 C1.1 and C1.4: the shared tools on the server. Keys come from
// the vault (an env view), every fetch goes through the network guard with
// real DNS, the person's plan and credits are decided here, and each call
// is one row in the usage log. The browser never sees a key or a provider
// host: it sends the tool's name and input.
import { lookup } from 'node:dns/promises';
import { RateLimiter, restRunner, type RestRunner } from '../src/tools/media';
import type { HttpFetch, Resolver } from '../src/tools/net-guard';
import { speechRunner } from '../src/tools/speech';
import { runTool, TOOLS, type ToolId, type ToolOutcome } from '../src/tools';
import type { PlatformConfig, Plan } from '../src/platform-config';
import type { UsageLog } from '../src/gateway/usage';

/** Tools the server runs; the others need the editor (frames, the build). */
export const SERVER_TOOLS: readonly ToolId[] = [
  'getCapabilities',
  'searchMedia',
  'searchWeb',
  'fetchPage',
  'validatePlan',
  'checkBlock',
  // ROUND-C1 F4: voices and captions of providers the owner adds.
  'speak',
  'transcribe',
];
export interface ServerToolDeps {
  readonly env: () => Readonly<Record<string, string | undefined>>;
  readonly fetch?: HttpFetch | undefined;
  readonly resolve?: Resolver | undefined;
  readonly usage: UsageLog;
  readonly now: () => number;
}
export const realResolve: Resolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
export function createServerTools(d: ServerToolDeps) {
  const limiter = new RateLimiter(d.now);
  const pages = new Map<string, number>();
  const fetch_: HttpFetch =
    d.fetch ?? ((url, init) => fetch(url, init as RequestInit));
  const resolve = d.resolve ?? realResolve;
  const rest: RestRunner = restRunner({
    fetch: fetch_,
    resolve,
    key: (ref) => d.env()[ref],
  });
  const speech = speechRunner({
    fetch: fetch_,
    resolve,
    key: (ref) => d.env()[ref],
  });
  return {
    async run(x: {
      readonly tool: string;
      readonly input: unknown;
      readonly videoId: string;
      readonly userId: string;
      readonly config: PlatformConfig;
      readonly plan: Plan;
      /** Credits the person has now (the ledger's balance). */
      readonly balance: number;
      /** Records what a successful call spent (one ledger row). */
      readonly charge: (credits: number, note: string) => void;
    }): Promise<ToolOutcome> {
      if (!(SERVER_TOOLS as readonly string[]).includes(x.tool))
        return {
          ok: false,
          tool: x.tool,
          code: Object.hasOwn(TOOLS, x.tool) ? 'not-available' : 'unknown-tool',
          error: Object.hasOwn(TOOLS, x.tool)
            ? `The ${x.tool} tool runs in the editor, not on the server.`
            : `There is no tool called "${x.tool.slice(0, 40)}".`,
        };
      const pageKey = `${x.userId}:${x.videoId}`;
      let left = x.balance;
      const spent: { source: string; credits: number }[] = [];
      const out = await runTool(x.tool, x.input, {
        config: x.config,
        planId: x.plan.id,
        userId: x.userId,
        usage: d.usage,
        now: d.now,
        media: { builtin: {}, rest },
        limiter,
        web: { fetch: fetch_, resolve, rest },
        speech,
        pagesUsed: () => pages.get(pageKey) ?? 0,
        notePage: () => pages.set(pageKey, (pages.get(pageKey) ?? 0) + 1),
        available: () => left,
        spend: (source, n) => {
          left -= n;
          spent.push({ source, credits: n });
        },
      });
      // Only what succeeded is charged (a failed provider call spends nothing).
      for (const s of spent)
        if (s.credits > 0) x.charge(s.credits, `tool ${s.source}`);
      return out;
    },
  };
}
