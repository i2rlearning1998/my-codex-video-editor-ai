// P3-INTEGRATION: the editor chat on the REAL services. Editor-side code: it
// talks to the gateway server over HTTP only and imports no panel, Director
// or admin code. The server decides the limits and charges every call; the
// engine (src/editor-chat) validates and applies the proposed commands.
import type { EditorChatEngine } from '../contracts/p3';
import {
  createEditorChatEngine,
  remoteAsk,
  type EditorChatDeps,
} from './index';

const FALLBACK_PROMPT =
  'You edit a video project. Answer with JSON {"summary": string, "commands": [...]} using only these commands: {{commands}}. Context: {{context}}';

interface ServerConfig {
  readonly director?: {
    readonly roles?: { readonly write?: string };
    readonly prompts?: { readonly edit?: string };
  };
  readonly p3?: {
    readonly chat?: {
      readonly enabled?: boolean;
      readonly maxMessagesPerDay?: number;
    };
  };
}
interface ServerModel {
  readonly id: string;
  readonly roles: readonly string[];
  readonly recommended?: boolean;
  readonly connected: boolean;
  readonly mock?: boolean;
  readonly tier?: string;
}

export interface RealChat {
  readonly engine: EditorChatEngine;
  /** The owner's on/off and daily limit (read from the live config). */
  readonly settings: () => { enabled: boolean; maxMessagesPerDay: number };
}

/** null when the server cannot be reached or no connected model can edit. */
export async function createRealEditorChat(o: {
  readonly base: string;
  readonly token: () => Promise<string>;
  readonly engine: EditorChatDeps['engine'];
  readonly sceneId: () => string;
  readonly fetch?: typeof fetch;
}): Promise<RealChat | null> {
  const f = o.fetch ?? fetch;
  const root = o.base.replace(/\/+$/, '') + '/v1';
  const get = async <T>(path: string, auth: boolean): Promise<T | null> => {
    try {
      const res = await f(root + path, {
        headers: auth ? { authorization: `Bearer ${await o.token()}` } : {},
      });
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const live = await get<{ config: ServerConfig }>('/config', false);
  const models = await get<{ models: ServerModel[] }>('/models', true);
  if (!live || !models) return null;
  const role = live.config.director?.roles?.write ?? 'write';
  const usable = models.models.filter(
    (m) => m.connected && m.roles.includes(role),
  );
  // A real, connected model: the recommended one first.
  const real = usable.filter((m) => !m.mock);
  const model =
    real.find((m) => m.recommended) ??
    real[0] ??
    usable.find((m) => m.recommended) ??
    usable[0];
  if (!model) return null;
  const chat = live.config.p3?.chat;
  const check: NonNullable<EditorChatDeps['check']> = async () => {
    try {
      const res = await f(`${root}/entitlements/check`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${await o.token()}`,
        },
        body: JSON.stringify({ action: 'chat-message' }),
      });
      const out = (await res.json().catch(() => null)) as {
        ok: boolean;
        failure?: import('../contracts/p3').P3Failure;
      } | null;
      if (res.ok && out?.ok) return null;
      return (
        out?.failure ?? {
          code: 'unreachable',
          message: { en: 'The chat could not be checked. Try again.' },
        }
      );
    } catch {
      // A server that cannot be reached must not let a limit pass.
      return {
        code: 'unreachable',
        message: { en: 'The server could not be reached.' },
      };
    }
  };
  return {
    engine: createEditorChatEngine({
      engine: o.engine,
      sceneId: o.sceneId,
      prompt: () => live.config.director?.prompts?.edit ?? FALLBACK_PROMPT,
      check,
      ask: remoteAsk({
        base: o.base,
        token: o.token,
        modelId: model.id,
        role,
        maxCredits: 40,
        fetch: f,
      }),
    }),
    settings: () => ({
      enabled: chat?.enabled ?? true,
      maxMessagesPerDay: chat?.maxMessagesPerDay ?? 50,
    }),
  };
}
