// P2-R2 (P2B-16, P2B-19, P2B-20): the planning model. The prompt is built
// only from the Platform Config (director.prompts, the Style's playbook, the
// rulebook's methods and limits) and the capability sheet made from code.
// Its answer is validated with the editor's own plan validator plus the
// rulebook's limits; one repair call gets the exact errors; a second failure
// is refused with the owner's text and charges nothing (the job's whole hold
// is given back). With a mock model the free deterministic planner is used.
import {
  buildBrief,
  costById,
  text as say,
  type Answers,
  type Locale,
  type Model,
  type Plan,
  type PlatformConfig,
  type Style,
} from '../platform-config';
import { creditsOf } from '../gateway/cost';
import {
  emptyUsage,
  type AdapterResult,
  type GatewayRequest,
} from '../gateway/types';
import { validatePlan, type VideoPlan } from '../video-plan';
import { capabilitySheet } from './capabilities';
import { allowedMethods } from './methods';
import {
  methodOf,
  mockPlanner,
  SCENE_SOURCES,
  sceneFor,
  writtenSource,
} from './planner';
import type { JobInput, JobLike } from '../panel/remote';

/** Fills {{name}} with the value; unknown names become empty. */
export const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : '',
  );

export interface Upgrade {
  readonly id: string;
  readonly title: string;
  readonly why: string;
  readonly addScene?: { at: number; scene: VideoPlan['scenes'][number] };
  readonly replaceScene?: { index: number; scene: VideoPlan['scenes'][number] };
}

export interface PlanContext {
  readonly config: PlatformConfig;
  readonly style: Style;
  readonly answers: Answers;
  readonly notes: readonly string[];
  readonly plan: Plan;
  readonly locale: Locale;
}

/** The plan prompt (system) and the brief (user message). */
export function planPrompt(x: PlanContext): { system: string; user: string } {
  const c = x.config;
  const p = c.director.prompts;
  if (!p) throw new Error('The Director has no prompts in the config.');
  const sheet = capabilitySheet();
  const lim = c.director.limits;
  const up =
    x.style.interview.creativeUpgrade && c.director.creativeUpgrade?.enabled;
  const language =
    x.answers.captionLang === 'hi' || x.locale === 'hi' ? 'Hindi' : 'English';
  const system = fill(p.plan, {
    persona: say(c.director.persona) || 'a video director.',
    style: `${say(x.style.name)}: ${say(x.style.blurb)}`,
    playbook: x.style.playbookText || x.style.playbook,
    language,
    maxScenes: lim.maxScenes,
    maxSceneSeconds: lim.maxSceneSeconds,
    maxNarrationChars: lim.maxNarrationChars,
    methods: allowedMethods(c, x.plan).join(', '),
    upgradeRule: fill(up ? p.upgradeOn : p.upgradeOff, {
      upgradeHint: c.director.creativeUpgrade
        ? say(c.director.creativeUpgrade.text)
        : '',
    }),
    sheetVersion: sheet.version,
    capabilities: sheet.text,
  });
  const brief = buildBrief(x.style, x.answers);
  const user = JSON.stringify({
    brief,
    notes: x.notes,
  });
  return { system, user };
}

/** The first JSON object in a model's text (fences and prose ignored). */
export function extractJson(text: string): unknown {
  const t = text.trim();
  if (!t) throw new Error('The answer was empty.');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  const body = fenced ? fenced[1]! : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The answer is not JSON.');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new Error('The answer is not valid JSON.');
  }
}

export type ModelPlanCheck =
  | {
      ok: true;
      plan: VideoPlan;
      upgrades: Upgrade[];
      warnings: string[];
    }
  | { ok: false; errors: string[] };

const UP_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
/** Applies one upgrade (the plan stays unchanged when it does not fit). */
export function applyUpgrade(v: VideoPlan, u: Upgrade): VideoPlan {
  const scenes = v.scenes.slice();
  if (u.addScene) {
    const at = Math.max(0, Math.min(scenes.length, Math.round(u.addScene.at)));
    let id = u.addScene.scene.id;
    while (scenes.some((s) => s.id === id)) id = `${id}-up`;
    scenes.splice(at, 0, { ...u.addScene.scene, id });
  } else if (u.replaceScene && scenes[u.replaceScene.index]) {
    scenes[u.replaceScene.index] = {
      ...u.replaceScene.scene,
      id: scenes[u.replaceScene.index]!.id,
    };
  }
  return { ...v, scenes };
}

/** The rulebook's own checks on top of the editor's validator. */
function ruleErrors(c: PlatformConfig, plan: Plan, v: VideoPlan): string[] {
  const lim = c.director.limits;
  const allowed = new Set(allowedMethods(c, plan));
  const out: string[] = [];
  if (v.scenes.length > lim.maxScenes)
    out.push(
      `The plan has ${v.scenes.length} scenes; at most ${lim.maxScenes} are allowed.`,
    );
  v.scenes.forEach((s, i) => {
    const at = `Scene ${i + 1} ("${s.id}")`;
    if ((s.durationHint ?? 0) > lim.maxSceneSeconds)
      out.push(
        `${at} lasts ${s.durationHint} s; at most ${lim.maxSceneSeconds} s.`,
      );
    if ((s.narration ?? '').length > lim.maxNarrationChars)
      out.push(
        `${at} has ${(s.narration ?? '').length} characters of narration; at most ${lim.maxNarrationChars}.`,
      );
    if (!s.notes?.startsWith('method:'))
      out.push(`${at} has no "notes": "method:<id>".`);
    else if (!allowed.has(methodOf(s)))
      out.push(
        `${at} uses method "${methodOf(s)}", which is not one of: ${[...allowed].join(', ')}.`,
      );
    const src = writtenSource(s);
    if (src !== null && !(SCENE_SOURCES as readonly string[]).includes(src))
      out.push(
        `${at} has source "${src}", which is not one of: ${SCENE_SOURCES.join(', ')}.`,
      );
  });
  return out;
}

/** Validates a model answer: the plan, the rulebook, then each upgrade. */
export function checkModelPlan(
  c: PlatformConfig,
  plan: Plan,
  raw: unknown,
): ModelPlanCheck {
  if (!raw || typeof raw !== 'object')
    return { ok: false, errors: ['The answer is not a JSON object.'] };
  const r = raw as { plan?: unknown; upgrades?: unknown };
  if (r.plan === undefined)
    return { ok: false, errors: ['The answer has no "plan".'] };
  const v = validatePlan(r.plan);
  if (!v.ok || !v.plan) return { ok: false, errors: [...v.errors] };
  const rules = ruleErrors(c, plan, v.plan);
  if (rules.length) return { ok: false, errors: rules };
  const upgrades: Upgrade[] = [];
  const warnings: string[] = [...v.warnings];
  for (const u of Array.isArray(r.upgrades) ? r.upgrades.slice(0, 3) : []) {
    const x = u as Partial<Upgrade>;
    if (
      !x ||
      typeof x.id !== 'string' ||
      !UP_ID.test(x.id) ||
      typeof x.title !== 'string' ||
      !(x.addScene || x.replaceScene)
    ) {
      warnings.push('An upgrade was left out: it is not in the right shape.');
      continue;
    }
    const up: Upgrade = {
      id: x.id,
      title: x.title.slice(0, 80),
      why: String(x.why ?? '').slice(0, 200),
      ...(x.addScene ? { addScene: x.addScene } : {}),
      ...(x.replaceScene ? { replaceScene: x.replaceScene } : {}),
    };
    const after = validatePlan(applyUpgrade(v.plan, up));
    if (!after.ok || !after.plan || ruleErrors(c, plan, after.plan).length) {
      warnings.push(
        `The upgrade "${up.title}" was left out: it breaks a rule.`,
      );
      continue;
    }
    upgrades.push(up);
  }
  return { ok: true, plan: v.plan, upgrades, warnings };
}

/** The credit change of an upgrade (most credits of the scenes it adds or swaps). */
export function upgradeCredits(
  c: PlatformConfig,
  v: VideoPlan,
  u: Upgrade,
): number {
  const most = (m: string) => {
    const tool = c.director.tools.find((t) => t.id === m);
    const cost = tool?.costId ? costById(c, tool.costId) : undefined;
    return cost?.max ?? 0;
  };
  if (u.addScene) return most(methodOf(u.addScene.scene));
  if (u.replaceScene) {
    const old = v.scenes[u.replaceScene.index];
    return (
      most(methodOf(u.replaceScene.scene)) - (old ? most(methodOf(old)) : 0)
    );
  }
  return 0;
}

/** The most a planning call (and one repair) can cost with this model. */
export function planningMax(
  c: PlatformConfig,
  model: Model,
  promptChars: number,
): number {
  const out = c.director.limits.planOutputTokens;
  const one = {
    ...emptyUsage(),
    inputTokens: Math.ceil(promptChars / 3),
    outputTokens: out,
  };
  const repair = {
    ...emptyUsage(),
    inputTokens: Math.ceil(promptChars / 3) + out + 2000,
    outputTokens: out,
  };
  return creditsOf(c, model, one) + creditsOf(c, model, repair);
}

export type LlmPlanResult =
  | {
      ok: true;
      plan: VideoPlan;
      upgrades: Upgrade[];
      warnings: string[];
      repaired: boolean;
      credits: number;
    }
  | { ok: false; message: string; errors: string[]; credits: 0 };

export interface LlmPlanInput extends PlanContext {
  readonly gateway: { startJob(x: JobInput): JobLike | Promise<JobLike> };
  readonly userId: string;
  readonly modelId: string;
  readonly key: string;
}

/** The owner's refusal text for a plan that could not be made. */
export function badPlanText(c: PlatformConfig, locale: Locale): string {
  const r = c.director.refusals.find((x) => x.id === 'bad-plan');
  return r
    ? [say(r.reply, locale), r.alternative ? say(r.alternative, locale) : '']
        .filter(Boolean)
        .join(' ')
    : 'Director could not make a usable plan from this brief.';
}

/** Plans with the model: call, check, one repair, else refuse (all refunded). */
export async function llmPlan(x: LlmPlanInput): Promise<LlmPlanResult> {
  const c = x.config;
  const model = c.models.find((m) => m.id === x.modelId);
  if (!model || model.providerId === 'mock') {
    // Offline fallback: the free deterministic planner.
    const raw = (await mockPlanner().draft(x)) as VideoPlan;
    const n = c.director.limits.maxNarrationChars;
    const fitted = {
      ...raw,
      scenes: raw.scenes.slice(0, c.director.limits.maxScenes).map((s) => ({
        ...s,
        narration:
          (s.narration ?? '').length > n
            ? `${(s.narration ?? '').slice(0, n - 1).trimEnd()}…`
            : s.narration,
      })),
    };
    const up =
      x.style.interview.creativeUpgrade && c.director.creativeUpgrade?.enabled;
    const checked = checkModelPlan(c, x.plan, {
      plan: fitted,
      upgrades: up ? mockUpgrades(c, x.plan, fitted) : [],
    });
    return checked.ok
      ? { ...checked, repaired: false, credits: 0 }
      : {
          ok: false,
          message: badPlanText(c, x.locale),
          errors: checked.errors,
          credits: 0,
        };
  }
  const prompt = planPrompt(x);
  const role = c.director.roles.plan;
  const max = planningMax(c, model, prompt.system.length + prompt.user.length);
  const job = await x.gateway.startJob({
    userId: x.userId,
    plan: x.plan,
    role,
    modelId: model.id,
    maxCredits: max,
    key: x.key,
  });
  const ask = (req: GatewayRequest): Promise<AdapterResult> =>
    job.call(role, model.id, req);
  const base: GatewayRequest = {
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    json: true,
    maxOutputTokens: c.director.limits.planOutputTokens,
  };
  let errors: string[] = [];
  let answer = '';
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const req: GatewayRequest =
        attempt === 0
          ? base
          : {
              ...base,
              messages: [
                ...base.messages,
                { role: 'assistant', content: answer.slice(0, 40000) },
                {
                  role: 'user',
                  content: fill(c.director.prompts!.repair, {
                    errors: errors.map((e) => `- ${e}`).join('\n'),
                  }),
                },
              ],
            };
      let raw: unknown;
      try {
        const r = await ask(req);
        answer = r.text ?? '';
        raw = extractJson(answer);
      } catch (e) {
        // A provider failure is not repairable: give everything back.
        if ((e as { code?: string }).code) throw e;
        errors = [(e as Error).message];
        continue;
      }
      const checked = checkModelPlan(c, x.plan, raw);
      if (checked.ok) {
        const credits = await job.finish(0);
        return { ...checked, repaired: attempt > 0, credits };
      }
      errors = checked.errors.slice(0, 20);
    }
  } catch (e) {
    await job.fail();
    throw e;
  }
  await job.fail();
  return {
    ok: false,
    message: badPlanText(c, x.locale),
    errors,
    credits: 0,
  };
}

/** The mock planner's one deterministic upgrade (a question to open with). */
export function mockUpgrades(
  c: PlatformConfig,
  plan: Plan,
  v: VideoPlan,
): Upgrade[] {
  const first = allowedMethods(c, plan)[0] ?? 'motion-graphics';
  const scene = sceneFor(first, {
    id: 'hook',
    title: 'A question to hook the viewer',
    narration: `Have you ever wondered: ${v.meta.title}?`,
    index: 1,
    last: false,
    accent: '#7c5cff',
  });
  return [
    {
      id: 'hook-question',
      title: 'Open with a question',
      why: 'A question in the first seconds keeps viewers watching.',
      addScene: {
        at: 1,
        scene: { ...scene, durationHint: c.director.estimate.secondsPerScene },
      },
    },
  ];
}
