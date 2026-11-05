// P3U: people list and one person's page. Every change asks for a reason and
// is written to the audit log by the client; the screen never edits a number
// itself, it asks the client and shows what came back.
import { h, clear } from '../../panel/dom';
import type { AdminUserRow } from '../../contracts/p3';
import { at } from '../strings';
import {
  askReason,
  empty,
  failure,
  initials,
  money,
  num,
  openDialog,
  when,
  whenTime,
} from '../ui';
import { errorText, type AdminCtx, type AdminScreen } from './common';

const PLANS = ['free', 'pro', 'studio'];

const status = (r: Pick<AdminUserRow, 'suspended'>) =>
  h('span', {
    class: `ad-pill ${r.suspended ? 'bad' : 'ok'}`,
    text: r.suspended ? at('ad.users.suspended') : at('ad.users.active'),
  });
const planPill = (id: string) =>
  h('span', { class: `ad-pill plan-${id}`, text: id });

export const usersScreen: AdminScreen = async (ctx, args, out) => {
  if (args[0]) return userScreen(ctx, args[0], out);
  const q: { search?: string; planId?: string; flag?: string } = {};
  // Flag deep link from the Flags page: #/users//beta-chat is not needed; a
  // query is kept in the hash as `users?flag=beta-chat`.
  const flagArg = new URLSearchParams(location.hash.split('?')[1] ?? '').get(
    'flag',
  );
  if (flagArg) q.flag = flagArg;

  const tbody = h('tbody', { id: 'ad-user-rows' });
  const more = h('button', {
    type: 'button',
    class: 'button sm',
    id: 'ad-user-more',
    text: at('ad.users.more'),
    hidden: true,
  });
  const count = h('span', { class: 'muted', id: 'ad-user-count' });
  const status$ = h('div', { class: 'ad-list-status' });
  let cursor: string | null = null;
  let shown = 0;
  let token = 0;

  const load = async (reset: boolean) => {
    const mine = ++token;
    if (reset) {
      cursor = null;
      shown = 0;
      clear(tbody);
    }
    try {
      const r = await ctx.s.client.users({
        ...q,
        ...(cursor ? { cursor } : {}),
      });
      if (mine !== token) return;
      clear(status$);
      for (const row of r.rows) {
        shown++;
        tbody.append(
          h(
            'tr',
            { 'data-user': row.userId, tabindex: 0 },
            h(
              'td',
              null,
              h(
                'a',
                { class: 'ad-person', href: `#/users/${row.userId}` },
                h('span', {
                  class: 'ad-avatar',
                  'aria-hidden': 'true',
                  text: initials(row.email),
                }),
                h('span', { text: row.email }),
              ),
            ),
            h('td', null, planPill(row.planId)),
            h('td', { class: 'num', text: num(row.credits) }),
            h('td', null, status(row)),
            h('td', { class: 'muted', text: when(row.lastSeenAt) }),
          ),
        );
      }
      cursor = r.next;
      more.hidden = !r.next;
      count.textContent = at('ad.users.count', { n: shown });
      if (!shown) clear(status$, empty(at('ad.users.empty')));
    } catch (e) {
      if (mine === token)
        clear(
          status$,
          failure(errorText(e), () => void load(true)),
        );
    }
  };
  more.addEventListener('click', () => void load(false));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const planSel = h(
    'select',
    {
      id: 'ad-filter-plan',
      'aria-label': at('ad.users.plan'),
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v) q.planId = v;
        else delete q.planId;
        void load(true);
      },
    },
    h('option', { value: '', text: at('ad.users.allPlans') }),
    ...PLANS.map((p) => h('option', { value: p, text: p })),
  );
  const flags = await ctx.s.client.flags().catch(() => []);
  const flagSel = h(
    'select',
    {
      id: 'ad-filter-flag',
      'aria-label': at('ad.user.flags'),
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v) q.flag = v;
        else delete q.flag;
        void load(true);
      },
    },
    h('option', { value: '', text: at('ad.users.allFlags') }),
    ...flags.map((f) => h('option', { value: f.flag, text: f.flag })),
  );
  if (q.flag) flagSel.value = q.flag;

  clear(
    out,
    h(
      'div',
      { class: 'ad-head' },
      h('h1', { text: at('ad.users.title') }),
      count,
    ),
    h(
      'div',
      { class: 'ad-filters' },
      h('input', {
        type: 'search',
        id: 'ad-search',
        placeholder: at('ad.users.search'),
        'aria-label': at('ad.users.search'),
        oninput: (e: Event) => {
          const v = (e.target as HTMLInputElement).value.trim();
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (v) q.search = v;
            else delete q.search;
            void load(true);
          }, 150);
        },
      }),
      planSel,
      flagSel,
    ),
    h(
      'div',
      { class: 'ad-card flush' },
      h(
        'table',
        { class: 'ad-table', id: 'ad-users' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { text: at('ad.users.email') }),
            h('th', { text: at('ad.users.plan') }),
            h('th', { class: 'num', text: at('ad.users.credits') }),
            h('th', { text: at('ad.users.status') }),
            h('th', { text: at('ad.users.seen') }),
          ),
        ),
        tbody,
      ),
      status$,
    ),
    h('div', { class: 'ad-more' }, more),
  );
  await load(true);
};

async function userScreen(ctx: AdminCtx, id: string, out: HTMLElement) {
  const back = h('a', {
    class: 'ad-back',
    href: '#/users',
    text: `← ${at('ad.user.back')}`,
  });
  clear(out, back, h('p', { class: 'loading', text: at('ad.loading') }));
  const render = async () => {
    try {
      const u = await ctx.s.client.user(id);
      const allFlags = await ctx.s.client.flags();
      const run = async (done: string, f: () => Promise<void>) => {
        try {
          await f();
          ctx.toast(done);
          await render();
        } catch (e) {
          ctx.toast(errorText(e), 'error');
        }
      };

      const adjust = async () => {
        const res = await openDialog<{ delta: number; reason: string }>({
          title: at('ad.user.adjust'),
          body: (ready) => {
            let delta = 0;
            let reason = '';
            const after = h('p', { class: 'muted', id: 'ad-after' });
            const upd = () => {
              const ok = Number.isInteger(delta) && delta !== 0;
              after.textContent = ok
                ? at('ad.dlg.after', { n: u.credits + delta })
                : '';
              if (!ok)
                return ready(null, delta === 0 ? '' : at('ad.dlg.deltaBad'));
              if (u.credits + delta < 0)
                return ready(null, at('ad.dlg.deltaBad'));
              ready(reason ? { delta, reason } : null);
            };
            return [
              h(
                'label',
                { class: 'ad-field' },
                h('span', { text: at('ad.dlg.delta') }),
                h('input', {
                  type: 'number',
                  id: 'ad-delta',
                  step: 1,
                  oninput: (e: Event) => {
                    delta = Number((e.target as HTMLInputElement).value);
                    upd();
                  },
                }),
              ),
              after,
              h(
                'label',
                { class: 'ad-field' },
                h('span', { text: at('ad.dlg.reason') }),
                h('textarea', {
                  id: 'ad-reason',
                  rows: 2,
                  oninput: (e: Event) => {
                    reason = (e.target as HTMLTextAreaElement).value.trim();
                    upd();
                  },
                }),
              ),
            ];
          },
        });
        if (res)
          await run(at('ad.done.credits'), () =>
            ctx.s.client.adjustCredits(id, res.delta, res.reason),
          );
      };

      const changePlan = async () => {
        const res = await openDialog<{ plan: string; reason: string }>({
          title: at('ad.user.changePlan'),
          body: (ready) => {
            let plan = u.planId;
            let reason = '';
            const upd = () =>
              ready(reason && plan !== u.planId ? { plan, reason } : null);
            return [
              h(
                'label',
                { class: 'ad-field' },
                h('span', { text: at('ad.dlg.plan') }),
                h(
                  'select',
                  {
                    id: 'ad-plan',
                    onchange: (e: Event) => {
                      plan = (e.target as HTMLSelectElement).value;
                      upd();
                    },
                  },
                  ...PLANS.map((p) =>
                    h('option', {
                      value: p,
                      text: p,
                      selected: p === u.planId,
                    }),
                  ),
                ),
              ),
              h(
                'label',
                { class: 'ad-field' },
                h('span', { text: at('ad.dlg.reason') }),
                h('textarea', {
                  id: 'ad-reason',
                  rows: 2,
                  oninput: (e: Event) => {
                    reason = (e.target as HTMLTextAreaElement).value.trim();
                    upd();
                  },
                }),
              ),
            ];
          },
        });
        if (res)
          await run(at('ad.done.plan'), () =>
            ctx.s.client.setPlan(id, res.plan, res.reason),
          );
      };

      const suspend = async () => {
        const reason = await askReason(
          u.suspended ? at('ad.user.unsuspend') : at('ad.user.suspend'),
          () => [],
          u.suspended ? {} : { danger: true },
        );
        if (reason)
          await run(at('ad.done.suspend'), () =>
            ctx.s.client.setSuspended(id, !u.suspended, reason),
          );
      };

      const refund = async (paymentId: string) => {
        const res = await openDialog<{ revoke: boolean; reason: string }>({
          title: at('ad.user.refund'),
          danger: true,
          body: (ready) => {
            let revoke = true;
            let reason = '';
            const upd = () => ready(reason ? { revoke, reason } : null);
            return [
              h('p', { class: 'muted', text: at('ad.dlg.refundAmount') }),
              h(
                'label',
                { class: 'ad-check' },
                h('input', {
                  type: 'checkbox',
                  id: 'ad-revoke',
                  checked: true,
                  onchange: (e: Event) => {
                    revoke = (e.target as HTMLInputElement).checked;
                    upd();
                  },
                }),
                h('span', { text: at('ad.dlg.revoke') }),
              ),
              h(
                'label',
                { class: 'ad-field' },
                h('span', { text: at('ad.dlg.reason') }),
                h('textarea', {
                  id: 'ad-reason',
                  rows: 2,
                  oninput: (e: Event) => {
                    reason = (e.target as HTMLTextAreaElement).value.trim();
                    upd();
                  },
                }),
              ),
            ];
          },
        });
        if (res)
          await run(at('ad.done.refund'), () =>
            ctx.s.client.refund(paymentId, null, res.reason, res.revoke),
          );
      };

      const flagBox = h(
        'div',
        { class: 'ad-flags', id: 'ad-user-flags' },
        ...allFlags.map((f) => {
          const on = u.flags.includes(f.flag);
          return h(
            'button',
            {
              type: 'button',
              class: `ad-flag${on ? ' on' : ''}`,
              'data-flag': f.flag,
              'aria-pressed': String(on),
              title: f.description,
              onclick: () =>
                void run(at('ad.done.flag'), () =>
                  ctx.s.client.setFlag(id, f.flag, !on),
                ),
            },
            h('span', { class: 'dot', 'aria-hidden': 'true' }),
            f.flag,
          );
        }),
      );

      clear(
        out,
        back,
        h(
          'header',
          { class: 'ad-person-head' },
          h('span', {
            class: 'ad-avatar lg',
            'aria-hidden': 'true',
            text: initials(u.email),
          }),
          h(
            'div',
            { class: 'ad-person-id' },
            h('h1', { id: 'ad-user-email', text: u.email }),
            h(
              'div',
              { class: 'ad-person-meta' },
              planPill(u.planId),
              status(u),
              h('span', {
                class: 'muted',
                text: `${at('ad.users.joined')} ${when(u.createdAt)}`,
              }),
              h('span', {
                class: 'muted',
                text: `${at('ad.users.seen')} ${when(u.lastSeenAt)}`,
              }),
            ),
          ),
          h(
            'div',
            { class: 'ad-balance' },
            h('span', { class: 'ad-kpi-label', text: at('ad.user.balance') }),
            h('strong', { id: 'ad-user-credits', text: num(u.credits) }),
          ),
        ),
        u.suspended
          ? h('p', {
              class: 'ad-note warn',
              role: 'status',
              text: at('ad.user.suspendedNote'),
            })
          : null,
        h(
          'div',
          { class: 'ad-actions' },
          h('button', {
            type: 'button',
            class: 'button primary',
            id: 'ad-adjust',
            text: at('ad.user.adjust'),
            onclick: () => void adjust(),
          }),
          h('button', {
            type: 'button',
            class: 'button',
            id: 'ad-plan-btn',
            text: at('ad.user.changePlan'),
            onclick: () => void changePlan(),
          }),
          h('button', {
            type: 'button',
            class: `button${u.suspended ? '' : ' danger-ghost'}`,
            id: 'ad-suspend',
            text: u.suspended ? at('ad.user.unsuspend') : at('ad.user.suspend'),
            onclick: () => void suspend(),
          }),
        ),
        h(
          'section',
          { class: 'ad-card' },
          h('h2', { text: at('ad.user.flags') }),
          flagBox,
        ),
        h(
          'div',
          { class: 'ad-two' },
          h(
            'section',
            { class: 'ad-card flush' },
            h('h2', { class: 'pad', text: at('ad.user.ledger') }),
            h(
              'table',
              { class: 'ad-table', id: 'ad-ledger' },
              h(
                'tbody',
                null,
                ...u.ledger.map((l) =>
                  h(
                    'tr',
                    { 'data-key': l.key },
                    h('td', { class: 'muted', text: whenTime(l.at) }),
                    h('td', { text: l.reason }),
                    h('td', {
                      class: `num ${l.delta < 0 ? 'neg' : 'pos'}`,
                      text: `${l.delta > 0 ? '+' : ''}${num(l.delta)}`,
                    }),
                  ),
                ),
              ),
            ),
          ),
          h(
            'section',
            { class: 'ad-card flush' },
            h('h2', { class: 'pad', text: at('ad.user.payments') }),
            u.payments.length
              ? h(
                  'table',
                  { class: 'ad-table', id: 'ad-payments' },
                  h(
                    'tbody',
                    null,
                    ...u.payments.map((p) =>
                      h(
                        'tr',
                        { 'data-payment': p.paymentId },
                        h('td', { class: 'muted', text: whenTime(p.at) }),
                        h('td', { text: `${money(p.amount)} · ${p.provider}` }),
                        h(
                          'td',
                          null,
                          h('span', {
                            class: `ad-pill ${p.status === 'paid' ? 'ok' : 'mute'}`,
                            text: p.status,
                          }),
                        ),
                        h(
                          'td',
                          { class: 'num' },
                          p.status === 'paid'
                            ? h('button', {
                                type: 'button',
                                class: 'button sm danger-ghost',
                                'data-refund': p.paymentId,
                                text: at('ad.user.refund'),
                                onclick: () => void refund(p.paymentId),
                              })
                            : null,
                        ),
                      ),
                    ),
                  ),
                )
              : empty(at('ad.user.noPayments')),
          ),
        ),
      );
    } catch (e) {
      clear(
        out,
        back,
        failure(errorText(e), () => void render()),
      );
    }
  };
  await render();
}
