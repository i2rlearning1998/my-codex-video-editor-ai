// P2-22, P2-23, P2-35 to P2-37: Home, Styles, Projects, Credits and Plan,
// Brand Kit, Settings and Learn. Content from the config; data through the
// services (ledger, account, project library).
import {
  canUse,
  enabledStyles,
  learnItems,
  publicPlans,
  text as sayIn,
} from '../../platform-config';
import { paymentProviders } from '../../payments';
import { ASPECT_SIZES } from '../../auth-gate';
import { h, clear, put } from '../dom';
import type { Ctx, Screen } from '../app';
import { t, type Key } from '../strings';
import { card, empty, when } from './common';

const styleCard = (ctx: Ctx, s: ReturnType<typeof enabledStyles>[number]) => {
  const plan = ctx.s.planOf(ctx.user.id);
  const ok = canUse(plan, s.requires);
  const hint = s.priceHint;
  return card(
    { 'data-style': s.id, 'data-locked': String(!ok) },
    h('h3', { text: ctx.say(s.name) }),
    h('p', { class: 'muted', text: ctx.say(s.blurb) }),
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
          `🔒 ${t('common.upgrade')}`,
        ),
  );
};

export const homeScreen: Screen = async (ctx, _a, out) => {
  const c = ctx.s.config;
  const plan = ctx.s.planOf(ctx.user.id);
  const prompt = h('textarea', {
    id: 'home-prompt',
    rows: 3,
    placeholder: t('home.promptPlaceholder'),
    'aria-label': t('home.prompt'),
  });
  const first = enabledStyles(c).find((s) => canUse(plan, s.requires));
  let projects: Awaited<ReturnType<Ctx['s']['projects']['list']>> = [];
  try {
    const trash = new Set(ctx.prefs().trash);
    projects = (await ctx.s.projects.list())
      .filter((p) => !trash.has(p.id))
      .slice(0, 4);
  } catch {
    projects = [];
  }
  put(
    out,
    h('h1', {
      id: 'greeting',
      text: t('home.hello', { name: ctx.prefs().name }),
    }),
    h('p', {
      class: 'muted',
      id: 'home-balance',
      text: t('home.balance', {
        n: ctx.s.ledger(ctx.user.id).balance(),
        plan: ctx.say(plan.name),
      }),
    }),
    h(
      'section',
      { class: 'director-box' },
      h('label', {
        for: 'home-prompt',
        class: 'field-label',
        text: t('home.prompt'),
      }),
      prompt,
      h(
        'button',
        {
          type: 'button',
          class: 'button primary',
          id: 'home-start',
          disabled: !first,
          onclick: () =>
            first &&
            ctx.go(
              `brief/${first.id}?idea=${encodeURIComponent(prompt.value.trim())}`,
            ),
        },
        t('home.start'),
      ),
    ),
    h(
      'section',
      null,
      h(
        'div',
        { class: 'section-head' },
        h('h2', { text: t('home.styles') }),
        h('a', { href: '#/styles', text: t('home.seeAll') }),
      ),
      h(
        'div',
        { class: 'grid' },
        enabledStyles(c)
          .slice(0, 3)
          .map((s) => styleCard(ctx, s)),
      ),
    ),
    h(
      'section',
      null,
      h('h2', { text: t('home.continue') }),
      projects.length
        ? h(
            'div',
            { class: 'grid' },
            projects.map((p) =>
              card(
                { 'data-project': p.id },
                p.thumb
                  ? h('img', { src: p.thumb, alt: '', class: 'thumb' })
                  : h('div', { class: 'thumb' }),
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
          )
        : empty(t('home.noProjects')),
    ),
    h(
      'section',
      null,
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
};

export const stylesScreen: Screen = (ctx, _a, out) => {
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
  );
  paint();
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
      onsubmit: (e: Event) => {
        e.preventDefault();
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
                const key = `${pack.id}-${Date.now().toString(36)}`;
                const r = await provider.pay({
                  credits: pack.credits,
                  amount: cur === 'INR' ? pack.price.inr : pack.price.usd,
                  currency: cur,
                  key,
                });
                dialog.close();
                dialog.remove();
                if (!r.ok) return ctx.toast(r.message, 'error');
                ledger.grant(
                  pack.credits,
                  `topup:${r.paymentId}`,
                  `${pack.id} ${provider.id}`,
                );
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
                    onclick: () => {
                      ctx.setPrefs({ plan: p.id });
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
      h('p', { class: 'muted', text: t('common.locked') }),
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
