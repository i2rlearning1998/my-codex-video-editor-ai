// P3-WIRING (W5): the Studio service the UI talks to (StudioService). The form
// comes from the CHOSEN model's params through Part 1's StudioEngine (injected);
// the run reserves, calls the model through the gateway with the assembled
// prompt and parameters, settles, and saves the result to the Asset Library.
// Any failure gives the hold back (the gateway does it).
import type {
  AssembledRequest,
  EntitlementService,
  FormSpec,
  FormValues,
  P3Failure,
  ParamDecl,
  Result,
  StudioEngine,
  StudioService,
} from '../contracts/p3';
import { creditsOf } from '../gateway/cost';
import {
  emptyUsage,
  GatewayError,
  type AdapterResult,
  type GatewayRequest,
} from '../gateway/types';
import type { RunInput, RunResult } from '../gateway/gateway';
import type { Asset } from '../panel/services';
import {
  canUse,
  costOf,
  defaultModelFor,
  modelById,
  modelsForRole,
  studioById,
  type Model,
  type Plan,
  type PlatformConfig,
  type Studio,
} from '../platform-config';
import { fill } from '../director';
import { extractJson } from '../director';
import { failure, failureOf } from './errors';
import { p3t } from './director-service';
import { paramsRequest } from './vision';

/** What a Studio run needs from the gateway's answer. */
export type StudioRun = Pick<RunResult, 'result' | 'credits'>;
export interface StudioDeps {
  readonly config: () => PlatformConfig;
  readonly userId: () => string | null;
  readonly plan: () => Plan;
  readonly engine: StudioEngine;
  // P3-INTEGRATION: the panel's server gateway answers without a reservation id.
  readonly gateway: { run(x: RunInput): Promise<StudioRun> };
  /** Whether a model can be called now (its provider's key is present). */
  readonly connected: (modelId: string) => boolean;
  readonly entitlements?: Pick<EntitlementService, 'check'>;
  /** The Asset Library's save (the panel's existing `saveAsset`). */
  readonly saveAsset: (a: Asset) => void | Promise<void>;
  readonly now?: () => Date;
  readonly newId?: (prefix: string) => string;
}

/** Megabytes a result of this kind will store (the storage limit). */
const STORE_MB: Record<Studio['output'], number> = {
  video: 20,
  image: 2,
  audio: 2,
  text: 0.01,
  captions: 0.01,
  pack: 0.01,
};
const TEXT_TYPES = new Set(['text', 'longtext']);
const ENHANCE_ROLES = new Set(['prompt', 'prompt-part', 'negative']);

/** Fields Enhance may rewrite: text fields that feed the prompt. */
export const enhanceable = (form: FormSpec): ParamDecl[] =>
  [...form.basic, ...form.advanced].filter(
    (p) => TEXT_TYPES.has(p.type) && ENHANCE_ROLES.has(p.role),
  );

export function createStudioService(d: StudioDeps): StudioService {
  const now = () => (d.now ?? (() => new Date()))();
  let n = 0;
  const newId =
    d.newId ??
    ((p: string) =>
      `${p}-${now().getTime().toString(36)}-${(++n).toString(36)}`);
  const pick = (
    studioId: string,
    modelId: string,
  ): { c: PlatformConfig; studio: Studio; model: Model } | P3Failure => {
    const c = d.config();
    const studio = studioById(c, studioId);
    if (!studio || !studio.enabled)
      return failure('studio-unknown', { en: 'That studio is not available.' });
    const model = modelById(c, modelId);
    if (!model || !model.enabled || !model.roles.includes(studio.role))
      return failure('model-unknown', {
        en: 'That model cannot be used in this studio.',
      });
    if (!canUse(d.plan(), model.requires))
      return failure(
        'model-plan',
        { en: 'Your plan does not include this model.' },
        '/credits',
      );
    return { c, studio, model };
  };
  /** A connected real text model first (recommended first), else the default. */
  const enhanceModel = (c: PlatformConfig): Model | null => {
    const role = c.director.roles.write;
    const real = modelsForRole(c, role)
      .filter(
        (m) =>
          m.providerId !== 'mock' &&
          canUse(d.plan(), m.requires) &&
          d.connected(m.id),
      )
      .sort(
        (a, b) =>
          Number(b.recommendedForDirector) - Number(a.recommendedForDirector),
      );
    return real[0] ?? defaultModelFor(c, d.plan(), role) ?? null;
  };
  // Until the owner defines a model's fields (Autodraft screenshots), the form
  // is one required prompt, so a Studio run is never a blank page.
  const FALLBACK: ParamDecl[] = [
    {
      id: 'prompt',
      type: 'longtext',
      role: 'prompt',
      label: { en: 'What should it make?', hi: 'क्या बनाना है?' },
      required: true,
      default: '',
      group: 'basic',
      order: 1,
    } as ParamDecl,
  ];
  const formFor = (studio: Studio, model: Model, c: PlatformConfig) =>
    d.engine.buildForm(
      model.params.length ? model.params : FALLBACK,
      { modelId: model.id, studioId: studio.id },
      !!enhanceModel(c) && !!c.director.prompts?.enhance,
    );
  /** Work (the owner's cost table) plus the model's price for these units. */
  const range = (
    c: PlatformConfig,
    studio: Studio,
    model: Model,
    a: AssembledRequest,
  ) => {
    const units = Math.max(1, a.units);
    const u = emptyUsage();
    if (model.kind === 'text') {
      u.inputTokens = 500 + Math.ceil(a.prompt.length / 3);
      u.outputTokens = 1200;
    } else if (model.price.perImage) u.images = units;
    else if (model.price.perSecond) u.seconds = units;
    else u.minutes = units;
    const m = creditsOf(c, model, u);
    const work = studio.costId
      ? {
          min: costOf(c, studio.costId, units, 'min'),
          max: costOf(c, studio.costId, units, 'max'),
        }
      : { min: 0, max: 0 };
    return { min: work.min + m, max: work.max + m, work: work.min, units };
  };
  const request = (model: Model, a: AssembledRequest): GatewayRequest => {
    const prompt = a.negativePrompt
      ? `${a.prompt}\nAvoid: ${a.negativePrompt}`
      : a.prompt;
    return paramsRequest(
      model.kind === 'text'
        ? {
            messages: [{ role: 'user', content: prompt }],
            maxOutputTokens: 1200,
          }
        : { messages: [], prompt, units: Math.max(1, a.units) },
      a.params,
    );
  };

  return {
    async form(studioId, modelId) {
      const p = pick(studioId, modelId);
      if ('code' in p) throw new Error(p.message.en);
      return formFor(p.studio, p.model, p.c);
    },
    async models(studioId) {
      const c = d.config();
      const studio = studioById(c, studioId);
      if (!studio) return [];
      // A real model is listed (and so chosen by default) before the offline one.
      const ordered = [...modelsForRole(c, studio.role)].sort(
        (a, b) =>
          Number(b.providerId !== 'mock' && d.connected(b.id)) -
          Number(a.providerId !== 'mock' && d.connected(a.id)),
      );
      return ordered.map((m) => ({
        id: m.id,
        name: p3t(m.name),
        tier: m.tier,
        connected: d.connected(m.id),
        locked: !canUse(d.plan(), m.requires),
      }));
    },
    preview: (form: FormSpec, values: FormValues) =>
      d.engine.assemble(form, values),
    async estimate(studioId, modelId, values) {
      const p = pick(studioId, modelId);
      if ('code' in p) return { min: 0, max: 0 };
      const form = formFor(p.studio, p.model, p.c);
      const r = range(p.c, p.studio, p.model, d.engine.assemble(form, values));
      return { min: r.min, max: r.max };
    },
    async enhance(studioId, modelId, values): Promise<Result<FormValues>> {
      const p = pick(studioId, modelId);
      if ('code' in p) return { ok: false, failure: p };
      const userId = d.userId();
      if (!userId)
        return {
          ok: false,
          failure: failure('signed-out', { en: 'Please sign in first.' }),
        };
      const tpl = p.c.director.prompts?.enhance;
      const model = enhanceModel(p.c);
      const form = formFor(p.studio, p.model, p.c);
      const fields = enhanceable(form);
      if (!tpl || !model || !fields.length)
        return {
          ok: false,
          failure: failure('enhance-off', {
            en: 'Director cannot improve this form.',
          }),
        };
      const current = Object.fromEntries(
        fields.map((f) => [f.id, String(values[f.id] ?? '')]),
      );
      const system = fill(tpl, {
        fields: fields.map((f) => `${f.id} (${f.label.en})`).join(', '),
        values: JSON.stringify(current),
      });
      const maxCredits = creditsOf(p.c, model, {
        ...emptyUsage(),
        inputTokens: Math.ceil(system.length / 3) + 200,
        outputTokens: 1200,
      });
      try {
        const r = await d.gateway.run({
          userId,
          plan: d.plan(),
          role: p.c.director.roles.write,
          modelId: model.id,
          request: {
            system,
            messages: [{ role: 'user', content: 'Improve the fields.' }],
            json: true,
            maxOutputTokens: 1200,
          },
          maxCredits: Math.max(1, maxCredits),
          key: `enhance:${studioId}:${newId('k')}`,
          accept: (res: AdapterResult) => {
            try {
              const v = (extractJson(res.text ?? '') as { values?: unknown })
                ?.values;
              return v && typeof v === 'object'
                ? null
                : 'The improved text could not be read.';
            } catch {
              return 'The improved text could not be read.';
            }
          },
        });
        const raw = (
          extractJson(r.result.text ?? '') as {
            values: Record<string, unknown>;
          }
        ).values;
        // Only enhanceable text fields change; every choice stays as it was.
        const next: Record<string, FormValues[string]> = { ...values };
        for (const f of fields) {
          const v = raw[f.id];
          if (typeof v === 'string' && v.trim())
            next[f.id] = v.trim().slice(0, 4000);
        }
        return { ok: true, value: next };
      } catch (e) {
        return {
          ok: false,
          failure: failureOf(e, { en: 'Director could not improve the text.' }),
        };
      }
    },
    async *run(studioId, modelId, values, projectId) {
      const p = pick(studioId, modelId);
      if ('code' in p) {
        yield { type: 'failure', failure: p };
        return;
      }
      const userId = d.userId();
      if (!userId) {
        yield {
          type: 'failure',
          failure: failure('signed-out', { en: 'Please sign in first.' }),
        };
        return;
      }
      const form = formFor(p.studio, p.model, p.c);
      const valid = d.engine.validate(form, values);
      if (!valid.ok) {
        const first = Object.values(valid.errors)[0];
        yield {
          type: 'failure',
          failure: failure(
            'form',
            first ?? { en: 'Some fields need a value.' },
          ),
        };
        return;
      }
      if (d.entitlements) {
        const e = await d.entitlements.check(userId, 'ai-call', 1);
        if (!e.ok) {
          yield { type: 'failure', failure: e.failure };
          return;
        }
      }
      const a = d.engine.assemble(form, values);
      const r = range(p.c, p.studio, p.model, a);
      yield { type: 'progress', pct: 5 };
      let res: StudioRun;
      try {
        res = await d.gateway.run({
          userId,
          plan: d.plan(),
          role: p.studio.role,
          modelId: p.model.id,
          request: request(p.model, a),
          workCredits: r.work,
          maxCredits: Math.max(1, r.max),
          key: `studio:${studioId}:${newId('k')}`,
          requires: p.studio.requires,
          action: 'store',
          addMb: STORE_MB[p.studio.output],
          accept: (x) =>
            p.model.kind === 'text'
              ? x.text?.trim()
                ? null
                : 'The model sent no text.'
              : x.media?.base64 || x.media?.url
                ? null
                : 'The model sent no file.',
        });
      } catch (e) {
        yield {
          type: 'failure',
          failure:
            e instanceof GatewayError
              ? failure(
                  e.code,
                  { en: e.message },
                  e.detail.upgrade ? '/credits' : undefined,
                )
              : failureOf(e, { en: 'The studio could not finish.' }),
        };
        return;
      }
      yield { type: 'progress', pct: 90 };
      const media = res.result.media;
      const assetId = newId('asset');
      const dataUrl =
        media?.base64 && media.mime
          ? `data:${media.mime};base64,${media.base64}`
          : media?.base64
            ? `data:application/octet-stream;base64,${media.base64}`
            : undefined;
      await d.saveAsset({
        id: assetId,
        userId,
        projectId: projectId ?? '',
        kind: p.studio.output,
        name:
          (a.prompt.split('\n')[0] ?? p.studio.id).slice(0, 80) || p.studio.id,
        studioId,
        ...(res.result.text ? { text: res.result.text } : {}),
        ...(dataUrl
          ? { dataUrl }
          : media?.url && /^(https?:|data:)/.test(media.url)
            ? { dataUrl: media.url }
            : {}),
        bytes: media?.base64
          ? Math.floor((media.base64.length * 3) / 4)
          : (res.result.text?.length ?? 0),
        createdAt: now().toISOString(),
      });
      yield { type: 'progress', pct: 100 };
      yield { type: 'result', assetId };
    },
  };
}
