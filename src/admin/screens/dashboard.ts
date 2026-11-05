// P3U: the dashboard: revenue, credits, provider cost, margin, people, a
// daily chart and the cost by model. The owner chooses the range.
import { h, clear } from '../../panel/dom';
import type { AdminMetrics } from '../../contracts/p3';
import { at } from '../strings';
import { failure, money, num, seriesChart, usd } from '../ui';
import { errorText, type AdminScreen } from './common';

/** Rupees per US dollar used for the margin estimate (a display rate). */
const INR_PER_USD = 84;

const kpi = (id: string, label: string, value: string, note?: string) =>
  h(
    'div',
    { class: 'ad-kpi', 'data-kpi': id },
    h('span', { class: 'ad-kpi-label', text: label }),
    h('strong', { class: 'ad-kpi-value', text: value }),
    note ? h('span', { class: 'ad-kpi-note', text: note }) : null,
  );

function toUsd(m: AdminMetrics): number {
  return m.revenue.reduce(
    (a, r) =>
      a +
      (r.currency === 'USD'
        ? r.amountMinor / 100
        : r.amountMinor / 100 / INR_PER_USD),
    0,
  );
}

export const dashboardScreen: AdminScreen = async (ctx, args, out) => {
  const days = [7, 30, 90].includes(Number(args[0])) ? Number(args[0]) : 30;
  const body = h('div', { class: 'ad-dash', 'aria-busy': 'true' });
  const range = h(
    'div',
    { class: 'seg-group', role: 'radiogroup', id: 'ad-range' },
    ...([7, 30, 90] as const).map((d) =>
      h('button', {
        type: 'button',
        class: `seg${d === days ? ' on' : ''}`,
        role: 'radio',
        'aria-checked': String(d === days),
        'data-days': String(d),
        text: at(`ad.dash.range${d}` as 'ad.dash.range7'),
        onclick: () => ctx.go(`dashboard/${d}`),
      }),
    ),
  );
  clear(
    out,
    h(
      'div',
      { class: 'ad-head' },
      h('h1', { text: at('ad.dash.title') }),
      range,
    ),
    body,
  );
  const to = new Date();
  const from = new Date(to.getTime() - days * 864e5);
  try {
    const m = await ctx.s.client.metrics({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const revenueUsd = toUsd(m);
    const margin = revenueUsd - m.providerCostUsd;
    const pct = revenueUsd > 0 ? Math.round((margin / revenueUsd) * 100) : 0;
    body.setAttribute('aria-busy', 'false');
    clear(
      body,
      h(
        'div',
        { class: 'ad-kpis' },
        kpi(
          'revenue',
          at('ad.dash.revenue'),
          m.revenue.map(money).join(' + ') || '—',
        ),
        kpi('sold', at('ad.dash.sold'), num(m.creditsSold)),
        kpi('spent', at('ad.dash.spent'), num(m.creditsSpent)),
        kpi('cost', at('ad.dash.cost'), usd(m.providerCostUsd)),
        kpi(
          'margin',
          at('ad.dash.margin'),
          `${pct}%`,
          at('ad.dash.marginNote', { rate: INR_PER_USD }),
        ),
        kpi('new', at('ad.dash.newUsers'), num(m.newUsers)),
        kpi('active', at('ad.dash.active'), num(m.activeUsers)),
      ),
      h(
        'section',
        { class: 'ad-card' },
        h('h2', { text: at('ad.dash.chart') }),
        seriesChart(m.series, at('ad.dash.chart')),
      ),
      h(
        'section',
        { class: 'ad-card' },
        h('h2', { text: at('ad.dash.byModel') }),
        h(
          'table',
          { class: 'ad-table', id: 'ad-models' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { text: at('ad.dash.model') }),
              h('th', { class: 'num', text: at('ad.dash.calls') }),
              h('th', { class: 'num', text: at('ad.dash.credits') }),
              h('th', { class: 'num', text: at('ad.dash.costUsd') }),
            ),
          ),
          h(
            'tbody',
            null,
            ...m.byModel.map((r) =>
              h(
                'tr',
                { 'data-model': r.modelId },
                h('td', { class: 'mono', text: r.modelId }),
                h('td', { class: 'num', text: num(r.calls) }),
                h('td', { class: 'num', text: num(r.credits) }),
                h('td', { class: 'num', text: usd(r.costUsd) }),
              ),
            ),
          ),
        ),
      ),
    );
  } catch (e) {
    clear(
      body,
      failure(errorText(e), () => ctx.go(`dashboard/${days}`)),
    );
  }
};
