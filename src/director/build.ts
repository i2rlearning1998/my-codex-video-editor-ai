// P2-30: Live Build. One reservation for the whole video (at the plan card's
// maximum); each scene is written by the chosen model and AI pictures are
// made by the image model; the end settles at what was used. Any failure
// refunds everything. The result is the plan the editor builds into layers.
import {
  costById,
  defaultModelFor,
  type Plan,
  type PlatformConfig,
} from '../platform-config';
import { hash, type Gateway } from '../gateway';
import type { VideoPlan } from '../video-plan';
import { checkPlan, methodOf } from './planner';

export type BuildEvent =
  | { step: 'reserve'; credits: number }
  | { step: 'scene'; index: number; total: number }
  | { step: 'check' }
  | { step: 'done'; credits: number; refunded: number }
  | { step: 'failed'; message: string; refunded: number };

export interface BuildInput {
  readonly gateway: Gateway;
  readonly config: PlatformConfig;
  readonly userId: string;
  readonly plan: Plan;
  readonly modelId: string;
  readonly video: VideoPlan;
  readonly maxCredits: number;
  readonly key: string;
  readonly onEvent: (e: BuildEvent) => void;
}

/** What a scene's work really cost: a fixed point inside the owner's range. */
export function workCredits(
  c: PlatformConfig,
  method: string,
  sceneId: string,
): number {
  const tool = c.director.tools.find((t) => t.id === method);
  const cost = tool?.costId ? costById(c, tool.costId) : undefined;
  if (!cost) return 0;
  const span = cost.max - cost.min;
  return cost.min + (span > 0 ? hash(`${sceneId}:${method}`) % (span + 1) : 0);
}

export async function runBuild(
  x: BuildInput,
): Promise<{ plan: VideoPlan; credits: number }> {
  const c = x.config;
  const methods = x.video.scenes.map(methodOf);
  const tools = [...new Set(methods)].map((id) => ({
    id,
    maxCredits: Math.ceil(x.maxCredits / Math.max(1, methods.length)),
  }));
  const job = x.gateway.startJob({
    userId: x.userId,
    plan: x.plan,
    role: c.director.roles.write,
    modelId: x.modelId,
    maxCredits: x.maxCredits,
    videoCredits: x.maxCredits,
    key: x.key,
    tools,
  });
  x.onEvent({ step: 'reserve', credits: job.reserved });
  try {
    const scenes = x.video.scenes.slice();
    let work = 0;
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i]!;
      x.onEvent({ step: 'scene', index: i, total: scenes.length });
      const written = await job.call(c.director.roles.write, x.modelId, {
        system: `Write the narration of one scene of "${x.video.meta.title}".`,
        messages: [{ role: 'user', content: s.narration ?? s.title ?? '' }],
        maxOutputTokens: c.director.estimate.outputTokensPerScene.max,
      });
      if (!written.text) throw new Error('empty');
      const m = methods[i]!;
      if (m === 'ai-image' || m === 'ai-video') {
        const role = m === 'ai-image' ? 'studio-images' : 'studio-video';
        const media = defaultModelFor(c, x.plan, role);
        if (media)
          await job.call(role, media.id, {
            messages: [],
            prompt: s.narration ?? '',
            units: 1,
          });
      }
      work += workCredits(c, m, s.id);
    }
    x.onEvent({ step: 'check' });
    const checked = checkPlan(x.video);
    if (!checked.ok) throw new Error(checked.message);
    const credits = job.finish(work);
    x.onEvent({ step: 'done', credits, refunded: job.reserved - credits });
    return { plan: checked.plan, credits };
  } catch (e) {
    job.fail();
    const message =
      e instanceof Error && e.message !== 'empty'
        ? e.message
        : 'The build stopped.';
    x.onEvent({ step: 'failed', message, refunded: job.reserved });
    throw e;
  }
}
