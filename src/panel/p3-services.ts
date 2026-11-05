// P3U + P3 integration: the one place the screens get the Part 2 services
// from. With a gateway server (ctx.s.remote) they are the REAL services
// (src/wiring over Part 1's engines, limits decided by the server); without
// one (offline panel, dev, e2e) they stay the mocks of src/contracts.
import type {
  DirectorService,
  EntitlementService,
  LimitAction,
  StudioEngine,
  StudioService,
} from '../contracts/p3';
import { createMockDirector } from '../contracts/p3-mocks';
import {
  createMockStudioEngine,
  createMockStudioService,
  type MockSavedRun,
} from '../contracts/p3-mock-studio';
import type { Ctx } from './app';
import type { Asset } from './services';

type Wiring = typeof import('../wiring');
interface Real {
  readonly director: DirectorService;
  readonly engine: StudioEngine;
  readonly studio: (save: (a: Asset) => void) => StudioService;
}

/** The server decides every limit; the browser only asks (POST /v1/entitlements/check). */
export function remoteEntitlements(
  api: <T>(path: string, body?: unknown) => Promise<T>,
): Pick<EntitlementService, 'check'> {
  return {
    async check(_userId: string, action: LimitAction, amount?: number) {
      try {
        return await api<Awaited<ReturnType<EntitlementService['check']>>>(
          '/entitlements/check',
          {
            action,
            ...(amount === undefined ? {} : { amount }),
          },
        );
      } catch (e) {
        // A server that cannot be reached must not let a limit pass.
        return {
          ok: false as const,
          failure: {
            code: 'unreachable',
            message: { en: (e as Error).message },
          },
        };
      }
    },
  };
}

let mockDirector: DirectorService | undefined;
const real = new Map<string, Promise<Real>>();

async function build(ctx: Ctx): Promise<Real> {
  const remote = ctx.s.remote!;
  const [w, mem, st, sb, ms] = await Promise.all([
    import('../wiring') as Promise<Wiring>,
    import('../memory'),
    import('../studio-engine'),
    import('../storage-backends'),
    import('../media/store'),
  ]);
  const userId = () => ctx.user.id;
  const config = () => ctx.s.config;
  const plan = () => ctx.s.planOf(ctx.user.id);
  const store = w.createWiringStore({
    backend: w.indexedDbBackend(),
    owner: userId,
    config,
    planId: () => plan().id,
  });
  const entitlements = remoteEntitlements(remote.api);
  const media = await ms.openMediaStore();
  const storage = sb.createStorageBackend(media ? 'local' : 'platform', {
    limitBytes: () => {
      const mb = plan().limits.storageMb;
      return typeof mb === 'number' ? mb * 1048576 : null;
    },
    cloud: ctx.s.account,
    ...(media ? { media } : {}),
  });
  const files = w.createAttachments({
    config,
    userId,
    store,
    media: storage,
    entitlements,
  });
  const director = w.createDirectorService({
    config,
    userId,
    plan,
    locale: () => ctx.prefs().locale,
    store,
    memory: mem.createMemoryEngine(),
    entitlements,
    gateway: ctx.s.gateway,
    files,
  });
  const engine = st.createStudioEngine();
  return {
    director,
    engine,
    studio: (save) =>
      w.createStudioService({
        config,
        userId,
        plan,
        engine,
        gateway: ctx.s.gateway,
        connected: (id) => ctx.s.connected(id),
        entitlements,
        saveAsset: save,
      }),
  };
}
const realFor = (ctx: Ctx): Promise<Real> => {
  const key = ctx.user.id;
  let r = real.get(key);
  if (!r) {
    r = build(ctx);
    // A failed build is tried again next time, not kept.
    r.catch(() => real.delete(key));
    real.set(key, r);
  }
  return r;
};

export async function directorService(ctx: Ctx): Promise<DirectorService> {
  if (ctx.s.remote) return (await realFor(ctx)).director;
  // Dev and e2e only: a test can fix the token delay to keep runs fast.
  const delay = import.meta.env.DEV
    ? (window as { __AIVE_E2E_DIRECTOR_DELAY__?: number })
        .__AIVE_E2E_DIRECTOR_DELAY__
    : undefined;
  mockDirector ??= createMockDirector(
    delay === undefined ? {} : { tokenDelay: delay },
  );
  return mockDirector;
}

/** The Studio fields engine the forms are drawn with. */
export async function studioEngine(ctx: Ctx): Promise<StudioEngine> {
  return ctx.s.remote ? (await realFor(ctx)).engine : createMockStudioEngine();
}

/**
 * The model-driven Studio service. Real with a server; offline only a dev or
 * e2e page can switch the mock on (`__AIVE_P3_STUDIO__`); otherwise null and
 * the screens keep the config-driven form.
 */
export async function studioService(
  ctx: Ctx,
  save: (run: MockSavedRun) => string,
): Promise<StudioService | null> {
  if (ctx.s.remote)
    return (await realFor(ctx)).studio((a) => void ctx.s.saveAsset(a));
  const w = window as { __AIVE_P3_STUDIO__?: boolean };
  if (!import.meta.env.DEV || !w.__AIVE_P3_STUDIO__) return null;
  return createMockStudioService({ save, stepMs: 40 });
}
