// P3-WIRING (W9): the editor chat engine (no dock UI; Part 3 builds that).
// It resolves the person's selection against the READ-ONLY engine state,
// asks a model for ordinary semantic commands as JSON, validates every one
// with the editor's own validators (EditorEngine.preview, the Command Bus
// path), repairs once, and emits a PROPOSAL. Only `apply` changes the
// project, as ONE transaction (one undo step); `discard` forgets it.
// Editor-side code: it imports no gateway, Director or panel code; the model
// call is injected (`remoteAsk` calls the gateway server's /v1/run).
import type {
  EditEvent,
  EditorChatEngine,
  P3Failure,
  Result,
  SelectionRef,
} from '../contracts/p3';
import type {
  Composition,
  DeepReadonly,
  EditorCommand,
  Layer,
  Project,
} from '../core';

/** One charged model call: the text and the credits it cost. */
export type ModelAsk = (req: {
  readonly system: string;
  readonly user: string;
  readonly maxOutputTokens: number;
  readonly signal?: AbortSignal;
}) => Promise<{ readonly text: string; readonly credits: number }>;

export interface EditorChatDeps {
  readonly engine: {
    readonly state: DeepReadonly<Project>;
    preview(commands: readonly EditorCommand[]): DeepReadonly<Project>;
    /** The Command Bus: `apply` runs the proposal as one transaction. */
    readonly commands: {
      transaction(label: string, commands: readonly EditorCommand[]): unknown;
    };
  };
  /** The open scene (used when a selection names no scene). */
  readonly sceneId: () => string;
  readonly ask: ModelAsk;
  /** The owner's prompt (config `director.prompts.edit`). */
  readonly prompt: () => string;
  /** Plan and switches (the entitlement service), checked before a call. */
  readonly check?: () => Promise<P3Failure | null>;
  readonly newId?: () => string;
  /** Characters of selection context the model gets. */
  readonly maxContextChars?: number;
}

/** The commands the chat may propose (everything else is refused). */
export const EDIT_COMMANDS = [
  'SET_PROPERTY',
  'SET_LAYER_NAME',
  'SET_LAYER_TIMING',
  'MOVE_LAYER',
  'DELETE_LAYER',
  'SET_KEYFRAME',
  'REMOVE_KEYFRAME',
  'SET_CLIP_TIMING',
  'MOVE_CLIP',
  'SET_CLIP_SPEED',
  'SET_CLIP_ENABLED',
  'SET_CLIP_REVERSED',
  'SET_CLIP_ANIMATION',
  'SET_CLIP_FX',
  'SET_CLIP_TRANSITION',
  'SET_COMPOSITION_BACKGROUND',
  'ADD_MARKER',
] as const;
const ALLOWED = new Set<string>(EDIT_COMMANDS);
const MAX_COMMANDS = 50;

const fail = (code: string, en: string, hi?: string): P3Failure => ({
  code,
  message: hi ? { en, hi } : { en },
});
const fill = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
/** The first JSON object in a model answer (code fences allowed). */
function firstJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/g, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('The answer has no JSON object.');
  return JSON.parse(t.slice(a, b + 1));
}

/** Resolves a selection against the state; null when an id is unknown. */
export function resolveSelection(
  state: DeepReadonly<Project>,
  sel: readonly SelectionRef[],
  openScene: string,
): { scene: DeepReadonly<Composition>; text: string }[] | null {
  const out: { scene: DeepReadonly<Composition>; text: string }[] = [];
  const sceneOf = (id?: string) =>
    state.compositions.find((c) => c.id === (id ?? openScene));
  const walk = (ls: readonly DeepReadonly<Layer>[]): DeepReadonly<Layer>[] =>
    ls.flatMap((l) => [l, ...walk(l.children)]);
  for (const r of sel) {
    if (r.kind === 'scene') {
      const sc = sceneOf(r.id);
      if (!sc) return null;
      out.push({
        scene: sc,
        text: `SCENE ${sc.id} "${sc.name}" ${sc.width}x${sc.height} ${sc.fps} fps, ${sc.duration} s, background ${(sc as { backgroundColor?: string }).backgroundColor ?? ''}`,
      });
      continue;
    }
    const sc =
      sceneOf(r.sceneId) ??
      state.compositions.find((c) =>
        r.kind === 'layer'
          ? walk(c.layers).some((l) => l.id === r.id)
          : c.tracks.some((t) => t.clips.some((x) => x.id === r.id)),
      );
    if (!sc) return null;
    if (r.kind === 'layer') {
      const l = walk(sc.layers).find((x) => x.id === r.id);
      if (!l) return null;
      const clip = sc.tracks
        .flatMap((t) => t.clips)
        .find((x) => x.layerId === l.id);
      out.push({
        scene: sc,
        text: `LAYER ${JSON.stringify({ ...l, children: undefined })}${clip ? `\nITS CLIP ${JSON.stringify(clip)}` : ''}`,
      });
    } else if (r.kind === 'clip') {
      const clip = sc.tracks.flatMap((t) => t.clips).find((x) => x.id === r.id);
      if (!clip) return null;
      out.push({ scene: sc, text: `CLIP ${JSON.stringify(clip)}` });
    } else {
      const from = r.from ?? 0;
      const to = r.to ?? sc.duration;
      if (!(to > from)) return null;
      const clips = sc.tracks
        .flatMap((t) => t.clips)
        .filter((x) => x.startTime < to && x.startTime + x.duration > from);
      out.push({
        scene: sc,
        text: `RANGE ${from}s to ${to}s in scene ${sc.id}; clips: ${JSON.stringify(clips)}`,
      });
    }
  }
  return out;
}

/** Checks a proposal: shape, allowed types, scenes, then the editor's validators. */
export function checkCommands(
  engine: EditorChatDeps['engine'],
  raw: unknown,
  scenes: ReadonlySet<string>,
):
  | { ok: true; commands: EditorCommand[]; summary: string }
  | { ok: false; errors: string[] } {
  const r = (raw ?? {}) as { summary?: unknown; commands?: unknown };
  const errors: string[] = [];
  if (!Array.isArray(r.commands) || r.commands.length === 0)
    return { ok: false, errors: ['"commands" must be a non-empty list.'] };
  if (r.commands.length > MAX_COMMANDS)
    return { ok: false, errors: [`At most ${MAX_COMMANDS} commands.`] };
  r.commands.forEach((c, i) => {
    const t = (c as { type?: unknown })?.type;
    if (typeof t !== 'string' || !ALLOWED.has(t))
      errors.push(`Command ${i + 1}: type "${String(t)}" is not allowed.`);
    const sc = (c as { compositionId?: unknown })?.compositionId;
    if (typeof sc !== 'string' || !scenes.has(sc))
      errors.push(
        `Command ${i + 1}: "compositionId" must be a selected scene.`,
      );
  });
  if (errors.length) return { ok: false, errors };
  const commands = r.commands as EditorCommand[];
  try {
    engine.preview(commands);
  } catch (e) {
    return {
      ok: false,
      errors: [String((e as Error).message ?? e).slice(0, 2000)],
    };
  }
  return {
    ok: true,
    commands,
    summary:
      typeof r.summary === 'string' && r.summary.trim()
        ? r.summary.trim().slice(0, 300)
        : `${commands.length} change${commands.length === 1 ? '' : 's'}`,
  };
}

export function createEditorChatEngine(d: EditorChatDeps): EditorChatEngine {
  const proposals = new Map<
    string,
    { commands: EditorCommand[]; summary: string; base: DeepReadonly<Project> }
  >();
  let n = 0;
  const newId = d.newId ?? (() => `edit-${Date.now().toString(36)}-${++n}`);

  async function* send(input: {
    readonly text: string;
    readonly selection: readonly SelectionRef[];
    readonly attachmentIds: readonly string[];
    readonly signal?: AbortSignal;
  }): AsyncIterable<EditEvent> {
    const text = input.text.trim();
    if (!text) {
      yield {
        type: 'failure',
        failure: fail('empty', 'Write what to change.'),
      };
      return;
    }
    const state = d.engine.state;
    const sel = input.selection.length
      ? input.selection
      : [{ kind: 'scene' as const, id: d.sceneId() }];
    const found = resolveSelection(state, sel, d.sceneId());
    if (!found) {
      yield {
        type: 'failure',
        failure: fail(
          'selection',
          'Something you selected is no longer in the project. Select it again.',
        ),
      };
      return;
    }
    const blocked = (await d.check?.()) ?? null;
    if (blocked) {
      yield { type: 'failure', failure: blocked };
      return;
    }
    yield { type: 'state', state: 'thinking' };
    const scenes = new Set(found.map((f) => f.scene.id));
    const max = d.maxContextChars ?? 12000;
    const context = `SELECTION\n${found.map((f) => f.text).join('\n\n')}`.slice(
      0,
      max,
    );
    const system = fill(d.prompt(), {
      commands: EDIT_COMMANDS.join(', '),
      context,
    });
    let credits = 0;
    let answer = '';
    let errors: string[] = [];
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const user =
          attempt === 0
            ? text
            : `${text}\n\nYour previous answer:\n${answer.slice(0, 8000)}\nIt failed these checks:\n${errors.map((e) => `- ${e}`).join('\n')}\nFix exactly these problems and answer with the same JSON shape.`;
        const r = await d.ask({
          system,
          user,
          maxOutputTokens: 2000,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        credits += r.credits;
        answer = r.text;
        if (input.signal?.aborted) {
          yield { type: 'failure', failure: fail('cancelled', 'Stopped.') };
          return;
        }
        let raw: unknown;
        try {
          raw = firstJson(answer);
        } catch (e) {
          errors = [(e as Error).message];
          continue;
        }
        const checked = checkCommands(d.engine, raw, scenes);
        if (!checked.ok) {
          errors = checked.errors.slice(0, 20);
          continue;
        }
        const id = newId();
        proposals.set(id, {
          commands: checked.commands,
          summary: checked.summary,
          base: d.engine.state,
        });
        yield {
          type: 'proposal',
          id,
          summary: { en: checked.summary },
          credits,
          commandCount: checked.commands.length,
        };
        yield { type: 'state', state: 'idle' };
        yield { type: 'done' };
        return;
      }
    } catch (e) {
      yield {
        type: 'failure',
        failure: {
          code: (e as { code?: string }).code ?? 'model-failed',
          message: {
            en: (e as Error).message || 'The model could not answer.',
          },
        },
      };
      return;
    }
    yield {
      type: 'failure',
      failure: fail(
        'bad-edit',
        'Director could not turn that into a safe edit. Try saying it another way.',
        'Director इसे सुरक्षित बदलाव में नहीं बदल सका। दूसरे तरीक़े से कहें।',
      ),
    };
  }

  return {
    send,
    async apply(proposalId): Promise<Result<true>> {
      const p = proposals.get(proposalId);
      if (!p)
        return {
          ok: false,
          failure: fail(
            'proposal-unknown',
            'That change is no longer available.',
          ),
        };
      proposals.delete(proposalId);
      if (d.engine.state !== p.base) {
        // The project changed since the proposal: check it again first.
        try {
          d.engine.preview(p.commands);
        } catch {
          return {
            ok: false,
            failure: fail(
              'proposal-stale',
              'The project changed since this suggestion. Ask again.',
            ),
          };
        }
      }
      try {
        d.engine.commands.transaction(
          p.summary.slice(0, 80) || 'Director edit',
          p.commands,
        );
      } catch (e) {
        return {
          ok: false,
          failure: fail(
            'apply-failed',
            (e as Error).message || 'The change could not be made.',
          ),
        };
      }
      return { ok: true, value: true };
    },
    discard(proposalId) {
      proposals.delete(proposalId);
    },
    /**
     * ROUND-B: the commands of an open proposal, so AI mode can preview
     * them on the canvas before Apply (not part of the frozen contract).
     */
    commandsOf(proposalId: string): readonly EditorCommand[] | null {
      return proposals.get(proposalId)?.commands ?? null;
    },
  } as EditorChatEngine;
}

/**
 * A ModelAsk through the gateway server (POST /v1/run): the server reserves,
 * calls the model and settles, so each call is charged like any other.
 */
export function remoteAsk(o: {
  readonly base: string;
  readonly token: () => Promise<string | null> | string | null;
  readonly modelId: string;
  readonly role?: string;
  readonly maxCredits: number;
  readonly fetch?: typeof fetch;
}): ModelAsk {
  let n = 0;
  return async (req) => {
    const token = await o.token();
    const res = await (o.fetch ?? fetch)(
      `${o.base.replace(/\/$/, '')}/v1/run`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          role: o.role ?? 'write',
          modelId: o.modelId,
          request: {
            system: req.system,
            messages: [{ role: 'user', content: req.user }],
            json: true,
            maxOutputTokens: req.maxOutputTokens,
          },
          key: `edit-${Date.now().toString(36)}-${++n}`,
          maxCredits: o.maxCredits,
        }),
        ...(req.signal ? { signal: req.signal } : {}),
      },
    );
    const body = (await res.json().catch(() => null)) as {
      result?: { text?: string };
      credits?: number;
      error?: { code?: string; message?: string };
    } | null;
    if (!res.ok || !body?.result)
      throw Object.assign(
        new Error(body?.error?.message ?? 'The model service had a problem.'),
        { code: body?.error?.code ?? 'provider-error' },
      );
    return { text: body.result.text ?? '', credits: body.credits ?? 0 };
  };
}
