// P3U: the audit log with its chain check. A broken chain is shown loudly.
import { h, clear } from '../../panel/dom';
import type { AuditRow } from '../../contracts/p3';
import { at } from '../strings';
import { empty, failure, whenTime } from '../ui';
import { errorText, type AdminScreen } from './common';

const detailText = (d: AuditRow['detail']) =>
  Object.entries(d)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

export const auditScreen: AdminScreen = async (ctx, _args, out) => {
  const tbody = h('tbody', { id: 'ad-audit-rows' });
  const chain = h('div', { class: 'ad-chain', id: 'ad-chain', role: 'status' });
  const more = h('button', {
    type: 'button',
    class: 'button sm',
    id: 'ad-audit-more',
    text: at('ad.audit.more'),
    hidden: true,
  });
  const status = h('div');
  let action = '';
  let cursor: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const load = async (reset: boolean) => {
    if (reset) {
      cursor = null;
      clear(tbody);
    }
    try {
      const r = await ctx.s.client.audit({
        ...(action ? { action } : {}),
        ...(cursor ? { cursor } : {}),
      });
      chain.className = `ad-chain ${r.chainOk ? 'ok' : 'bad'}`;
      chain.textContent = r.chainOk
        ? `✓ ${at('ad.audit.ok')}`
        : `⚠ ${at('ad.audit.bad')}`;
      for (const row of r.rows)
        tbody.append(
          h(
            'tr',
            { 'data-seq': String(row.seq) },
            h('td', { class: 'mono muted', text: String(row.seq) }),
            h('td', { class: 'muted', text: whenTime(row.at) }),
            h('td', { text: row.actor }),
            h(
              'td',
              null,
              h('span', { class: 'ad-pill mute mono', text: row.action }),
            ),
            h('td', { class: 'mono', text: row.target }),
            h('td', { class: 'ad-detail', text: detailText(row.detail) }),
          ),
        );
      cursor = r.next;
      more.hidden = !r.next;
      clear(status, tbody.children.length ? null : empty(at('ad.audit.empty')));
    } catch (e) {
      clear(
        status,
        failure(errorText(e), () => void load(true)),
      );
    }
  };
  more.addEventListener('click', () => void load(false));

  clear(
    out,
    h('div', { class: 'ad-head' }, h('h1', { text: at('ad.audit.title') })),
    h('p', { class: 'lead', text: at('ad.audit.lead') }),
    chain,
    h(
      'div',
      { class: 'ad-filters' },
      h('input', {
        type: 'search',
        id: 'ad-audit-filter',
        placeholder: at('ad.audit.filter'),
        'aria-label': at('ad.audit.filter'),
        oninput: (e: Event) => {
          action = (e.target as HTMLInputElement).value.trim();
          clearTimeout(timer);
          timer = setTimeout(() => void load(true), 150);
        },
      }),
    ),
    h(
      'div',
      { class: 'ad-card flush' },
      h(
        'table',
        { class: 'ad-table', id: 'ad-audit' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { text: at('ad.audit.seq') }),
            h('th', { text: at('ad.audit.at') }),
            h('th', { text: at('ad.audit.actor') }),
            h('th', { text: at('ad.audit.action') }),
            h('th', { text: at('ad.audit.target') }),
            h('th', { text: at('ad.audit.detail') }),
          ),
        ),
        tbody,
      ),
      status,
    ),
    h('div', { class: 'ad-more' }, more),
  );
  await load(true);
};
