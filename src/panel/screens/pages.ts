// P2-22, P2-23, P2-35 to P2-37: Home, Styles, Projects, Credits and Plan,
// Brand Kit, Settings and Learn. Content from the config; data through the
// services (ledger, account, project library).
import {
  canUse,
  enabledStyles,
  enabledStudios,
  learnItems,
  publicPlans,
  text as sayIn,
} from '../../platform-config';
import { paymentProviders } from '../../payments';
import { h, clear, put } from '../dom';
import type { Ctx, Screen } from '../app';
import { t, type Key } from '../strings';
import { planLines } from '../plan-lines';
import { card, empty, when } from './common';
import {
  newProject,
  newStyleForm,
  styleCards,
  syncWorkspace,
  tag,
} from './workspace';
import { posterArt } from '../art';
import { icon, studioIcon } from '../icons';
import { reel } from '../motion';
import { directorRoomScreen } from './director-room';
import { mineList } from './my-styles';

const styleCard = (ctx: Ctx, s: ReturnType<typeof enabledStyles>[number]) => {
  const plan = ctx.s.planOf(ctx.user.id);
  // P4: asked for from inside a project, the Style is used in that project.
  const project = new URLSearchParams(location.hash.split('?')[1] ?? '').get(
    'project',
  );
  const ok = canUse(plan, s.requires);
  const hint = s.priceHint;
  return h(
    'article',
    {
      class: 'poster style-card reveal',
      'data-style': s.id,
      'data-locked': String(!ok),
    },
    h(
      'div',
      { class: 'poster-in tilt glow' },
      posterArt(s, ctx.s.config),
      h('span', { class: 'poster-sheen', 'aria-hidden': 'true' }),
      h(
        'div',
        { class: 'poster-cap' },
        h('h3', { text: ctx.say(s.name) }),
        h('p', { class: 'poster-blurb', text: ctx.say(s.blurb) }),
        h('p', { class: 'formats', text: s.formats.join(' · ') }),
        hint && ctx.s.config.director.reveal.credits
          ? h('p', {
              class: 'price',
              text: t('styles.price', {
                min: hint.min,
                max: hint.max,
                per: hint.per,
              }),
            })
          : null,
        ok
          ? h(
              'a',
              {
                class: 'button primary sm',
                href: `#/brief/${s.id}${project ? `?project=${encodeURIComponent(project)}` : ''}`,
              },
              t('styles.use'),
            )
          : h(
              'a',
              { class: 'button sm', href: '#/credits', 'data-upgrade': s.id },
              icon('lock', 14),
              ` ${t('common.upgrade')}`,
            ),
      ),
    ),
  );
};

export const homeScreen: Screen = async (ctx, _a, out) => {
  const c = ctx.s.config;
  const plan = ctx.s.planOf(ctx.user.id);
  let projects: {
    id: string;
    name: string;
    thumb: string;
    origin: 'ai' | 'manual';
    waiting: boolean;
  }[] = [];
  try {
    projects = (await syncWorkspace(ctx))
      .filter((j) => !j.meta.trashedAt)
      .slice(0, 4)
      .map((j) => ({
        id: j.summary.id,
        name: j.summary.name,
        thumb: j.summary.thumb,
        origin: j.meta.origin,
        waiting: !!j.meta.pause,
      }));
  } catch {
    projects = [];
  }

  // The Styles reel: every Style as a poster you can drag.
  const view = h('div', {
    class: 'reel',
    id: 'style-reel',
    tabindex: '0',
    role: 'list',
    'aria-label': t('home.styles'),
  });
  put(view, ...enabledStyles(c).map((s) => styleCard(ctx, s)));
  const thumb = h('div', { class: 'reel-thumb' });
  const track = h('div', { class: 'reel-track' }, thumb);
  const count = h('span', { class: 'reel-count' });
  const rl = reel(view, { track, thumb, label: count });

  // Studio tools from the config.
  const tools = enabledStudios(c);
  const toolTile = (st: ReturnType<typeof enabledStudios>[number]) =>
    h(
      'a',
      {
        class: 'tool glow reveal',
        href: `#/studio/${st.id}`,
        'data-studio': st.id,
      },
      h(
        'span',
        { class: `tool-ico out-${st.output}` },
        icon(studioIcon(st.output)),
      ),
      h('span', { class: 'tool-name', text: ctx.say(st.name) }),
      st.blurb
        ? h('span', { class: 'tool-desc', text: ctx.say(st.blurb) })
        : null,
    );

  // Asset, brand and credits summary.
  const assets = ctx.s.assets(ctx.user.id).slice(-6).reverse();
  const kit = ctx.prefs().brandKit;
  const bal = ctx.s.ledger(ctx.user.id).balance();
  const monthly = Math.max(1, plan.monthlyCredits);
  const pct = Math.max(0, Math.min(100, Math.round((bal / monthly) * 100)));

  // Home is the Director room; everything below it is secondary and hides
  // once a chat has started (room.css).
  const below = h('div', { class: 'home-below' });
  put(
    below,
    h(
      'section',
      { class: 'band' },
      h(
        'div',
        { class: 'section-head' },
        h(
          'div',
          null,
          h('p', { class: 'eyebrow', text: t('home.drag') }),
          h('h2', { text: t('home.styles') }),
        ),
        h('a', {
          class: 'button sm',
          href: '#/styles',
          text: t('home.seeAll'),
        }),
      ),
      h(
        'div',
        { class: 'reel-wrap' },
        h(
          'button',
          {
            type: 'button',
            class: 'reel-arrow left',
            'aria-label': '←',
            onclick: () => rl.step(-1),
          },
          icon('arrowLeft'),
        ),
        view,
        h(
          'button',
          {
            type: 'button',
            class: 'reel-arrow right',
            'aria-label': '→',
            onclick: () => rl.step(1),
          },
          icon('arrowRight'),
        ),
      ),
      h('div', { class: 'reel-foot' }, track, count),
    ),
    h(
      'section',
      { class: 'band' },
      h(
        'div',
        { class: 'section-head' },
        h('h2', { text: t('home.continue') }),
        h('a', {
          class: 'button sm',
          href: '#/projects',
          text: t('home.seeAll'),
        }),
      ),
      h(
        'div',
        { class: 'films' },
        ...projects.map((p) =>
          h(
            'article',
            { class: 'film glow reveal', 'data-project': p.id },
            h(
              'div',
              { class: 'ws-thumb' },
              p.thumb
                ? h('img', { src: p.thumb, alt: '', class: 'thumb' })
                : h('div', { class: 'thumb' }),
              tag(p.origin),
            ),
            h(
              'div',
              { class: 'film-body' },
              h('h3', { text: p.name }),
              h(
                'a',
                {
                  class: 'button sm',
                  href: p.waiting
                    ? `#/assets-step/${encodeURIComponent(p.id)}`
                    : `/?open=${encodeURIComponent(p.id)}`,
                },
                p.waiting ? t('ws.waiting') : t('common.open'),
              ),
            ),
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'film new glow reveal',
            id: 'home-new-film',
            onclick: async () => {
              const id = await newProject(ctx, 'director');
              if (id) ctx.go(`room/${id}`);
            },
          },
          h('span', { class: 'plus' }, icon('plus', 24)),
          h('span', { text: t('home.newFilm') }),
        ),
      ),
      projects.length ? null : empty(t('home.noProjects')),
    ),
    tools.length
      ? h(
          'section',
          { class: 'band' },
          h(
            'div',
            { class: 'section-head' },
            h(
              'div',
              null,
              h('p', { class: 'eyebrow', text: t('home.studioSub') }),
              h('h2', { text: t('home.studioTitle') }),
            ),
            h('a', {
              class: 'button sm',
              href: '#/studio',
              text: t('home.seeAll'),
            }),
          ),
          h('div', { class: 'tools' }, tools.map(toolTile)),
        )
      : null,
    h(
      'section',
      { class: 'band trio' },
      h(
        'a',
        { class: 'glass glow reveal', href: '#/assets' },
        h('h3', { text: t('nav.assets') }),
        h(
          'div',
          { class: 'asset-strip' },
          ...(assets.length
            ? assets.map((a) =>
                a.kind === 'image' && a.dataUrl
                  ? h('img', { src: a.dataUrl, alt: '' })
                  : h('span', { class: 'asset-ico' }, icon(studioIcon(a.kind))),
              )
            : Array.from({ length: 6 }, () =>
                h('span', { class: 'asset-ico ghost', 'aria-hidden': 'true' }),
              )),
        ),
        h('p', { class: 'muted', text: t('home.assetsNote') }),
      ),
      h(
        'a',
        { class: 'glass glow reveal', href: '#/brand' },
        h('h3', { text: t('nav.brand') }),
        h(
          'div',
          { class: 'swatches' },
          ...(kit.colors.length
            ? kit.colors
                .slice(0, 5)
                .map((col) =>
                  h('span', { class: 'swatch', style: `background:${col}` }),
                )
            : Array.from({ length: 4 }, () =>
                h('span', { class: 'swatch ghost', 'aria-hidden': 'true' }),
              )),
        ),
        h('p', { class: 'muted', text: t('home.brandNote') }),
      ),
      h(
        'a',
        { class: 'glass glow reveal gold', href: '#/credits' },
        h('h3', { text: t('nav.credits') }),
        h(
          'div',
          { class: 'ring-row' },
          h(
            'div',
            { class: 'ring', style: `--pct:${pct}` },
            h('span', { text: String(bal) }),
          ),
          h('p', {
            class: 'muted',
            text: t('home.renews', { n: plan.monthlyCredits }),
          }),
        ),
      ),
    ),
    h(
      'section',
      { class: 'band' },
      h('h2', { text: t('home.learn') }),
      h(
        'ul',
        { class: 'list' },
        learnItems(c)
          .slice(0, 3)
          .map((l) =>
            h(
              'li',
              null,
              h('a', { href: l.url || '#/learn', text: ctx.say(l.title) }),
              h('span', {
                class: 'muted',
                text: ` · ${t('common.minutes', { n: l.minutes })}`,
              }),
            ),
          ),
      ),
    ),
  );
  await directorRoomScreen(ctx, [], out, {
    home: {
      greeting: t('home.hello', { name: ctx.prefs().name }),
      balance: t('home.balance', { n: bal, plan: ctx.say(plan.name) }),
    },
  });
  out.append(below);
};

export const stylesScreen: Screen = async (ctx, _a, out) => {
  const mineGrid = h('div', { class: 'grid', id: 'mine-strip' });
  const wsGrid = h('div', { class: 'grid', id: 'ws-styles' });
  const wsHost = h('div', { class: 'ws-notices' });
  const paintWs = () => styleCards(ctx, wsGrid, wsHost);
  const c = ctx.s.config;
  const plan = ctx.s.planOf(ctx.user.id);
  let q = '';
  let format = '';
  let mine = false;
  const grid = h('div', { class: 'grid', id: 'style-grid' });
  const paint = () => {
    const list = enabledStyles(c).filter(
      (s) =>
        (!q ||
          `${ctx.say(s.name)} ${ctx.say(s.blurb)} ${s.name.en}`
            .toLowerCase()
            .includes(q)) &&
        (!format || (s.formats as string[]).includes(format)) &&
        (!mine || canUse(plan, s.requires)),
    );
    clear(
      grid,
      ...(list.length
        ? list.map((s) => styleCard(ctx, s))
        : [empty(t('styles.empty'))]),
    );
  };
  const formats = [...new Set(enabledStyles(c).flatMap((s) => s.formats))];
  const chip = (label: string, value: string) =>
    h(
      'button',
      {
        type: 'button',
        class: 'chip',
        'data-format': value,
        'aria-pressed': String(format === value),
        onclick: (e: Event) => {
          format = value;
          for (const b of out.querySelectorAll('[data-format]'))
            b.setAttribute('aria-pressed', String(b === e.currentTarget));
          paint();
        },
      },
      label,
    );
  put(
    out,
    h('h1', { text: t('styles.title') }),
    h(
      'div',
      { class: 'filters' },
      h('input', {
        type: 'search',
        id: 'style-search',
        placeholder: t('common.search'),
        'aria-label': t('common.search'),
        oninput: (e: Event) => {
          q = (e.target as HTMLInputElement).value.trim().toLowerCase();
          paint();
        },
      }),
      chip(t('common.all'), ''),
      ...formats.map((f) => chip(f, f)),
      h(
        'label',
        { class: 'choice' },
        h('input', {
          type: 'checkbox',
          id: 'style-mine',
          onchange: (e: Event) => {
            mine = (e.target as HTMLInputElement).checked;
            paint();
          },
        }),
        h('span', { text: t('styles.mine') }),
      ),
    ),
    grid,
    h(
      'section',
      { class: 'ws-styles-section', id: 'ws-styles-section' },
      h(
        'div',
        { class: 'mine-section-head' },
        h('h2', { text: t('ws.styles') }),
      ),
      h('p', { class: 'muted', text: t('ws.newStyleHelp') }),
      newStyleForm(ctx, paintWs),
      wsHost,
      wsGrid,
    ),
    h(
      'section',
      { class: 'mine-section', id: 'mine-section' },
      h(
        'div',
        { class: 'mine-section-head' },
        h('h2', { text: t('mine.section') }),
        h(
          'a',
          { class: 'button sm', href: '#/my-styles', id: 'mine-manage' },
          t('mine.seeAll'),
        ),
      ),
      mineGrid,
    ),
  );
  paint();
  paintWs();
  await mineList(ctx, mineGrid);
};

const meter = (used: number, max: number | null) =>
  max === null || max <= 0
    ? null
    : h('span', {
        class: 'meter',
        role: 'presentation',
        style: `--fill:${Math.min(100, Math.round((used / max) * 100))}%`,
        'data-full': String(used >= max),
      });
const ring = (frac: number) => {
  const NS = 'http://www.w3.org/2000/svg';
  const r = 52;
  const c = 2 * Math.PI * r;
  const mk = (tag: string, a: Record<string, string>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(a)) e.setAttribute(k, v);
    return e;
  };
  const svg = mk('svg', {
    viewBox: '0 0 120 120',
    class: 'credit-ring-svg',
    'aria-hidden': 'true',
  });
  svg.append(
    mk('circle', { cx: '60', cy: '60', r: String(r), class: 'ring-track' }),
    mk('circle', {
      cx: '60',
      cy: '60',
      r: String(r),
      class: 'ring-fill',
      'stroke-dasharray': `${(Math.max(0.03, Math.min(1, frac)) * c).toFixed(1)} ${c.toFixed(1)}`,
    }),
  );
  return svg;
};

export const creditsScreen: Screen = (ctx, _a, out) => {
  const c = ctx.s.config;
  const paint = () => {
    const prefs = ctx.prefs();
    const cur = prefs.currency;
    const money = (p: { inr: number; usd: number }) =>
      cur === 'INR' ? `₹${p.inr}` : `$${p.usd}`;
    const plan = ctx.s.planOf(ctx.user.id);
    const ledger = ctx.s.ledger(ctx.user.id);
    const use = ctx.s.gateway.counts(ctx.user.id);
    const L = plan.limits;
    const lim = (v: number | null) =>
      v === null ? t('credits.unlimited') : String(v);
    const pay = async (pack: (typeof c.topUps)[number]) => {
      const providers = paymentProviders(c, cur);
      if (!providers.length) {
        ctx.toast(t('credits.noPayment'), 'error');
        return;
      }
      let provider = providers[0]!;
      const price = money(pack.price);
      const chosen = h('div', { class: 'pay-provider-note' });
      const paintProvider = () =>
        put(
          chosen,
          provider.kind === 'mock'
            ? h('p', { class: 'muted', text: t('credits.payMock') })
            : null,
        );
      const choices = h(
        'div',
        {
          class: 'seg-group pay-providers',
          role: 'radiogroup',
          'aria-label': t('credits.choose'),
        },
        providers.map((p, i) =>
          h('button', {
            type: 'button',
            class: `seg${i === 0 ? ' on' : ''}`,
            role: 'radio',
            'aria-checked': String(i === 0),
            'data-provider': p.id,
            text: p.name,
            onclick: (e: Event) => {
              provider = p;
              for (const b of choices.querySelectorAll('button')) {
                b.classList.toggle('on', b === e.currentTarget);
                b.setAttribute('aria-checked', String(b === e.currentTarget));
              }
              clear(chosen);
              paintProvider();
            },
          }),
        ),
      );
      const dialog = h(
        'dialog',
        { class: 'pay-dialog', id: 'pay-dialog' },
        h('h2', { text: t('credits.payTitle', { price }) }),
        h('p', {
          class: 'pay-summary',
          text: t('credits.summary', { n: pack.credits, price }),
        }),
        providers.length > 1 ? choices : h('p', { text: provider.name }),
        chosen,
        h('p', { class: 'muted pay-secure', text: t('credits.secure') }),
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            { type: 'button', class: 'button', onclick: () => dialog.close() },
            t('common.cancel'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'button primary',
              id: 'pay-confirm',
              onclick: async () => {
                const r = await ctx.s.topUp(ctx.user.id, pack.id, cur);
                dialog.close();
                dialog.remove();
                if (!r.ok) return ctx.toast(r.message, 'error');
                ctx.toast(t('credits.paid', { n: pack.credits }));
                ctx.refreshTop();
                paint();
              },
            },
            t('credits.pay'),
          ),
        ),
      );
      paintProvider();
      document.body.append(dialog);
      dialog.showModal();
    };
    clear(
      out,
      h('h1', { text: t('credits.title') }),
      h(
        'section',
        { class: 'credit-hero', id: 'credit-hero' },
        h(
          'div',
          { class: 'credit-ring' },
          ring(
            plan.monthlyCredits
              ? ledger.balance() / plan.monthlyCredits
              : ledger.balance()
                ? 1
                : 0,
          ),
          h(
            'div',
            { class: 'credit-ring-text' },
            h('strong', {
              class: 'credit-big',
              text: String(ledger.balance()),
            }),
            h('span', { class: 'muted', text: t('credits.ring') }),
          ),
        ),
        h(
          'div',
          { class: 'credit-hero-text' },
          h('p', {
            id: 'credits-balance',
            text: `${t('credits.current')}: ${ctx.say(plan.name)} · ${t('common.credits', { n: ledger.balance() })}`,
          }),
          h('p', {
            class: 'muted',
            text: t('credits.heroSub', {
              n: plan.monthlyCredits,
              plan: ctx.say(plan.name),
            }),
          }),
          h('p', {
            class: 'muted',
            text:
              L.creditsPerDay === null
                ? t('credits.todayNoCap', { used: use.creditsToday })
                : t('credits.todayLine', {
                    used: use.creditsToday,
                    cap: L.creditsPerDay,
                  }),
          }),
          h(
            'div',
            { class: 'actions' },
            h(
              'a',
              {
                class: 'button primary',
                href: '#topups',
                id: 'hero-topup',
                onclick: (e: Event) => {
                  e.preventDefault();
                  document
                    .getElementById('topups')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                },
              },
              t('credits.getMore'),
            ),
            h(
              'a',
              {
                class: 'button',
                href: '#plan-cards',
                id: 'hero-plans',
                onclick: (e: Event) => {
                  e.preventDefault();
                  document
                    .getElementById('plan-cards')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                },
              },
              t('credits.seePlans'),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'seg-group', role: 'group' },
        (['INR', 'USD'] as const).map((x) =>
          h(
            'button',
            {
              type: 'button',
              class: `seg${cur === x ? ' on' : ''}`,
              'aria-pressed': String(cur === x),
              'data-currency': x,
              onclick: () => {
                ctx.setPrefs({ currency: x });
                paint();
              },
            },
            x,
          ),
        ),
      ),
      h(
        'div',
        { class: 'grid', id: 'plan-cards' },
        publicPlans(c).map((p) =>
          card(
            { 'data-plan': p.id, 'data-current': String(p.id === plan.id) },
            h('h3', { text: ctx.say(p.name) }),
            h('p', {
              class: 'price',
              text:
                p.price.inr === 0 && p.price.usd === 0
                  ? t('credits.free')
                  : `${money(p.price)}${p.period === 'month' ? '/mo' : p.period === 'year' ? '/yr' : ''}`,
            }),
            h('p', { text: t('credits.perMonth', { n: p.monthlyCredits }) }),
            h(
              'ul',
              { class: 'plan-features' },
              planLines(p).map((line) => h('li', { text: line })),
            ),
            p.id === plan.id
              ? h('p', { class: 'chip', text: t('credits.current') })
              : h(
                  'button',
                  {
                    type: 'button',
                    class: 'button sm',
                    'data-switch': p.id,
                    onclick: async () => {
                      try {
                        await ctx.s.switchPlan(ctx.user.id, p.id);
                      } catch (e) {
                        // The server may require hosted checkout for a paid plan.
                        return ctx.toast(
                          e instanceof Error ? e.message : String(e),
                          'error',
                        );
                      }
                      ctx.refreshTop();
                      ctx.toast(
                        t('credits.planChanged', { plan: ctx.say(p.name) }),
                      );
                      paint();
                    },
                  },
                  t('credits.switch'),
                ),
          ),
        ),
      ),
      h('h2', { text: t('credits.costs') }),
      h(
        'table',
        { class: 'table', id: 'cost-table' },
        h(
          'tbody',
          null,
          c.costs.map((x) =>
            h(
              'tr',
              null,
              h('td', { text: ctx.say(x.label) }),
              h('td', { text: x.unit }),
              h('td', {
                text: x.min === x.max ? String(x.min) : `${x.min}–${x.max}`,
              }),
            ),
          ),
        ),
      ),
      h('h2', { text: t('credits.topUps') }),
      h(
        'div',
        { class: 'grid', id: 'topups' },
        c.topUps.map((pack) =>
          card(
            { 'data-topup': pack.id },
            h('h3', { text: t('common.credits', { n: pack.credits }) }),
            h('p', { class: 'price', text: money(pack.price) }),
            h(
              'button',
              {
                type: 'button',
                class: 'button primary sm',
                'data-buy': pack.id,
                onclick: () => void pay(pack),
              },
              t('credits.buy'),
            ),
          ),
        ),
      ),
      h('h2', { text: t('credits.usage') }),
      h(
        'table',
        { class: 'table', id: 'usage-table' },
        h(
          'tbody',
          null,
          [
            [
              'limit.exports',
              use.exportsThisMonth,
              lim(L.exportsPerMonth),
              L.exportsPerMonth,
            ],
            ['limit.storage', use.storageMb, String(L.storageMb), L.storageMb],
            [
              'limit.voiceClones',
              use.voiceClones,
              String(L.voiceClones),
              L.voiceClones,
            ],
            ['limit.projects', use.projects, lim(L.projects), L.projects],
            [
              'limit.day',
              use.creditsToday,
              lim(L.creditsPerDay),
              L.creditsPerDay,
            ],
          ].map(([k, v, m, max]) =>
            h(
              'tr',
              null,
              h('td', { text: t(k as Key) }),
              h(
                'td',
                { class: 'usage-cell' },
                h('span', { text: `${v} / ${m}` }),
                meter(Number(v), max as number | null),
              ),
            ),
          ),
        ),
      ),
      h('h2', { text: t('credits.history') }),
      h(
        'table',
        { class: 'table', id: 'ledger-table' },
        h(
          'tbody',
          null,
          [...ledger.history()]
            .reverse()
            .slice(0, 50)
            .map((e) =>
              h(
                'tr',
                { 'data-type': e.type },
                h('td', { text: when(e.at, prefs.locale) }),
                h('td', { text: t(`ledger.${e.type}` as Key) }),
                h('td', {
                  class: 'num',
                  text:
                    e.type === 'settle'
                      ? `−${e.used ?? 0}`
                      : e.delta > 0
                        ? `+${e.delta}`
                        : String(e.delta),
                }),
                h('td', { class: 'muted', text: e.note }),
              ),
            ),
        ),
      ),
    );
  };
  paint();
};

export const brandScreen: Screen = (ctx, _a, out) => {
  const plan = ctx.s.planOf(ctx.user.id);
  if (!plan.features.includes('brand-kit')) {
    put(
      out,
      h('h1', { text: t('brand.title') }),
      h('p', { class: 'locked-state', text: t('common.locked') }),
      h(
        'a',
        { class: 'button primary', href: '#/credits', id: 'brand-upgrade' },
        t('common.upgrade'),
      ),
      h(
        'div',
        { class: 'brand-teaser', 'aria-hidden': 'true' },
        h(
          'div',
          { class: 'brand-swatches' },
          ['#7c5cff', '#22d3ee', '#ffc247'].map((c) =>
            h('span', { style: `background:${c}` }),
          ),
        ),
        h('strong', { class: 'brand-sample', text: 'Aa' }),
      ),
    );
    return;
  }
  const kit = { ...ctx.prefs().brandKit };
  const colors = [0, 1, 2].map((i) =>
    h('input', {
      type: 'color',
      'data-color': String(i),
      value: kit.colors[i] ?? ['#7c5cff', '#22d3ee', '#ffc247'][i],
    }),
  );
  const fonts = ['Inter', 'Poppins', 'Noto Sans Devanagari'];
  const select = (id: string, value: string) =>
    h(
      'select',
      { id },
      h('option', { value: '', text: '—' }),
      fonts.map((f) =>
        h('option', { value: f, text: f, selected: f === value }),
      ),
    );
  const heading = select('brand-heading', kit.headingFont);
  const body = select('brand-body', kit.bodyFont);
  const logoPreview = h('img', {
    alt: '',
    class: 'logo-preview',
    src: kit.logo || undefined,
    hidden: !kit.logo,
  });
  const logo = h('input', {
    type: 'file',
    accept: 'image/*',
    id: 'brand-logo',
    onchange: () => {
      const f = logo.files?.[0];
      if (!f) return;
      if (f.size > 200_000) return ctx.toast(t('brand.logoTooBig'), 'error');
      const r = new FileReader();
      r.onload = () => {
        kit.logo = String(r.result);
        logoPreview.src = kit.logo;
        logoPreview.hidden = false;
      };
      r.readAsDataURL(f);
    },
  });
  const prevHead = h('h2', { text: t('brand.previewHead') });
  const prevBody = h('p', { text: t('brand.previewBody') });
  const prevBar = h(
    'div',
    { class: 'brand-swatches wide' },
    [0, 1, 2].map(() => h('span')),
  );
  const preview = h(
    'aside',
    {
      class: 'set-card brand-preview',
      id: 'brand-preview',
      'aria-label': t('brand.preview'),
    },
    h('h3', { class: 'set-card-title', text: t('brand.preview') }),
    h(
      'div',
      { class: 'brand-stage' },
      logoPreview.cloneNode(false),
      prevHead,
      prevBody,
      prevBar,
    ),
  );
  const paintPreview = () => {
    prevHead.style.fontFamily = heading.value
      ? `'${heading.value}', sans-serif`
      : '';
    prevBody.style.fontFamily = body.value ? `'${body.value}', sans-serif` : '';
    prevHead.style.color = colors[0]!.value;
    [...prevBar.children].forEach((n, i) => {
      (n as HTMLElement).style.background = colors[i]!.value;
    });
    const img = preview.querySelector('img');
    if (img) {
      (img as HTMLImageElement).src = kit.logo || '';
      img.hidden = !kit.logo;
    }
  };
  for (const c of colors) c.addEventListener('input', paintPreview);
  heading.addEventListener('change', paintPreview);
  body.addEventListener('change', paintPreview);
  logo.addEventListener('change', () => setTimeout(paintPreview, 80));
  paintPreview();
  put(
    out,
    h('h1', { text: t('brand.title') }),
    h(
      'div',
      { class: 'set-grid' },
      h(
        'section',
        { class: 'set-card' },
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'field-label', text: t('brand.colors') }),
          h('div', { class: 'actions' }, colors),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', {
            for: 'brand-heading',
            class: 'field-label',
            text: t('brand.heading'),
          }),
          heading,
        ),
        h(
          'div',
          { class: 'field' },
          h('label', {
            for: 'brand-body',
            class: 'field-label',
            text: t('brand.body'),
          }),
          body,
        ),
        h(
          'div',
          { class: 'field' },
          h('label', {
            for: 'brand-logo',
            class: 'field-label',
            text: t('brand.logo'),
          }),
          logo,
          logoPreview,
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'button primary',
            id: 'brand-save',
            onclick: () => {
              ctx.setPrefs({
                brandKit: {
                  colors: colors.map((c) => c.value),
                  headingFont: heading.value,
                  bodyFont: body.value,
                  logo: kit.logo,
                },
              });
              ctx.toast(t('common.saved'));
            },
          },
          t('common.save'),
        ),
      ),
      preview,
    ),
  );
};

export const settingsScreen: Screen = (ctx, _a, out) => {
  const p = ctx.prefs();
  const name = h('input', { type: 'text', id: 'settings-name', value: p.name });
  const lang = h(
    'select',
    { id: 'settings-language' },
    h('option', { value: 'en', text: 'English', selected: p.locale === 'en' }),
    h('option', { value: 'hi', text: 'हिंदी', selected: p.locale === 'hi' }),
  );
  const theme = h(
    'select',
    { id: 'settings-theme' },
    h('option', {
      value: 'dark',
      text: t('settings.dark'),
      selected: p.theme === 'dark',
    }),
    h('option', {
      value: 'light',
      text: t('settings.light'),
      selected: p.theme === 'light',
    }),
  );
  const sound = h(
    'select',
    { id: 'settings-sound' },
    h('option', {
      value: 'off',
      text: t('settings.soundOff'),
      selected: !p.sound,
    }),
    h('option', {
      value: 'on',
      text: t('settings.soundOn'),
      selected: !!p.sound,
    }),
  );
  const initial = (p.name || ctx.user.email || '?').trim()[0]!.toUpperCase();
  put(
    out,
    h('h1', { text: t('settings.title') }),
    h(
      'div',
      { class: 'set-grid' },
      h(
        'section',
        { class: 'set-card' },
        h('h3', { class: 'set-card-title', text: t('settings.profile') }),
        h(
          'div',
          { class: 'set-who' },
          h('span', {
            class: 'set-avatar',
            'aria-hidden': 'true',
            text: initial,
          }),
          h(
            'div',
            {},
            h('span', { class: 'field-label', text: t('settings.email') }),
            h('p', { id: 'settings-email', text: ctx.user.email ?? '' }),
          ),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', {
            for: 'settings-name',
            class: 'field-label',
            text: t('settings.name'),
          }),
          name,
        ),
      ),
      h(
        'section',
        { class: 'set-card' },
        h('h3', { class: 'set-card-title', text: t('settings.preferences') }),
        h(
          'div',
          { class: 'field' },
          h('label', {
            for: 'settings-language',
            class: 'field-label',
            text: t('settings.language'),
          }),
          lang,
        ),
        h(
          'div',
          { class: 'field' },
          h('label', {
            for: 'settings-theme',
            class: 'field-label',
            text: t('settings.theme'),
          }),
          theme,
        ),
        h(
          'div',
          { class: 'field' },
          h('label', {
            for: 'settings-sound',
            class: 'field-label',
            text: t('settings.sound'),
          }),
          sound,
        ),
      ),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'button primary',
        id: 'settings-save',
        onclick: () => {
          ctx.setPrefs({
            name: name.value.trim() || p.name,
            locale: lang.value as 'en' | 'hi',
            theme: theme.value as 'dark' | 'light',
            sound: sound.value === 'on',
          });
          ctx.toast(t('common.saved'));
          ctx.go('settings');
        },
      },
      t('common.save'),
    ),
  );
};

export const learnScreen: Screen = (ctx, _a, out) => {
  const items = learnItems(ctx.s.config);
  put(
    out,
    h('h1', { text: t('learn.title') }),
    items.length
      ? h(
          'div',
          { class: 'grid', id: 'learn-list' },
          items.map((l, i) =>
            card(
              { 'data-learn': l.id, class: 'card learn-card' },
              h('span', {
                class: 'learn-num',
                'aria-hidden': 'true',
                text: String(i + 1).padStart(2, '0'),
              }),
              h('h3', { text: ctx.say(l.title) }),
              l.body
                ? h('p', {
                    class: 'muted',
                    text: sayIn(l.body, ctx.prefs().locale),
                  })
                : null,
              h('p', {
                class: 'muted',
                text: t('common.minutes', { n: l.minutes }),
              }),
              l.url
                ? h('a', {
                    href: l.url,
                    class: 'button sm',
                    text: t('common.open'),
                  })
                : null,
            ),
          ),
        )
      : empty(t('common.none')),
  );
};
