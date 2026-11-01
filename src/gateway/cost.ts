// P2-11: credits from a workload. Two parts, both from config:
//  - work credits: the owner's cost table (a scene made this way, a minute of
//    voice), min to max;
//  - model credits: the provider's USD price for the tokens or media units,
//    times the model's margin, times `creditRate`, rounded up.
import {
  costById,
  type Model,
  type PlatformConfig,
  type Studio,
} from '../platform-config';
import { emptyUsage, type Usage } from './types';

export interface Range {
  min: number;
  max: number;
}
export function usdOf(model: Model, u: Usage): number {
  const p = model.price;
  return (
    (u.inputTokens / 1e6) * p.inputPerMTok +
    (u.outputTokens / 1e6) * p.outputPerMTok +
    u.images * p.perImage +
    u.seconds * p.perSecond +
    u.minutes * p.perMinute
  );
}
export const creditsOfUsd = (
  c: PlatformConfig,
  model: Model,
  usd: number,
): number => Math.ceil(usd * model.creditMargin * c.creditRate - 1e-9);
export const creditsOf = (c: PlatformConfig, model: Model, u: Usage) =>
  creditsOfUsd(c, model, usdOf(model, u));

const workRange = (
  c: PlatformConfig,
  costId: string | undefined,
  qty: number,
): Range => {
  const x = costId ? costById(c, costId) : undefined;
  return x ? { min: x.min * qty, max: x.max * qty } : { min: 0, max: 0 };
};

export interface SceneEstimate extends Range {
  readonly index: number;
  readonly method: string;
}
export interface DirectorEstimate extends Range {
  readonly scenes: readonly SceneEstimate[];
  /** The model part of the total (already spread over the scenes). */
  readonly model: Range;
}
/**
 * A video: the model plans and writes every scene, and each scene costs what
 * its method costs. The model part is spread evenly so per-scene numbers add
 * up to the total.
 */
export function estimateDirector(
  c: PlatformConfig,
  model: Model,
  w: { briefChars: number; methods: readonly string[] },
): DirectorEstimate {
  const e = c.director.estimate;
  const n = Math.max(1, w.methods.length);
  const tok = (end: 'min' | 'max'): Usage => ({
    ...emptyUsage(),
    inputTokens:
      e.systemTokens +
      Math.ceil(w.briefChars / 4) +
      n * e.inputTokensPerScene[end],
    outputTokens: n * e.outputTokensPerScene[end],
  });
  const modelRange = {
    min: creditsOf(c, model, tok('min')),
    max: creditsOf(c, model, tok('max')),
  };
  const share = (v: number, i: number) =>
    Math.floor(v / n) + (i < v % n ? 1 : 0);
  const scenes = w.methods.map((method, index) => {
    const tool = c.director.tools.find((t) => t.id === method);
    const work = workRange(c, tool?.costId, 1);
    return {
      index,
      method,
      min: work.min + share(modelRange.min, index),
      max: work.max + share(modelRange.max, index),
    };
  });
  return {
    scenes,
    model: modelRange,
    min: scenes.reduce((s, x) => s + x.min, 0),
    max: scenes.reduce((s, x) => s + x.max, 0),
  };
}

/** The units of a studio run from its answers (characters, a count, or fixed). */
export function studioUnits(
  s: Studio,
  answers: Record<string, unknown>,
): { units: number; chars: number } {
  const w = s.workload;
  const textV = w.textField ? answers[w.textField] : undefined;
  const chars = typeof textV === 'string' ? textV.length : 0;
  const countV = w.countField ? Number(answers[w.countField]) : NaN;
  const units =
    w.countField && Number.isFinite(countV) && countV > 0 ? countV : w.units;
  return { units, chars };
}
/** One studio run: the work cost for its units plus the model's price. */
export function estimateStudio(
  c: PlatformConfig,
  s: Studio,
  model: Model,
  answers: Record<string, unknown>,
): Range & { units: number } {
  const { units, chars } = studioUnits(s, answers);
  const work = workRange(c, s.costId, units);
  const u = emptyUsage();
  if (model.kind === 'text') {
    u.inputTokens = 500 + Math.ceil(chars / 4);
    u.outputTokens = 800;
  } else if (model.price.perImage) u.images = units;
  else if (model.price.perSecond) u.seconds = units * 8;
  else
    u.minutes = model.kind === 'voice' ? Math.max(units, chars / 900) : units;
  const m = creditsOf(c, model, u);
  return { min: work.min + m, max: work.max + m, units };
}
