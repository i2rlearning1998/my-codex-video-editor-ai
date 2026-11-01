// P2-38: the public website (landing, Styles, showcase, pricing, FAQ) from
// the Platform Config's site section, plus log in, sign up and password
// reset. No live demo and no guest editor (owner rule 5).
import '../ui/tokens.css';
import '../panel/panel.css';
import { localAccountBackend, indexedBlobStore } from '../cloud/local';
import {
  cloudConfig,
  googleClientId,
  type CloudBackend,
} from '../cloud/backend';
import { createSupabaseBackend } from '../cloud/supabase';
import {
  enabledStyles,
  publicPlans,
  text as say,
  type PlatformConfig,
} from '../platform-config';
import { applyBrand, brandMark } from '../panel/app';
import { h, clear, put } from '../panel/dom';
import { setLocale, t } from '../panel/strings';
import { liveConfig } from '../panel/live-config';

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

function landing(out: HTMLElement) {
  const sections = [...config.site.sections]
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);
  for (const s of sections) {
    const sec = h('section', {
      class: `site-section ${s.kind}`,
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
    if (s.kind === 'styles')
      sec.append(
        h(
          'div',
          { class: 'grid' },
          enabledStyles(config).map((st) =>
            h(
              'article',
              { class: 'card', 'data-style': st.id },
              h('h3', { text: L(st.name) }),
              h('p', { class: 'muted', text: L(st.blurb) }),
            ),
          ),
        ),
      );
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
              h('p', { text: t('site.creditsMonth', { n: p.monthlyCredits }) }),
            ),
          ),
        ),
      );
    out.append(sec);
  }
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
        await account.signUp(email.value, password.value);
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
      h('h1', {
        text:
          mode === 'login'
            ? t('site.login')
            : mode === 'signup'
              ? t('site.signup')
              : t('site.reset'),
      }),
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
            { href: `#/signup?next=${encodeURIComponent(next())}` },
            t('site.noAccount'),
          )
        : h(
            'a',
            { href: `#/login?next=${encodeURIComponent(next())}` },
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

function route() {
  const [name = ''] = location.hash.replace(/^#\//, '').split(/[/?]/);
  const main = h('main', { class: 'site-main' });
  if (name === 'login' || name === 'signup' || name === 'reset')
    authForm(main, name);
  else landing(main);
  clear(root, header(), main);
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
