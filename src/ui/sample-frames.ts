// ROUND-C1 F2: sample frames of a plan's new graphics (C1.5.2). Each def that
// passed its compiler and policy checks is placed alone, full canvas, in a
// scratch project of the plan's shape (through the ordinary code-layer
// commands, previewed: nothing is committed), and renderFrames draws it at a
// quarter, the middle and near the end. The findings feed the planning
// loop's one fix call. Loaded lazily with render-frames.
import {
  createProject,
  EditorEngine,
  type Command,
  type Project,
} from '../core';
import { codeLayerCommands } from '../code-layer/layer';
import { checkDef } from '../video-plan/defs';
import type { VideoPlan } from '../video-plan/schema';
import {
  renderFrames,
  sampleTimes,
  type Opener,
  type RenderedFrame,
} from './render-frames';

export const ASPECT_SIZE: Readonly<Record<string, [number, number]>> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
};
export interface GraphicSample {
  readonly graphic: string;
  readonly time: number;
  readonly blank: boolean;
  readonly outside: boolean;
  readonly error?: string | undefined;
  readonly png?: Uint8Array | undefined;
}

export async function sampleGraphics(
  plan: VideoPlan,
  o: {
    signal?: AbortSignal | undefined;
    open?: Opener;
    size?: number;
    frameTimeoutMs?: number;
  } = {},
): Promise<GraphicSample[]> {
  const [width, height] = ASPECT_SIZE[plan.meta.aspect] ?? [1920, 1080];
  const out: GraphicSample[] = [];
  for (const def of plan.defs?.blocks ?? []) {
    if (o.signal?.aborted)
      throw new DOMException('The check was cancelled.', 'AbortError');
    const checked = checkDef(def);
    if (!checked.ok || checked.item?.type !== 'motion' || !checked.meta)
      continue;
    const data = (checked.item as { data: { tier: 'B' | 'C'; source: string } })
      .data;
    const base = createProject('Sample');
    const scene = base.compositions[0]!;
    const engine = new EditorEngine(base);
    const sized = engine.preview([
      {
        type: 'SET_COMPOSITION_SIZE',
        compositionId: scene.id,
        width,
        height,
      } as unknown as Command,
    ]);
    const add = codeLayerCommands(
      sized.compositions[0]! as never,
      {
        tier: data.tier,
        source: data.source,
        meta: checked.meta,
        params: {},
        templateId: `plan-graphics-${def.id}`,
        name: checked.name ?? def.id,
      },
      0,
    );
    const project = new EditorEngine(sized as unknown as Project).preview(
      add.commands,
    ) as unknown as Project;
    const duration = project.compositions[0]!.duration;
    let frames: RenderedFrame[];
    try {
      frames = await renderFrames(project, sampleTimes(duration), {
        size: o.size ?? 192,
        signal: o.signal,
        ...(o.open ? { open: o.open } : {}),
        ...(o.frameTimeoutMs ? { frameTimeoutMs: o.frameTimeoutMs } : {}),
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      out.push({
        graphic: def.id,
        time: 0,
        blank: false,
        outside: false,
        error: (e as Error).message,
      });
      continue;
    }
    for (const f of frames) {
      const g = f.graphics[0];
      out.push({
        graphic: def.id,
        time: f.time,
        blank: g ? g.blank : f.blank,
        outside: g ? g.outside : false,
        error: g?.error,
        png: f.png,
      });
      if (g?.error) break; // one error per graphic is enough
    }
  }
  return out;
}

/**
 * ROUND-C1 F2: one small frame per scene of the plan built headless, with
 * no media (empty media places show as frames), for the vision check.
 * At most six scenes, from the middle of each.
 */
export async function planFrames(
  plan: VideoPlan,
  o: {
    signal?: AbortSignal | undefined;
    open?: Opener;
    /** The shared tools' context: frames are drawn through runTool('renderFrames'). */
    tools?: import('../tools').ToolContext;
  } = {},
): Promise<{ scene: string; base64: string }[]> {
  const { buildVideoFromPlan } = await import('../video-plan/build');
  const built = await buildVideoFromPlan(
    plan,
    {
      resolve: { local: () => [], stock: async () => [] },
      importCandidate: async () => {
        throw new Error('No media while checking.');
      },
    },
    () => undefined,
    o.signal,
  );
  const project = built.project as unknown as Project | null;
  if (!project) return [];
  const out: { scene: string; base64: string }[] = [];
  for (const [i, scene] of project.compositions.slice(0, 6).entries()) {
    const one = { ...project, compositions: [scene] } as Project;
    let frame: { png: Uint8Array } | undefined;
    if (o.tools) {
      const { runTool } = await import('../tools');
      const r = await runTool(
        'renderFrames',
        { project: one, times: [scene.duration / 2], size: 384 },
        o.tools,
      );
      if (!r.ok) throw new Error(r.error);
      frame = r.output[0];
    } else
      [frame] = await renderFrames(one, [scene.duration / 2], {
        size: 384,
        signal: o.signal,
        ...(o.open ? { open: o.open } : {}),
      });
    if (!frame) continue;
    let text = '';
    for (const byte of frame.png) text += String.fromCharCode(byte);
    out.push({ scene: plan.scenes[i]?.id ?? scene.id, base64: btoa(text) });
  }
  return out;
}
