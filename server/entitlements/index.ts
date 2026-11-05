import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type {
  EntitlementService,
  Entitlements,
  EmergencySwitches,
  LimitAction,
  P3AdminSettings,
  SignedEntitlements,
} from '../../src/contracts/p3';
import { preCheck } from '../../src/gateway/checks';
import { CreditLedger } from '../../src/gateway/ledger';
import { GatewayError } from '../../src/gateway/types';
import type { PlatformConfig } from '../../src/platform-config';
import type { Store } from '../store';

export interface EntitlementDeps {
  store: Pick<
    Store,
    'profile' | 'ledger' | 'usage' | 'counter' | 'exportsCount' | 'bumpDaily'
  >;
  config(): Promise<PlatformConfig>;
  settings(): P3AdminSettings;
  secret(): string | undefined;
  userState(
    userId: string,
  ): Promise<{ flags: readonly string[]; suspended: boolean }>;
  emergency(): Promise<EmergencySwitches>;
  /** Deprecated: counting is now atomic in Store.bumpDaily. */
  chatMessagesToday?(userId: string): Promise<number>;
  now?: () => number;
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  throw new Error('The entitlement data is not valid.');
}
const payload = z
  .object({
    userId: z.string().min(1),
    planId: z.string().min(1),
    features: z.array(z.string()),
    limits: z.record(z.string(), z.number().finite()),
    flags: z.array(z.string()),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();
const denied = (code: string, message: string) => ({
  ok: false as const,
  failure: { code, message: { en: message } },
});

export function createEntitlementService(
  d: EntitlementDeps,
): EntitlementService {
  const now = d.now ?? Date.now;
  const sign = (data: Entitlements) => {
    const secret = d.secret();
    if (!secret) throw new Error('Entitlements are not configured.');
    return createHmac('sha256', secret)
      .update(canonicalJson(data))
      .digest('hex');
  };
  const person = async (userId: string) => {
    const [profile, config, state] = await Promise.all([
      d.store.profile(userId),
      d.config(),
      d.userState(userId),
    ]);
    const plan = profile && config.plans.find((p) => p.id === profile.plan);
    if (!profile || !plan)
      throw new Error('The account or its plan could not be found.');
    return {
      profile,
      config,
      plan,
      state: {
        ...state,
        suspended: state.suspended || (profile.suspended ?? false),
      },
    };
  };
  return {
    async resolve(userId) {
      const { plan, state } = await person(userId);
      const settings = d.settings(),
        issued = now();
      if (
        !Number.isFinite(settings.entitlementTtlSeconds) ||
        settings.entitlementTtlSeconds <= 0
      )
        throw new Error('The entitlement lifetime is not configured.');
      const entitlements: Entitlements = {
        userId,
        planId: plan.id,
        features: [...plan.features],
        // Null plan limits mean unlimited: omit them rather than invent a number.
        limits: Object.fromEntries(
          Object.entries({
            ...plan.limits,
            maxMessagesPerDay: settings.chat.maxMessagesPerDay,
            maxImagesPerMessage: settings.vision.maxImagesPerMessage,
            creditsPerImage: settings.vision.creditsPerImage,
          }).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number',
          ),
        ),
        flags: [
          ...new Set([
            ...state.flags,
            ...(state.suspended ? ['suspended'] : []),
          ]),
        ].sort(),
        issuedAt: new Date(issued).toISOString(),
        expiresAt: new Date(
          issued + settings.entitlementTtlSeconds * 1000,
        ).toISOString(),
      };
      return { entitlements, signature: sign(entitlements) };
    },
    verify(signed: SignedEntitlements, date = new Date(now())) {
      try {
        const data = payload.parse(signed.entitlements);
        if (
          !/^[a-f0-9]{64}$/.test(signed.signature) ||
          !Number.isFinite(date.getTime()) ||
          Date.parse(data.expiresAt) <= date.getTime() ||
          Date.parse(data.issuedAt) > date.getTime() ||
          Date.parse(data.expiresAt) <= Date.parse(data.issuedAt)
        )
          return null;
        const wanted = Buffer.from(sign(data), 'hex'),
          supplied = Buffer.from(signed.signature, 'hex');
        return wanted.length === supplied.length &&
          timingSafeEqual(wanted, supplied)
          ? data
          : null;
      } catch {
        return null;
      }
    },
    async check(userId, action: LimitAction, amount = 1) {
      if (!Number.isFinite(amount) || amount < 0)
        return denied(
          'invalid-amount',
          'The requested amount must be a non-negative number.',
        );
      const { profile, config, plan, state } = await person(userId);
      if (state.suspended || state.flags.includes('suspended'))
        return denied('suspended', 'This account is suspended.');
      const emergency = await d.emergency();
      if (action === 'ai-call' && emergency.aiOff)
        return {
          ok: false,
          failure: { code: 'ai-off', message: emergency.message },
        };
      const settings = d.settings(),
        stamp = new Date(now()),
        day = stamp.toISOString().slice(0, 10);
      if (action === 'chat-message') {
        if (!settings.chat.enabled)
          return denied('chat-off', 'Chat is switched off.');
        if (
          amount !== 1 ||
          (await d.store.bumpDaily(
            userId,
            'chat-message',
            day,
            settings.chat.maxMessagesPerDay,
          )) < 0
        )
          return denied(
            'chat-limit',
            'The daily chat message limit has been reached.',
          );
        return { ok: true };
      }
      if (action === 'attach' || action === 'vision') {
        if (!settings.vision.enabled)
          return denied('vision-off', 'Image attachments are switched off.');
        if (
          !Number.isInteger(amount) ||
          amount > settings.vision.maxImagesPerMessage
        )
          return denied(
            'attachment-limit',
            'There are too many images for one message.',
          );
        const ledger = new CreditLedger({
          read: () => rows,
          append: () => {
            throw new Error('Read-only ledger.');
          },
        });
        const rows = await d.store.ledger(userId);
        if (
          action === 'vision' &&
          amount * settings.vision.creditsPerImage > ledger.balance()
        )
          return denied(
            'shortage',
            'There are not enough credits to inspect these images.',
          );
        return { ok: true };
      }
      const [exportsThisMonth, storageMb, voiceClones, projects, rows, usage] =
        await Promise.all([
          d.store.exportsCount(userId, day.slice(0, 7)),
          d.store.counter(userId, 'storageMb'),
          d.store.counter(userId, 'voiceClones'),
          d.store.counter(userId, 'projects'),
          d.store.ledger(userId),
          d.store.usage(
            userId,
            new Date(
              Math.min(Date.parse(`${day}T00:00:00.000Z`), now() - 60_000),
            ).toISOString(),
          ),
        ]);
      const ledger = new CreditLedger({
        read: () => rows,
        append: () => {
          throw new Error('Read-only ledger.');
        },
      });
      if (
        action !== 'ai-call' &&
        action !== 'export' &&
        action !== 'store' &&
        action !== 'voice-clone' &&
        action !== 'project'
      )
        return denied('unknown-action', 'That action is not supported.');
      if (
        ['export', 'voice-clone', 'project'].includes(action) &&
        (!Number.isInteger(amount) || amount < 1)
      )
        return denied(
          'invalid-amount',
          'The requested count must be a positive integer.',
        );
      try {
        preCheck({
          config,
          plan,
          locale: profile.locale,
          ...(action !== 'ai-call' ? { action } : {}),
          ...(action === 'store' ? { addMb: amount } : {}),
          maxCredits: action === 'ai-call' ? amount : 0,
          usage: {
            exportsThisMonth:
              exportsThisMonth + (action === 'export' ? amount - 1 : 0),
            storageMb,
            voiceClones:
              voiceClones + (action === 'voice-clone' ? amount - 1 : 0),
            projects: projects + (action === 'project' ? amount - 1 : 0),
            creditsToday:
              action === 'ai-call'
                ? ledger.usedSince(`${day}T00:00:00.000Z`)
                : 0,
            callsLastMinute:
              action === 'ai-call'
                ? usage.filter(
                    (r) =>
                      Date.parse(r.at) > now() - 60_000 &&
                      Date.parse(r.at) <= now(),
                  ).length
                : 0,
          },
        });
        if (action === 'ai-call' && amount > ledger.balance())
          return denied(
            'shortage',
            'There are not enough credits for this request.',
          );
        return { ok: true };
      } catch (error) {
        if (error instanceof GatewayError)
          return denied(error.code, error.message);
        throw error;
      }
    },
  };
}
