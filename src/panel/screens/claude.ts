// ROUND-C2: the panel's side of the Claude connector.
// - `#/connect-claude?request=…`: the consent page OAuth sends the person to
//   (they are already signed in here): one screen, Allow or Cancel, then back
//   to Claude.
// - Door 4 (Part 6): "Create with your own Claude" in the New project and
//   New video dialogs.
// - The "Made with Claude" tag and Claude's activity (Part 3).
import { h, clear } from '../dom';
import type { Ctx, Screen } from '../app';
import { t } from '../strings';

/** The query part of the hash route (`#/name?x=y`). */
const hashQuery = () => new URLSearchParams(location.hash.split('?')[1] ?? '');

export const connectClaudeScreen: Screen = async (ctx, _args, out) => {
  const box = h('section', {
    class: 'card claude-consent',
    id: 'claude-consent',
  });
  out.append(box);
  const remote = ctx.s.remote;
  const request = hashQuery().get('request') ?? '';
  const fail = (key: Parameters<typeof t>[0]) =>
    clear(box, h('p', { class: 'error-state', role: 'alert', text: t(key) }));
  if (!remote) return fail('claude.needsServer');
  clear(box, h('p', { class: 'loading', text: t('app.loading') }));
  let info: { client: string; redirectHost: string };
  try {
    info = await remote.api<{ client: string; redirectHost: string }>(
      `/mcp/consent?request=${encodeURIComponent(request)}`,
    );
  } catch {
    return fail('claude.consentExpired');
  }
  const answer = async (allow: boolean) => {
    for (const b of box.querySelectorAll('button')) b.disabled = true;
    status.textContent = t('claude.sending');
    try {
      const r = await remote.api<{ redirect: string }>('/mcp/consent', {
        request,
        allow,
      });
      location.assign(r.redirect);
    } catch {
      fail('claude.consentExpired');
    }
  };
  const status = h('p', { class: 'muted', role: 'status' });
  clear(
    box,
    h('h1', { text: t('claude.consentTitle') }),
    h('p', { text: t('claude.consentBody', { client: info.client }) }),
    h('p', {
      class: 'muted',
      id: 'claude-consent-host',
      text: t('claude.consentBack', { host: info.redirectHost }),
    }),
    h(
      'div',
      { class: 'row' },
      h('button', {
        class: 'button primary',
        id: 'claude-allow',
        type: 'button',
        text: t('claude.allow'),
        onclick: () => void answer(true),
      }),
      h('button', {
        class: 'button ghost',
        id: 'claude-cancel',
        type: 'button',
        text: t('claude.cancel'),
        onclick: () => void answer(false),
      }),
    ),
    status,
  );
};

/** The "Made with Claude" tag (design tokens in panel CSS). */
export const madeWithClaude = () =>
  h('span', {
    class: 'claude-tag',
    'data-claude-tag': '',
    text: t('claude.madeWith'),
  });

/** Claude's workspace as the server keeps it (names, origin, activity). */
export interface ClaudeWorkspace {
  readonly projects: readonly {
    id: string;
    name: string;
    origin: 'claude' | 'panel';
    videos: readonly {
      id: string;
      name: string;
      origin: 'claude' | 'panel';
      built: boolean;
      activity: readonly { at: string; text: string; by: string }[];
    }[];
  }[];
}
export async function claudeWorkspace(
  ctx: Pick<Ctx, 's'>,
): Promise<ClaudeWorkspace | null> {
  try {
    return (await ctx.s.remote?.api<ClaudeWorkspace>('/mcp/workspace')) ?? null;
  } catch {
    return null;
  }
}
