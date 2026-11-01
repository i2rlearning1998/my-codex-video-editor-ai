// P2-28: the Planner turns a Brief into a Video Plan v3. A model does this
// later; the mock planner here is deterministic. Whatever plans, its output is
// validated with the editor's own plan validator; an invalid plan is repaired
// once and then refused with one plain sentence (owner rule 4).
import {
  text as say,
  type Answers,
  type Plan,
  type PlatformConfig,
  type Style,
} from '../platform-config';
import { validatePlan, type VideoPlan } from '../video-plan';
import { allowedMethods } from './methods';

export interface PlannerInput {
  readonly config: PlatformConfig;
  readonly style: Style;
  readonly answers: Answers;
  readonly notes: readonly string[];
  readonly plan: Plan;
}
export interface Planner {
  /** Raw plan JSON (from a model or the mock): it is checked by `checkPlan`. */
  draft(input: PlannerInput): Promise<unknown>;
}

const METHOD_NOTE = 'method:';
export const methodOf = (scene: { notes?: string | undefined }): string =>
  scene.notes?.startsWith(METHOD_NOTE)
    ? scene.notes.slice(METHOD_NOTE.length)
    : 'motion-graphics';
const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3);

/** One scene's layers for a method. All of them are plan layers the editor builds. */
export function sceneFor(
  method: string,
  base: {
    id: string;
    title: string;
    narration: string;
    index: number;
    last: boolean;
    accent: string;
  },
): VideoPlan['scenes'][number] {
  const query =
    words(base.narration).slice(0, 4).join(' ') || 'abstract background';
  const title = clip(base.title, 100);
  const layers: VideoPlan['scenes'][number]['layers'] = (() => {
    switch (method) {
      case 'library':
        return base.last
          ? [
              {
                id: 'end',
                kind: 'kit',
                kit: 'end-card',
                text: `${title}|${clip(base.narration, 120)}`,
                anchor: 'center',
                size: 'medium',
                enter: 'fade',
                exit: 'none',
              },
            ]
          : [
              {
                id: 'card',
                kind: 'kit',
                kit: 'title-card-1',
                text: title,
                anchor: 'center',
                size: 'medium',
                enter: 'fade',
                exit: 'none',
              },
            ];
      case 'stock':
      case 'ai-image':
      case 'ai-video':
        return [
          {
            id: 'picture',
            kind: 'media',
            size: 'full',
            anchor: 'center',
            enter: 'fade',
            exit: 'none',
            mediaIntent: {
              query,
              type: method === 'ai-video' ? 'video' : 'photo',
            },
          },
          {
            id: 'title',
            kind: 'title',
            text: title,
            anchor: 'lower-third',
            size: 'medium',
            enter: 'slide-up',
            exit: 'none',
          },
        ];
      default:
        return [
          {
            id: 'title',
            kind: 'title',
            text: title,
            anchor: 'top',
            size: 'medium',
            enter: 'slide-up',
            exit: 'none',
          },
          {
            id: 'line',
            kind: 'text',
            text: clip(base.narration, 200),
            anchor: 'center',
            size: 'medium',
            enter: 'words',
            exit: 'none',
          },
          {
            id: 'dot',
            kind: 'shape',
            shape: 'ellipse',
            at: { x: 50, y: 78 },
            width: 12,
            height: 12,
            color: base.accent,
            anchor: 'center',
            size: 'small',
            enter: 'zoom',
            exit: 'none',
            loop: 'pulse',
          },
        ];
    }
  })();
  return {
    id: base.id,
    title,
    narration: clip(base.narration, 4000),
    layers,
    sfx: [],
    notes: `${METHOD_NOTE}${method}`,
    ...(base.index > 0 ? {} : {}),
  };
}

/** Sets one scene's method again (its layers follow; text is kept). */
export function withMethod(
  plan: VideoPlan,
  index: number,
  method: string,
  accent = '#7c5cff',
): VideoPlan {
  const s = plan.scenes[index];
  if (!s) return plan;
  const scenes = plan.scenes.slice();
  scenes[index] = {
    ...sceneFor(method, {
      id: s.id,
      title: s.title ?? `Scene ${index + 1}`,
      narration: s.narration ?? s.title ?? '',
      index,
      last: index === plan.scenes.length - 1,
      accent,
    }),
    ...(s.durationHint ? { durationHint: s.durationHint } : {}),
    ...(s.transitionOut ? { transitionOut: s.transitionOut } : {}),
  };
  return { ...plan, scenes };
}

const BEATS = [
  'The question',
  'The clue',
  'The key idea',
  'How it works',
  'The result',
  'Why it matters',
  'Recap',
];
/** A deterministic stand-in for the planning model. */
export function mockPlanner(): Planner {
  return {
    async draft({ config, style, answers, notes, plan }) {
      const idea =
        String(answers.idea ?? answers.hook ?? answers.topic ?? '').trim() ||
        say(style.name);
      const sentences = idea
        .split(/(?<=[.!?।])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const want = Number(answers.scenes);
      const n =
        Number.isFinite(want) && want > 0
          ? Math.min(12, Math.max(3, Math.round(want)))
          : Math.min(8, Math.max(5, sentences.length + 2));
      const allowed = allowedMethods(config, plan);
      const first = allowed[0] ?? 'motion-graphics';
      const pick = (i: number) =>
        (i === 0 || i === n - 1) && allowed.includes('library')
          ? 'library'
          : first;
      const accent =
        typeof answers.accent === 'string' ? answers.accent : '#7c5cff';
      const title = (sentences[0] ?? idea).replace(/[.!?।]+$/, '');
      const scenes = Array.from({ length: n }, (_, i) => {
        const last = i === n - 1;
        const beat =
          i === 0
            ? clip(title, 90)
            : last
              ? 'Thank you for watching'
              : BEATS[(i - 1) % BEATS.length]!;
        const narration =
          i === 0
            ? idea
            : last
              ? `${clip(title, 120)}. ${notes.join(' ')}`.trim()
              : `${beat}. ${sentences[i] ?? sentences[(i - 1) % Math.max(1, sentences.length)] ?? idea}`;
        return {
          ...sceneFor(pick(i), {
            id: `s${i + 1}`,
            title: beat,
            narration,
            index: i,
            last,
            accent,
          }),
          durationHint: config.director.estimate.secondsPerScene,
          ...(last
            ? {}
            : { transitionOut: { type: 'crossfade' as const, duration: 0.5 } }),
        };
      });
      const lang = answers.captionLang === 'hi' ? 'hi' : 'en';
      return {
        format: 'video-plan',
        version: 3,
        meta: {
          build: 'scenes',
          title: clip(title, 100),
          language: lang,
          aspect: style.formats[0] ?? '16:9',
          fps: 30,
        },
        scenes,
        overlays: [],
        captions: { enabled: answers.captionLang !== undefined },
        notes: clip(`Style: ${style.id}. ${notes.join(' ')}`, 4000),
      };
    },
  };
}

export type CheckedPlan =
  | {
      ok: true;
      plan: VideoPlan;
      repaired: boolean;
      warnings: readonly string[];
    }
  | { ok: false; message: string; errors: readonly string[] };

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
/** One repair pass: ids, empty or long text, layers without what they need. */
export function repairPlan(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const p = structuredClone(raw) as Record<string, unknown>;
  p.format = 'video-plan';
  if (p.version !== 2 && p.version !== 3) p.version = 3;
  const meta = (p.meta && typeof p.meta === 'object' ? p.meta : {}) as Record<
    string,
    unknown
  >;
  meta.title = clip(String(meta.title ?? 'Untitled').trim() || 'Untitled', 100);
  p.meta = meta;
  const scenes = Array.isArray(p.scenes)
    ? (p.scenes as Record<string, unknown>[])
    : [];
  p.scenes = scenes.slice(0, 40).map((s, i) => {
    const scene = { ...s };
    scene.id = typeof s.id === 'string' && ID.test(s.id) ? s.id : `s${i + 1}`;
    if (typeof scene.title === 'string')
      scene.title = clip(scene.title, 100) || `Scene ${i + 1}`;
    if (typeof scene.narration === 'string')
      scene.narration = clip(scene.narration, 4000);
    const layers = Array.isArray(s.layers)
      ? (s.layers as Record<string, unknown>[])
      : [];
    const seen = new Set<string>();
    scene.layers = layers
      .filter((l) => {
        if ((l.kind === 'title' || l.kind === 'text') && !l.text) return false;
        if (l.kind === 'media' && !l.mediaIntent) return false;
        if (l.kind === 'shape' && !l.shape) return false;
        return true;
      })
      .map((l, j) => {
        let id =
          typeof l.id === 'string' && ID.test(l.id) && !seen.has(l.id)
            ? l.id
            : `l${j + 1}`;
        while (seen.has(id)) id = `${id}-x`;
        seen.add(id);
        return {
          ...l,
          id,
          ...(typeof l.text === 'string' ? { text: clip(l.text, 280) } : {}),
        };
      });
    if (!(scene.layers as unknown[]).length && !scene.narration)
      scene.narration = String(scene.title ?? `Scene ${i + 1}`);
    return scene;
  });
  const ids = new Set<string>();
  for (const s of p.scenes as Record<string, string>[]) {
    while (ids.has(s.id!)) s.id = `${s.id}-x`;
    ids.add(s.id!);
  }
  return p;
}

/** Validate; repair once; refuse with one sentence. */
export function checkPlan(raw: unknown): CheckedPlan {
  const first = validatePlan(raw);
  if (first.ok && first.plan)
    return {
      ok: true,
      plan: first.plan,
      repaired: false,
      warnings: first.warnings,
    };
  const second = validatePlan(repairPlan(raw));
  if (second.ok && second.plan)
    return {
      ok: true,
      plan: second.plan,
      repaired: true,
      warnings: second.warnings,
    };
  return {
    ok: false,
    message:
      'Director could not make a usable plan from this brief. Try again, or add more detail to the idea.',
    errors: second.errors,
  };
}
