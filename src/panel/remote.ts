// P2-R2 (P2B-08, P2B-22): the panel's view of the gateway. Two
// implementations with one interface: the in-browser mock gateway (offline
// demos, no VITE_GATEWAY_URL) and the server (VITE_GATEWAY_URL), which holds
// every key, reserves, settles and enforces the limits. The server never
// sends a key; the browser never needs one.
import {
  CreditLedger,
  GatewayError,
  memoryLedgerStore,
  type AdapterResult,
  type GatewayRequest,
  type LedgerEntry,
  type LimitUsage,
} from '../gateway';
import type { Plan } from '../platform-config';

export interface RunInput {
  readonly userId: string;
  /** Used by the in-browser gateway; the server reads the person's own plan. */
  readonly plan: Plan;
  readonly role: string;
  readonly modelId: string;
  readonly request: GatewayRequest;
  readonly maxCredits: number;
  readonly workCredits?: number;
  readonly key: string;
  readonly toolId?: string;
  readonly requires?: readonly string[];
  readonly action?: 'export' | 'store' | 'voice-clone' | 'project';
}
export interface JobInput {
  readonly userId: string;
  readonly plan: Plan;
  readonly role: string;
  readonly modelId: string;
  readonly maxCredits: number;
  readonly key: string;
  readonly videoCredits?: number;
  readonly tools?: readonly { id: string; maxCredits: number }[];
}
export interface JobLike {
  readonly reserved: number;
  call(
    role: string,
    modelId: string,
    request: GatewayRequest,
  ): Promise<AdapterResult>;
  finish(workCredits: number): number | Promise<number>;
  fail(): void | Promise<void>;
}
export interface ModelInfo {
  readonly id: string;
  readonly connected: boolean;
}
export interface PanelGateway {
  readonly remote: boolean;
  run(x: RunInput): Promise<{ result: AdapterResult; credits: number }>;
  startJob(x: JobInput): Promise<JobLike>;
  counts(userId: string): LimitUsage;
}

interface ApiError {
  error?: {
    code?: string;
    message?: string;
    detail?: Record<string, string | number>;
  };
}
/** One server, one signed-in person. */
export function remoteGateway(base: string, token: () => Promise<string>) {
  const root = base.replace(/\/$/, '');
  let rows: LedgerEntry[] = [];
  let usage: (LimitUsage & { limits?: unknown }) | null = null;
  let me: { plan: string; balance: number } | null = null;
  let models: ModelInfo[] = [];
  const api = async <T>(path: string, body?: unknown): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(`${root}/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${await token()}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new GatewayError(
        'provider-error',
        'The server could not be reached. Check your connection.',
      );
    }
    const json = (await res.json().catch(() => ({}))) as T & ApiError;
    if (!res.ok) {
      const e = json.error;
      throw new GatewayError(
        (e?.code as never) ?? 'provider-error',
        e?.message ?? 'The server had a problem.',
        e?.detail ?? {},
      );
    }
    return json;
  };
  const gateway: PanelGateway = {
    remote: true,
    async run(x) {
      const { userId: _u, plan: _p, ...rest } = x;
      return api('/run', rest);
    },
    async startJob(x) {
      const { userId: _u, plan: _p, ...rest } = x;
      const r = await api<{ jobId: string; reserved: number }>(
        '/reserve',
        rest,
      );
      return {
        reserved: r.reserved,
        call: async (role, modelId, request) =>
          (
            await api<{ result: AdapterResult }>('/call', {
              jobId: r.jobId,
              role,
              modelId,
              request,
            })
          ).result,
        finish: async (workCredits) =>
          (
            await api<{ credits: number }>('/settle', {
              jobId: r.jobId,
              workCredits,
            })
          ).credits,
        fail: async () =>
          void (await api('/settle', { jobId: r.jobId, fail: true }).catch(
            () => undefined,
          )),
      };
    },
    counts: () =>
      usage ?? {
        exportsThisMonth: 0,
        storageMb: 0,
        voiceClones: 0,
        projects: 0,
        callsLastMinute: 0,
        creditsToday: 0,
      },
  };
  return {
    gateway,
    api,
    /** Reads the person's plan, credits, usage and models again. */
    async sync() {
      const [m, l, u, md] = await Promise.all([
        api<{ plan: string; balance: number }>('/me'),
        api<{ rows: LedgerEntry[] }>('/ledger'),
        api<LimitUsage>('/usage'),
        api<{ models: ModelInfo[] }>('/models'),
      ]);
      me = m;
      rows = l.rows;
      usage = u;
      models = md.models;
    },
    /** A read-only ledger over the server's rows (balance and history). */
    ledger: () => {
      const store = memoryLedgerStore();
      store.append(rows);
      return new CreditLedger(store);
    },
    plan: () => me?.plan,
    models: () => models,
  };
}
export type RemoteGateway = ReturnType<typeof remoteGateway>;
