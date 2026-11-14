// P2-30: Live Build. One reservation for the whole video (at the plan card's
// maximum); each scene is written by the chosen model and AI pictures are
// made by the image model; the end settles at what was used. Any failure
// refunds everything. The result is the plan the editor builds into layers.
import {
  canUse,
  costById,
  modelsForRole,
  type Plan,
  type PlatformConfig,
} from '../platform-config';
import { hash } from '../gateway';
import { creditsOf } from '../gateway/cost';
import { emptyUsage } from '../gateway/types';
import type { JobInput, JobLike } from '../panel/remote';
// (types only: the director stays free of panel code at run time)
import type { VideoPlan } from '../video-plan';
import { checkPlan, methodOf, sourceOf } from './planner';

export type BuildEvent =
  | { step: 'reserve'; credits: number }
  | { step: 'scene'; index: number; total: number }
  | { step: 'media'; index: number; kind: 'image' | 'video' | 'voice' }
  | { step: 'check' }
  | { step: 'done'; credits: number; refunded: number }
  | { step: 'failed'; message: string; refunded: number };

export interface BuildInput {
  /** The in-browser gateway or the server (src/panel/remote.ts). */
  readonly gateway: { startJob(x: JobInput): JobLike | Promise<JobLike> };
  readonly config: PlatformConfig;
  readonly userId: string;
  readonly plan: Plan;
  readonly modelId: string;
  readonly video: VideoPlan;
  readonly maxCredits: number;
  readonly key: string;
  readonly onEvent: (e: BuildEvent) => void;
  /** P2B-23: whether a media model can be reached now (the server knows). */
  readonly connected?: (modelId: string) => boolean;
  /** P2B-23: speak the whole narration with the voice model. */
  readonly voice?: boolean;
  /** ROUND-B: Cancel. Checked between calls; a cancel refunds the whole hold. */
  readonly signal?: AbortSignal;
  /**
   * ROUND-B: runs after the plan is checked and BEFORE any credit is
   * settled (AI mode puts the scenes on the canvas here). If it throws or
   * the build is cancelled, the whole hold is given back and nothing stays.
   */
  readonly beforeSettle?: (
    result: Omit<BuildResult, 'credits'>,
  ) => Promise<void>;
}
/** A file the build made, for Project Media (found by the plan by name). */
export interface MadeFile {
  readonly name: string;
  readonly type: string;
  readonly base64: string;
  readonly kind: 'image' | 'video' | 'audio';
  readonly sceneId?: string;
}
export interface BuildResult {
  readonly plan: VideoPlan;
  readonly credits: number;
  readonly files: readonly MadeFile[];
  /** Why a media frame stays empty (a sentence per scene). */
  readonly missing: readonly string[];
}
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};
export const safeName = (q: string) =>
  q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 80) || 'picture';

/**
 * The media model a build uses for a role: one the plan allows and that can
 * be reached; never the mock (it gives no file).
 */
export function mediaModel(
  c: PlatformConfig,
  plan: Plan,
  role: string,
  reach: (id: string) => boolean = () => true,
) {
  // The mock media models make no file, so they are never used or charged.
  const list = modelsForRole(c, role).filter(
    (m) => m.providerId !== 'mock' && canUse(plan, m.requires) && reach(m.id),
  );
  return list.find((m) => m.recommendedForDirector) ?? list[0];
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

export async function runBuild(x: BuildInput): Promise<BuildResult> {
  const c = x.config;
  const methods = x.video.scenes.map(methodOf);
  const tools = [...new Set(methods)].map((id) => ({
    id,
    maxCredits: Math.ceil(x.maxCredits / Math.max(1, methods.length)),
  }));
  const job = await x.gateway.startJob({
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
    const files: MadeFile[] = [];
    const missing: string[] = [];
    const reach = (id: string) => (x.connected ? x.connected(id) : true);
    const stop = () => {
      if (x.signal?.aborted) throw new Error('cancelled');
    };
    for (let i = 0; i < scenes.length; i++) {
      stop();
      const s = scenes[i]!;
      x.onEvent({ step: 'scene', index: i, total: scenes.length });
      const written = await job.call(c.director.roles.write, x.modelId, {
        system: `Write the narration of one scene of "${x.video.meta.title}".`,
        messages: [{ role: 'user', content: s.narration ?? s.title ?? '' }],
        maxOutputTokens: c.director.estimate.outputTokensPerScene.max,
      });
      if (!written.text) throw new Error('empty');
      const m = methods[i]!;
      if (sourceOf(s) === 'mine') {
        // P3-WIRING (W3): the person's own file ("mera apna"): nothing is
        // made; the editor shows the scene's frame as needing their file.
        const layer = s.layers.find((l) => l.kind === 'media' && l.mediaIntent);
        missing.push(
          `Scene ${i + 1}: needs your file${layer?.mediaIntent?.query ? ` ("${layer.mediaIntent.query}")` : ''}.`,
        );
      } else if (m === 'ai-image' || m === 'ai-video') {
        const kind = m === 'ai-image' ? 'image' : 'video';
        const role = kind === 'image' ? 'studio-images' : 'studio-video';
        const media = mediaModel(c, x.plan, role, reach);
        const layer = s.layers.find((l) => l.kind === 'media' && l.mediaIntent);
        const query = layer?.mediaIntent?.query ?? s.title ?? s.id;
        if (!media)
          missing.push(
            `Scene ${i + 1}: no ${kind} model is connected yet, so its picture frame waits for a file named "${query}".`,
          );
        else {
          x.onEvent({ step: 'media', index: i, kind });
          const r = await job.call(role, media.id, {
            messages: [],
            prompt: `${query}. ${s.narration ?? ''}`.slice(0, 1000),
            units: 1,
          });
          if (r.media?.base64) {
            const type =
              r.media.mime ?? (kind === 'image' ? 'image/png' : 'video/mp4');
            files.push({
              name: `${safeName(query)}.${EXT[type] ?? 'bin'}`,
              type,
              base64: r.media.base64,
              kind,
              sceneId: s.id,
            });
          } else
            missing.push(
              `Scene ${i + 1}: the ${kind} model sent no file, so its frame waits for "${query}".`,
            );
        }
      }
      work += workCredits(c, m, s.id);
    }
    let video = x.video;
    if (x.voice) {
      const words = scenes
        .map((s) => s.narration?.trim() ?? '')
        .filter(Boolean)
        .join('\n\n');
      const vm = mediaModel(c, x.plan, 'studio-voice', reach);
      if (!words) {
        /* nothing to speak */
      } else if (!vm)
        missing.push(
          'Voice: no voice model is connected yet, so the editor speaks the narration with its own voice when it can.',
        );
      else {
        x.onEvent({ step: 'media', index: scenes.length, kind: 'voice' });
        const r = await job.call('studio-voice', vm.id, {
          messages: [],
          prompt: words.slice(0, 20000),
          units: Math.max(1, Math.ceil(words.length / 900)),
        });
        if (r.media?.base64) {
          const type = r.media.mime ?? 'audio/mpeg';
          files.push({
            name: `narration.${EXT[type] ?? 'mp3'}`,
            type,
            base64: r.media.base64,
            kind: 'audio',
          });
          video = {
            ...video,
            narrationTrack: { query: 'narration', volume: 1, start: 0 },
          };
        } else missing.push('Voice: the voice model sent no file.');
      }
    }
    if (missing.length)
      video = {
        ...video,
        notes: `${video.notes ?? ''}\n${missing.join('\n')}`
          .trim()
          .slice(0, 4000),
      };
    x.onEvent({ step: 'check' });
    const checked = checkPlan(video);
    if (!checked.ok) throw new Error(checked.message);
    stop();
    await x.beforeSettle?.({ plan: checked.plan, files, missing });
    stop();
    const credits = await job.finish(work);
    x.onEvent({ step: 'done', credits, refunded: job.reserved - credits });
    return { plan: checked.plan, credits, files, missing };
  } catch (e) {
    await job.fail();
    const message =
      e instanceof Error && e.message !== 'empty'
        ? e.message
        : 'The build stopped.';
    x.onEvent({ step: 'failed', message, refunded: job.reserved });
    throw e;
  }
}

/**
 * P2B-22: the most the media models of a build can cost (AI pictures, AI
 * video seconds, the voice), added to the Plan card's hold so the build never
 * needs more than was reserved.
 */
export function mediaCredits(
  c: PlatformConfig,
  plan: Plan,
  video: VideoPlan,
  voice: boolean,
  reach: (id: string) => boolean = () => true,
): number {
  let total = 0;
  const image = mediaModel(c, plan, 'studio-images', reach);
  const film = mediaModel(c, plan, 'studio-video', reach);
  for (const s of video.scenes) {
    const m = methodOf(s);
    if (m === 'ai-image' && image)
      total += creditsOf(c, image, { ...emptyUsage(), images: 1 });
    if (m === 'ai-video' && film)
      total += creditsOf(c, film, {
        ...emptyUsage(),
        seconds: s.durationHint ?? c.director.estimate.secondsPerScene,
      });
  }
  const vm = mediaModel(c, plan, 'studio-voice', reach);
  if (voice && vm) {
    const chars = video.scenes.reduce(
      (n, s) => n + (s.narration?.trim().length ?? 0),
      0,
    );
    if (chars)
      total += creditsOf(c, vm, {
        ...emptyUsage(),
        minutes: Math.max(1, Math.ceil(chars / 900)),
      });
  }
  return total;
}
