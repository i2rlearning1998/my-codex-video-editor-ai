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

/** Where Claude's connector settings open (a new tab). */
export const CLAUDE_CONNECTORS_URL = 'https://claude.ai/settings/connectors';
/** The skill and plugin bundles (npm run mcp:bundle), served by the server. */
export const BUNDLES = [
  ['video-director.zip', 'claude.bundleSkill'],
  ['setup.zip', 'claude.bundleSetup'],
  ['video-director-plugin.zip', 'claude.bundlePlugin'],
] as const;

/**
 * Door 4 (Part 6): "Create with your own Claude". Step 1 copies the
 * connector address and opens Claude's connector settings; Step 2 (Allow)
 * happens on the consent page when Claude connects. Then: Connected or
 * Not connected, last used, Disconnect; the skill and plugin; three lines
 * to paste into Claude.
 */
export function claudeDoor(ctx: Ctx, gatewayUrl: string): HTMLElement {
  const remote = ctx.s.remote;
  const box = h('section', {
    class: 'card claude-door',
    id: 'claude-door',
    'aria-live': 'polite',
  });
  const state = h('div', { class: 'claude-state', id: 'claude-state' });
  const copyBtn = h('button', {
    type: 'button',
    class: 'button primary',
    id: 'claude-copy',
    text: t('claude.copy'),
    disabled: true,
  });
  const draw = async () => {
    if (!remote) {
      clear(
        state,
        h('p', { class: 'error-state', text: t('claude.needsServer') }),
      );
      return;
    }
    clear(state, h('p', { class: 'loading', text: t('app.loading') }));
    let r: {
      address: string;
      connections: { id: string; client: string; lastUsedAt: string | null }[];
    };
    try {
      r = await remote.api('/mcp/connections');
    } catch {
      clear(
        state,
        h('p', {
          class: 'error-state',
          role: 'alert',
          text: t('claude.statusError'),
        }),
        h('button', {
          type: 'button',
          class: 'button sm ghost',
          id: 'claude-retry',
          text: t('claude.retry'),
          onclick: () => void draw(),
        }),
      );
      return;
    }
    copyBtn.disabled = false;
    copyBtn.onclick = async () => {
      await navigator.clipboard?.writeText(r.address).catch(() => undefined);
      copyBtn.textContent = t('claude.copied');
    };
    copyBtn.dataset.address = r.address;
    const live = r.connections[0];
    clear(
      state,
      live
        ? h(
            'div',
            { class: 'row' },
            h('strong', {
              id: 'claude-status',
              'data-connected': 'yes',
              text: t('claude.connected'),
            }),
            h('span', {
              class: 'muted',
              id: 'claude-last-used',
              text: live.lastUsedAt
                ? t('claude.lastUsed', {
                    when: new Date(live.lastUsedAt).toLocaleString(),
                  })
                : t('claude.neverUsed'),
            }),
            h('button', {
              type: 'button',
              class: 'button sm ghost',
              id: 'claude-disconnect',
              text: t('claude.disconnect'),
              onclick: async () => {
                await remote.api('/mcp/connections/revoke', {});
                ctx.toast(t('claude.disconnected'));
                await draw();
              },
            }),
          )
        : h('strong', {
            id: 'claude-status',
            'data-connected': 'no',
            text: t('claude.notConnected'),
          }),
    );
  };
  const base = gatewayUrl.replace(/\/$/, '');
  clear(
    box,
    h('h2', { text: t('claude.doorTitle') }),
    h('p', { class: 'muted', text: t('claude.doorBody') }),
    h('h3', { text: t('claude.step1') }),
    h('p', { text: t('claude.step1Body') }),
    h(
      'div',
      { class: 'row' },
      copyBtn,
      h('a', {
        class: 'button ghost',
        id: 'claude-open-settings',
        href: CLAUDE_CONNECTORS_URL,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: t('claude.openSettings'),
      }),
    ),
    h('h3', { text: t('claude.step2') }),
    h('p', { text: t('claude.step2Body') }),
    state,
    h('h3', { text: t('claude.bundle') }),
    remote
      ? h(
          'div',
          { class: 'row', id: 'claude-bundles' },
          ...BUNDLES.map(([file, key]) =>
            h('a', {
              class: 'button sm ghost',
              href: `${base}/mcp/bundle/${file}`,
              download: file,
              'data-bundle': file,
              text: t(key),
            }),
          ),
        )
      : null,
    h('p', { class: 'muted', text: t('claude.starters') }),
    h(
      'ul',
      { class: 'claude-starters', id: 'claude-starters' },
      h('li', { text: t('claude.starter1') }),
      h('li', { text: t('claude.starter2') }),
      h('li', { text: t('claude.starter3') }),
    ),
  );
  void draw();
  return box;
}
