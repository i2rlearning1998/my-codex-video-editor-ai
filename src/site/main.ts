// P2-38: the public website (landing, Styles, showcase, pricing, FAQ) from
// the Platform Config's site section, plus log in, sign up and password
// reset. No live demo and no guest editor (owner rule 5).
import '../ui/tokens.css';
import '../panel/aurora.css';
import '../panel/panel.css';
import '../panel/cinema.css';
import './site.css';
import { localAccountBackend, indexedBlobStore } from '../cloud/local';
import {
  cloudConfig,
  googleClientId,
  type CloudBackend,
} from '../cloud/backend';
import { createSupabaseBackend } from '../cloud/supabase';
import {
  enabledStyles,
  footerOf,
  legalLinks,
  legalPage,
  navOf,
  paragraphs,
  publicPlans,
  text as say,
  type PlatformConfig,
} from '../platform-config';
import { applyBrand, brandMark } from '../panel/app';
import { maintenancePage, siteBanner } from '../panel/site-notices';
import { h, clear, put } from '../panel/dom';
import { posterArt } from '../panel/art';
import { icon } from '../panel/icons';
import { reel, reveal, spotlight, tilt } from '../panel/motion';
import { setLocale, t } from '../panel/strings';
import { planLines } from '../panel/plan-lines';
import { liveConfig } from '../panel/live-config';
import { gatewayBase } from '../usage-report';

const root = document.getElementById('site')!;
// P2B-12: Supabase accounts when its public settings exist, else local.
const cloud = cloudConfig();
const account: CloudBackend & { lastResetCode?(email: string): string | null } =
  cloud
    ? createSupabaseBackend(cloud)
    : localAccountBackend({ storage: localStorage, blobs: indexedBlobStore() });
let config: PlatformConfig;
let currency: 'INR' | 'USD' = 'INR';
let signedIn = false;

const next = () => {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const n = q.get('next') ?? '/panel/';
  // Only same-site paths.
  return n.startsWith('/') && !n.startsWith('//') ? n : '/panel/';
};
/** ROUND-C3: the person came here from Claude's Connect. */
const forClaude = () => next().startsWith('/panel/#/connect-claude');
const L = (x: Parameters<typeof say>[0]) =>
  say(x, document.documentElement.lang === 'hi' ? 'hi' : 'en');

function header() {
  return h(
    'header',
    { class: 'top site-top' },
    h('a', { href: '#/', class: 'brand-link' }, brandMark(config)),
    h('div', { class: 'top-gap' }),
    h(
      'button',
      {
        type: 'button',
        class: 'button ghost sm',
        id: 'site-lang',
        onclick: () => {
          setLocale(document.documentElement.lang === 'hi' ? 'en' : 'hi');
          route();
        },
      },
      document.documentElement.lang === 'hi' ? 'English' : 'हिंदी',
    ),
    // ROUND-C3 (0.5): the Connect Claude page, for everyone. ROUND-C5
    // (1.4): the header links are the owner's (default: that one link).
    ...navOf(config.site).map((link, i) =>
      h(
        'a',
        {
          class: 'button ghost site-nav-link',
          href: link.href,
          id: link.href === '#/claude' ? 'site-claude' : `site-nav-${i}`,
        },
        config.site.nav ? L(link.label) : t('site.claudeNav'),
      ),
    ),
    signedIn
      ? h(
          'a',
          { class: 'button primary', href: '/panel/', id: 'site-panel' },
          t('site.openPanel'),
        )
      : [
          h(
            'a',
            { class: 'button', href: '#/login', id: 'site-login' },
            t('site.login'),
          ),
          h(
            'a',
            { class: 'button primary', href: '#/signup', id: 'site-signup' },
            t('site.signup'),
          ),
        ],
  );
}

/** A Style as a film poster (for the hero fan and the Styles reel). */
const poster = (st: ReturnType<typeof enabledStyles>[number], full: boolean) =>
  h(
    'article',
    {
      class: `poster style-card${full ? ' reveal' : ''}`,
      'data-style': st.id,
    },
    h(
      'div',
      { class: `poster-in${full ? ' tilt glow' : ''}` },
      posterArt(st, config),
      h('span', { class: 'poster-sheen', 'aria-hidden': 'true' }),
      h(
        'div',
        { class: 'poster-cap' },
        h('h3', { text: L(st.name) }),
        full ? h('p', { class: 'poster-blurb', text: L(st.blurb) }) : null,
        full
          ? h(
              'a',
              {
                class: 'button primary sm',
                href: signedIn ? '/panel/' : '#/signup',
              },
              signedIn ? t('site.openPanel') : t('site.signup'),
            )
          : null,
      ),
    ),
  );

function landing(out: HTMLElement) {
  const sections = [...config.site.sections]
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);
  // Steps light up as they scroll into view (none with reduced motion).
  queueMicrotask(revealOnScroll);
  for (const s of sections) {
    const sec = h('section', {
      class: `site-section ${s.kind}${s.kind === 'hero' ? '' : ' reveal'}`,
      'data-section': s.id,
    });
    if (s.title)
      sec.append(h(s.kind === 'hero' ? 'h1' : 'h2', { text: L(s.title) }));
    if (s.body) sec.append(h('p', { class: 'lead', text: L(s.body) }));
    if (s.kind === 'hero' && !signedIn)
      sec.append(
        h(
          'div',
          { class: 'actions' },
          h(
            'a',
            { class: 'button primary', href: '#/signup', 'data-cta': 'signup' },
            t('site.signup'),
          ),
          h('a', { class: 'button', href: '#/login' }, t('site.login')),
        ),
      );
    if (s.kind === 'hero')
      sec.append(
        h(
          'div',
          { class: 'hero-fan', 'aria-hidden': 'true' },
          enabledStyles(config)
            .slice(0, 3)
            .map((st) => poster(st, false)),
        ),
      );
    // P2B-33: the story as a scroll timeline; the FAQ as open/close items.
    if (s.kind === 'story')
      sec.append(
        h(
          'ol',
          { class: 'story-line', id: 'story' },
          s.items.map((step, i) =>
            h(
              'li',
              { class: 'story-step', 'data-step': String(i + 1) },
              h('span', {
                class: 'story-dot',
                'aria-hidden': 'true',
                text: String(i + 1),
              }),
              h('h3', { text: L(step.title) }),
              h('p', { class: 'muted', text: L(step.body) }),
            ),
          ),
        ),
      );
    if (s.kind === 'faq')
      sec.append(
        h(
          'div',
          { class: 'faq', id: 'faq' },
          s.items.map((q) =>
            h(
              'details',
              { class: 'faq-item' },
              h('summary', { text: L(q.title) }),
              h('p', { class: 'muted', text: L(q.body) }),
            ),
          ),
        ),
      );
    if (s.kind === 'styles') {
      const view = h('div', {
        class: 'reel',
        id: 'site-reel',
        tabindex: '0',
        role: 'list',
      });
      view.append(...enabledStyles(config).map((st) => poster(st, true)));
      const thumb = h('div', { class: 'reel-thumb' });
      const track = h('div', { class: 'reel-track' }, thumb);
      const count = h('span', { class: 'reel-count' });
      const rl = reel(view, { track, thumb, label: count });
      sec.append(
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
      );
    }
    if (s.kind === 'showcase')
      sec.append(
        h(
          'div',
          { class: 'grid', id: 'showcase' },
          config.site.showcase.map((v) =>
            h(
              'article',
              { class: 'card', 'data-showcase': v.id },
              v.videoUrl
                ? h('video', {
                    src: v.videoUrl,
                    poster: v.posterUrl || undefined,
                    controls: true,
                    preload: 'none',
                  })
                : h('div', { class: 'thumb', text: t('site.soon') }),
              h('h3', { text: L(v.title) }),
            ),
          ),
        ),
      );
    if (s.kind === 'pricing')
      sec.append(
        h(
          'div',
          { class: 'seg-group', role: 'group' },
          (['INR', 'USD'] as const).map((x) =>
            h(
              'button',
              {
                type: 'button',
                class: `seg${currency === x ? ' on' : ''}`,
                'aria-pressed': String(currency === x),
                'data-currency': x,
                onclick: () => {
                  currency = x;
                  route();
                },
              },
              x,
            ),
          ),
        ),
        h(
          'div',
          { class: 'grid', id: 'pricing' },
          publicPlans(config).map((p) =>
            h(
              'article',
              { class: 'card', 'data-plan': p.id },
              h('h3', { text: L(p.name) }),
              h('p', {
                class: 'price',
                text:
                  p.price.inr === 0 && p.price.usd === 0
                    ? t('credits.free')
                    : `${currency === 'INR' ? `₹${p.price.inr}` : `$${p.price.usd}`}${p.period === 'month' ? t('site.perMonth') : ''}`,
              }),
              h('p', {
                class: 'plan-credits',
                text: t('site.creditsMonth', { n: p.monthlyCredits }),
              }),
              h(
                'ul',
                { class: 'plan-features' },
                planLines(p).map((line) => h('li', { text: line })),
              ),
              h(
                'a',
                {
                  class: `button${p.id === 'pro' ? ' primary' : ''} sm`,
                  href: signedIn ? '/panel/#/credits' : '#/signup',
                  'data-plan-cta': p.id,
                },
                signedIn ? t('site.openPanel') : t('site.signup'),
              ),
            ),
          ),
        ),
      );
    out.append(sec);
  }
  out.append(
    h(
      'section',
      { class: 'site-section site-cta reveal', 'data-section': 'cta' },
      h('h2', { text: t('site.ctaTitle') }),
      h('p', { class: 'lead', text: t('site.ctaBody') }),
      h(
        'a',
        {
          class: 'button primary',
          href: signedIn ? '/panel/' : '#/signup',
          'data-cta': 'bottom',
        },
        signedIn ? t('site.openPanel') : t('site.signup'),
      ),
    ),
    siteFooter(),
  );
}

/** ROUND-C5 (1.4, 1.7): the owner's footer, with the published legal pages. */
function siteFooter() {
  const f = footerOf(config.site);
  const legal = legalLinks(config.site);
  return h(
    'footer',
    { class: 'site-footer', id: 'site-footer' },
    f.groups.length
      ? h(
          'div',
          { class: 'site-footer-groups' },
          ...f.groups.map((g) =>
            h(
              'nav',
              { class: 'site-footer-group' },
              h('h3', { text: L(g.title) }),
              ...g.links.map((l) => h('a', { href: l.href, text: L(l.label) })),
            ),
          ),
        )
      : null,
    legal.length
      ? h(
          'nav',
          { class: 'site-footer-legal', id: 'site-footer-legal' },
          ...legal.map((p) =>
            h('a', {
              href: `#/legal/${p.id}`,
              'data-legal': p.id,
              text: L(p.title),
            }),
          ),
        )
      : null,
    h('p', { text: f.copyright ? L(f.copyright) : t('site.footer') }),
  );
}

/** ROUND-C5 (1.7): a published legal page, plain paragraphs, https links. */
function legalView(main: HTMLElement, id: string) {
  const page = legalPage(config.site, id);
  if (!page) {
    main.append(
      h(
        'section',
        { class: 'site-section', id: 'legal-missing' },
        h('h1', { text: t('site.legalMissing') }),
        h('a', { class: 'button', href: '#/', text: t('site.home') }),
      ),
    );
    return;
  }
  const body = L(page.body);
  main.append(
    h(
      'article',
      { class: 'site-section site-legal', id: `legal-${page.id}` },
      h('h1', { text: L(page.title) }),
      page.updated
        ? h('p', {
            class: 'muted',
            text: `${t('site.legalUpdated')} ${page.updated} · v${page.version}`,
          })
        : null,
      ...paragraphs(body).map((parts) =>
        h(
          'p',
          null,
          ...parts.map((x) =>
            x.href
              ? h('a', {
                  href: x.href,
                  rel: 'noopener noreferrer',
                  target: '_blank',
                  text: x.text,
                })
              : document.createTextNode(x.text),
          ),
        ),
      ),
    ),
  );
}

function revealOnScroll() {
  const steps = document.querySelectorAll<HTMLElement>('.story-step');
  if (!('IntersectionObserver' in window)) {
    for (const el of steps) el.dataset.seen = 'true';
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) (e.target as HTMLElement).dataset.seen = 'true';
    },
    { threshold: 0.3 },
  );
  for (const el of steps) io.observe(el);
}

function authForm(out: HTMLElement, mode: 'login' | 'signup' | 'reset') {
  const email = h('input', {
    type: 'email',
    id: 'auth-email',
    autocomplete: 'email',
    required: true,
  });
  const password = h('input', {
    type: 'password',
    id: 'auth-password',
    autocomplete: mode === 'signup' ? 'new-password' : 'current-password',
    minlength: 8,
  });
  const code = h('input', {
    type: 'text',
    id: 'auth-code',
    inputmode: 'numeric',
  });
  const error = h('p', {
    class: 'error-state',
    role: 'alert',
    id: 'auth-error',
  });
  const note = h('p', { class: 'muted', id: 'auth-note' });
  let codeSent = false;
  const submit = async (e: Event) => {
    e.preventDefault();
    error.textContent = '';
    try {
      if (mode === 'login') await account.signIn(email.value, password.value);
      else if (mode === 'signup')
        await account.signUp(email.value, password.value, { next: next() });
      else if (!codeSent) {
        await account.requestPasswordReset(email.value);
        codeSent = true;
        note.textContent = account.lastResetCode
          ? t('site.codeSent', {
              code: account.lastResetCode(email.value) ?? '—',
            })
          : t('site.codeEmailed');
        paint();
        return;
      } else
        await account.confirmPasswordReset(
          email.value,
          code.value,
          password.value,
        );
      location.href = next();
    } catch (err) {
      error.textContent = err instanceof Error ? err.message : String(err);
      // ROUND-C3 (0.4): waiting for the confirmation email keeps the
      // connection request; if this page is gone by then, Claude can ask again.
      if (
        mode === 'signup' &&
        forClaude() &&
        /Check your email/.test(error.textContent)
      )
        note.textContent = t('site.claudeConfirm');
    }
  };
  const form = h('form', {
    class: 'auth-form',
    id: `auth-${mode}`,
    onsubmit: submit,
  });
  const paint = () =>
    clear(
      form,
      h('span', { class: 'orb', 'aria-hidden': 'true' }),
      h('h1', {
        text:
          mode === 'login'
            ? t('site.login')
            : mode === 'signup'
              ? t('site.signup')
              : t('site.reset'),
      }),
      // ROUND-C3 (0.4): on the way to Claude's consent page.
      forClaude() && mode !== 'reset'
        ? h('p', {
            class: 'muted',
            id: 'auth-claude',
            text: t('site.forClaude'),
          })
        : null,
      h('label', { for: 'auth-email', text: t('site.email') }),
      email,
      mode !== 'reset' || codeSent
        ? h('label', {
            for: 'auth-password',
            text: mode === 'reset' ? t('site.newPassword') : t('site.password'),
          })
        : null,
      mode !== 'reset' || codeSent ? password : null,
      mode === 'reset' && codeSent
        ? h('label', { for: 'auth-code', text: t('site.code') })
        : null,
      mode === 'reset' && codeSent ? code : null,
      error,
      note,
      // ROUND-C5 (1.7): the published legal pages, linked on sign-up.
      mode === 'signup' && legalLinks(config.site).length
        ? h(
            'p',
            { class: 'muted auth-legal', id: 'auth-legal' },
            t('site.legalAgree'),
            ...legalLinks(config.site).map((p) =>
              h('a', {
                href: `#/legal/${p.id}`,
                'data-legal': p.id,
                text: ` ${L(p.title)}`,
              }),
            ),
          )
        : null,
      h(
        'button',
        { type: 'submit', class: 'button primary', id: 'auth-submit' },
        mode === 'login'
          ? t('site.login')
          : mode === 'signup'
            ? t('site.signup')
            : codeSent
              ? t('site.reset')
              : t('site.sendCode'),
      ),
      mode === 'login'
        ? h('a', { href: '#/reset', id: 'auth-forgot' }, t('site.forgot'))
        : null,
      mode === 'login'
        ? h(
            'a',
            {
              href: `#/signup?next=${encodeURIComponent(next())}`,
              id: 'auth-to-signup',
            },
            t('site.noAccount'),
          )
        : h(
            'a',
            {
              href: `#/login?next=${encodeURIComponent(next())}`,
              id: 'auth-to-login',
            },
            t('site.haveAccount'),
          ),
      // Google sign-in only when its client id is set (and Supabase is used).
      cloud && googleClientId() && mode !== 'reset'
        ? h(
            'button',
            {
              type: 'button',
              class: 'button',
              id: 'auth-google',
              onclick: () =>
                void account
                  .signInWithProvider('google')
                  .catch((err: Error) => {
                    error.textContent = err.message;
                  }),
            },
            t('site.google'),
          )
        : null,
      cloud ? null : h('p', { class: 'muted', text: t('site.localMode') }),
    );
  paint();
  out.append(form);
}

/**
 * ROUND-C3 (0.5): what connecting Claude does, the connector address with
 * Copy, the two steps, the skill and plugin downloads, and that the person's
 * own Claude plan is used. Logged-out people see it too (they sign up on the
 * way, when Claude connects).
 */
function claudePage(out: HTMLElement) {
  const box = h('section', {
    class: 'card site-claude',
    id: 'site-claude-page',
  });
  const state = h('div', { id: 'site-claude-state' });
  out.append(box);
  clear(
    box,
    h('h1', { text: t('site.claudeTitle') }),
    h('p', { text: t('site.claudeWhat') }),
    h('p', {
      class: 'muted',
      id: 'site-claude-plan',
      text: t('site.claudePlan'),
    }),
    state,
  );
  const base = gatewayBase();
  if (!base) {
    clear(
      state,
      h('p', {
        class: 'error-state',
        role: 'alert',
        text: t('site.claudeOff'),
      }),
    );
    return;
  }
  clear(state, h('p', { class: 'loading', text: t('app.loading') }));
  void (async () => {
    let info: { address: string; bundles: string[] };
    try {
      const r = await fetch(`${base.replace(/\/$/, '')}/v1/mcp/public`);
      if (!r.ok) throw new Error(String(r.status));
      info = (await r.json()) as typeof info;
    } catch {
      clear(
        state,
        h('p', {
          class: 'error-state',
          role: 'alert',
          text: t('site.claudeError'),
        }),
        h('button', {
          type: 'button',
          class: 'button sm ghost',
          id: 'site-claude-retry',
          text: t('claude.retry'),
          onclick: () => {
            clear(out);
            claudePage(out);
          },
        }),
      );
      return;
    }
    const copy = h('button', {
      type: 'button',
      class: 'button primary',
      id: 'site-claude-copy',
      'data-address': info.address,
      text: t('claude.copy'),
      onclick: async () => {
        await navigator.clipboard?.writeText(info.address).catch(() => {});
        copy.textContent = t('claude.copied');
      },
    });
    clear(
      state,
      h('code', {
        class: 'site-claude-address',
        id: 'site-claude-address',
        text: info.address,
      }),
      h('div', { class: 'row' }, copy),
      h('h2', { text: t('claude.step1') }),
      h('p', { text: t('claude.step1Body') }),
      h('h2', { text: t('claude.step2') }),
      h('p', { text: t('site.claudeStep2') }),
      h('h2', { text: t('claude.bundle') }),
      h(
        'div',
        { class: 'row', id: 'site-claude-bundles' },
        ...info.bundles.map((href, i) =>
          h('a', {
            class: 'button sm ghost',
            href,
            download: '',
            'data-bundle': href.split('/').pop()!,
            text: t(
              (
                [
                  'claude.bundleSkill',
                  'claude.bundleSetup',
                  'claude.bundlePlugin',
                ] as const
              )[i] ?? 'claude.bundlePlugin',
            ),
          }),
        ),
      ),
    );
  })();
}

function route() {
  const [name = ''] = location.hash.replace(/^#\//, '').split(/[/?]/);
  const main = h('main', { class: 'site-main' });
  const auth = name === 'login' || name === 'signup' || name === 'reset';
  // ROUND-C5 (1.6): under maintenance the website shows its page; signing
  // in stays open, so the owner is never locked out.
  const closed = auth ? null : maintenancePage(config, 'website');
  if (closed) {
    clear(root, header(), closed);
    return;
  }
  if (auth) authForm(main, name);
  else if (name === 'claude') claudePage(main);
  else if (name === 'legal')
    legalView(main, location.hash.split('/')[2]?.split('?')[0] ?? '');
  else landing(main);
  const banner = siteBanner(config, 'website');
  clear(root, ...(banner ? [banner] : []), header(), main);
  reveal(main);
  spotlight(main);
  tilt(main);
}

async function start() {
  config = (await liveConfig(localStorage)).config;
  setLocale(config.brand.defaultLocale);
  applyBrand(config);
  signedIn = !!(await account.user());
  window.addEventListener('hashchange', route);
  route();
}
put(root);
void start();
