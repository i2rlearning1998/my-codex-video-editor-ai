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
import { ASPECT_SIZES } from '../../auth-gate';
import { h, clear, put } from '../dom';
import type { Ctx, Screen } from '../app';
import { t, type Key } from '../strings';
import { card, empty, limitAlert, when } from './common';
import { posterArt } from '../art';
import { icon, studioIcon } from '../icons';
import { reel } from '../motion';
import { directorRoomScreen } from './director-room';
import { mineList } from './my-styles';

const styleCard = (ctx: Ctx, s: ReturnType<typeof enabledStyles>[number]) => {
  const plan = ctx.s.planOf(ctx.user.id);
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
              { class: 'button primary sm', href: `#/brief/${s.id}` },
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
  let projects: Awaited<ReturnType<Ctx['s']['projects']['list']>> = [];
  try {
    const trash = new Set(ctx.prefs().trash);
    projects = (await ctx.s.projects.list())
      .filter((p) => !trash.has(p.id))
      .slice(0, 4);
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
            p.thumb
              ? h('img', { src: p.thumb, alt: '', class: 'thumb' })
              : h('div', { class: 'thumb' }),
            h(
              'div',
              { class: 'film-body' },
              h('h3', { text: p.name }),
              h(
                'a',
                {
                  class: 'button sm',
                  href: `/?open=${encodeURIComponent(p.id)}`,
                },
                t('common.open'),
              ),
            ),
          ),
        ),
        h(
          'a',
          { class: 'film new glow reveal', href: '#/styles' },
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
  await mineList(ctx, mineGrid);
};

export const projectsScreen: Screen = async (ctx, _a, out) => {
  let q = '';
  let view: 'all' | 'recent' | 'trash' = 'all';
  const list = h('div', { class: 'grid', id: 'project-list' });
  const blank = h(
    'form',
    {
      class: 'inline-form',
      id: 'blank-form',
      hidden: true,
      onsubmit: async (e: Event) => {
        e.preventDefault();
        // P2B-27: the plan's project limit (nothing is made when it is hit).
        blank.querySelector('#project-limit')?.remove();
        const refused = await ctx.s.checkLimit(ctx.user.id, 'project');
        if (refused) {
          blank.append(limitAlert('project-limit', refused));
          return;
        }
        const name =
          (
            blank.querySelector('#blank-name') as HTMLInputElement
          ).value.trim() || 'Untitled';
        const aspect = (
          blank.querySelector('#blank-aspect') as HTMLSelectElement
        ).value;
        location.href = `/?new=${encodeURIComponent(name)}&aspect=${encodeURIComponent(aspect)}`;
      },
    },
    h('label', { for: 'blank-name', text: t('projects.blankName') }),
    h('input', { id: 'blank-name', type: 'text', required: true }),
    h('label', { for: 'blank-aspect', text: t('projects.blankFormat') }),
    h(
      'select',
      { id: 'blank-aspect' },
      Object.keys(ASPECT_SIZES).map((a) => h('option', { value: a, text: a })),
    ),
    h(
      'button',
      { type: 'submit', class: 'button primary', id: 'blank-create' },
      t('projects.create'),
    ),
  );
  const paint = async () => {
    let all: Awaited<ReturnType<Ctx['s']['projects']['list']>> = [];
    try {
      all = await ctx.s.projects.list();
    } catch {
      all = [];
    }
    const trash = new Set(ctx.prefs().trash);
    const week = Date.now() - 7 * 864e5;
    const shown = all.filter(
      (p) =>
        (view === 'trash' ? trash.has(p.id) : !trash.has(p.id)) &&
        (view !== 'recent' || Date.parse(p.updated) >= week) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
    clear(
      list,
      ...(shown.length
        ? shown.map((p) => {
            const nameEl = h('h3', { text: p.name });
            const act = (
              key: Key,
              id: string,
              fn: () => void | Promise<void>,
            ) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'button sm',
                  'data-act': id,
                  onclick: async () => {
                    await fn();
                    await paint();
                  },
                },
                t(key),
              );
            return card(
              { 'data-project': p.id },
              p.thumb
                ? h('img', { src: p.thumb, alt: '', class: 'thumb' })
                : h('div', { class: 'thumb' }),
              nameEl,
              h('p', {
                class: 'muted',
                text: t('projects.edited', {
                  when: when(p.updated, ctx.prefs().locale),
                }),
              }),
              h(
                'div',
                { class: 'actions' },
                ...(view === 'trash'
                  ? [
                      act('projects.restore', 'restore', () =>
                        ctx.setPrefs({
                          trash: ctx.prefs().trash.filter((x) => x !== p.id),
                        }),
                      ),
                      act('projects.deleteForever', 'delete', async () => {
                        await ctx.s.projects.remove(p.id);
                        ctx.setPrefs({
                          trash: ctx.prefs().trash.filter((x) => x !== p.id),
                        });
                      }),
                    ]
                  : [
                      h(
                        'a',
                        {
                          class: 'button sm primary',
                          href: `/?open=${encodeURIComponent(p.id)}`,
                          'data-act': 'open',
                        },
                        t('common.open'),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          class: 'button sm',
                          'data-act': 'rename',
                          onclick: () => {
                            // Inline: the name becomes a field; Enter or
                            // leaving it saves, Escape cancels.
                            const field = h('input', {
                              type: 'text',
                              value: p.name,
                              class: 'rename-field',
                              'aria-label': t('projects.rename'),
                            });
                            let done = false;
                            const finish = async (save: boolean) => {
                              if (done) return;
                              done = true;
                              const name = field.value.trim();
                              if (save && name && name !== p.name)
                                await ctx.s.projects.rename(p.id, name);
                              await paint();
                            };
                            field.addEventListener('keydown', (e) => {
                              if (e.key === 'Enter') void finish(true);
                              if (e.key === 'Escape') void finish(false);
                            });
                            field.addEventListener(
                              'blur',
                              () => void finish(true),
                            );
                            nameEl.replaceWith(field);
                            field.select();
                          },
                        },
                        t('projects.rename'),
                      ),
                      h(
                        'a',
                        {
                          class: 'button sm',
                          href: `#/project/${encodeURIComponent(p.id)}`,
                          'data-act': 'memory',
                        },
                        t('mem.open'),
                      ),
                      act('projects.duplicate', 'duplicate', async () => {
                        await ctx.s.projects.duplicate(p.id, 'copy');
                      }),
                      act('projects.toTrash', 'trash', () =>
                        ctx.setPrefs({ trash: [...ctx.prefs().trash, p.id] }),
                      ),
                    ]),
              ),
            );
          })
        : [empty(t('projects.empty'))]),
    );
  };
  const tab = (key: Key, v: typeof view) =>
    h(
      'button',
      {
        type: 'button',
        class: 'chip',
        'data-view': v,
        'aria-pressed': String(view === v),
        onclick: (e: Event) => {
          view = v;
          for (const b of out.querySelectorAll('[data-view]'))
            b.setAttribute('aria-pressed', String(b === e.currentTarget));
          void paint();
        },
      },
      t(key),
    );
  put(
    out,
    h('h1', { text: t('projects.title') }),
    h(
      'div',
      { class: 'actions' },
      h(
        'a',
        { class: 'button primary', href: '#/styles', id: 'new-director' },
        t('projects.newDirector'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'button',
          id: 'new-blank',
          onclick: () => {
            blank.hidden = !blank.hidden;
          },
        },
        t('projects.newBlank'),
      ),
    ),
    blank,
    h(
      'div',
      { class: 'filters' },
      h('input', {
        type: 'search',
        id: 'project-search',
        placeholder: t('common.search'),
        'aria-label': t('common.search'),
        oninput: (e: Event) => {
          q = (e.target as HTMLInputElement).value.trim().toLowerCase();
          void paint();
        },
      }),
      tab('common.all', 'all'),
      tab('projects.recent', 'recent'),
      tab('projects.trash', 'trash'),
    ),
    list,
    h('p', { class: 'muted', text: t('projects.fileMenu') }),
  );
  await paint();
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
      const provider = paymentProviders(c, cur)[0];
      if (!provider) {
        ctx.toast(t('credits.noPayment'), 'error');
        return;
      }
      const price = money(pack.price);
      const dialog = h(
        'dialog',
        { class: 'pay-dialog', id: 'pay-dialog' },
        h('h2', { text: t('credits.payTitle', { price }) }),
        h('p', { text: provider.name }),
        provider.kind === 'mock'
          ? h('p', { class: 'muted', text: t('credits.payMock') })
          : null,
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
      document.body.append(dialog);
      dialog.showModal();
    };
    clear(
      out,
      h('h1', { text: t('credits.title') }),
      h('p', {
        id: 'credits-balance',
        text: `${t('credits.current')}: ${ctx.say(plan.name)} · ${t('common.credits', { n: ledger.balance() })}`,
      }),
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
            p.id === plan.id
              ? h('p', { class: 'chip', text: t('credits.current') })
              : h(
                  'button',
                  {
                    type: 'button',
                    class: 'button sm',
                    'data-switch': p.id,
                    onclick: async () => {
                      await ctx.s.switchPlan(ctx.user.id, p.id);
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
            ['limit.exports', use.exportsThisMonth, lim(L.exportsPerMonth)],
            ['limit.storage', use.storageMb, String(L.storageMb)],
            ['limit.voiceClones', use.voiceClones, String(L.voiceClones)],
            ['limit.projects', use.projects, lim(L.projects)],
            ['limit.day', use.creditsToday, lim(L.creditsPerDay)],
          ].map(([k, v, m]) =>
            h(
              'tr',
              null,
              h('td', { text: t(k as Key) }),
              h('td', { text: `${v} / ${m}` }),
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
  put(
    out,
    h('h1', { text: t('brand.title') }),
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
  put(
    out,
    h('h1', { text: t('settings.title') }),
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label', text: t('settings.email') }),
      h('p', { id: 'settings-email', text: ctx.user.email ?? '' }),
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
          items.map((l) =>
            card(
              { 'data-learn': l.id },
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
