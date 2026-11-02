// P2-17: the user panel shell: sidebar, top bar with the credits pill, hash
// routing, and loading, empty and error states. Logged-out people never see
// it (owner rule 5): they are sent to the website.
import { text as say, type LText } from '../platform-config';
import { h, clear } from './dom';
import type { Prefs, Services, CloudUser } from './services';
import { setLocale, t, type Key } from './strings';
import { icon, type IconName } from './icons';
import { reveal, setSound, spotlight, tilt, tick } from './motion';
import { openPalette } from './palette';

export interface Ctx {
  readonly s: Services;
  readonly user: CloudUser;
  prefs(): Prefs;
  setPrefs(change: Partial<Prefs>): void;
  go(route: string): void;
  refreshTop(): void;
  toast(message: string, kind?: 'ok' | 'error'): void;
  say: (t: LText | undefined) => string;
}
export type Screen = (
  ctx: Ctx,
  args: string[],
  out: HTMLElement,
) => void | Promise<void>;

const NAV: { route: string; key: Key; icon: IconName; bottom?: boolean }[] = [
  { route: 'home', key: 'nav.home', icon: 'home' },
  { route: 'styles', key: 'nav.styles', icon: 'styles' },
  { route: 'projects', key: 'nav.projects', icon: 'projects' },
  { route: 'studio', key: 'nav.studio', icon: 'studio' },
  { route: 'assets', key: 'nav.assets', icon: 'assets' },
  { route: 'brand', key: 'nav.brand', icon: 'brand' },
  { route: 'learn', key: 'nav.learn', icon: 'learn' },
  { route: 'credits', key: 'nav.credits', icon: 'credits', bottom: true },
  { route: 'settings', key: 'nav.settings', icon: 'settings', bottom: true },
];

/** P2-19, P2B-28: the brand comes from the config (name, logo, colours). */
const BRAND_VARS: Record<string, string> = {
  accent: '--brand-accent',
  accent2: '--brand-accent2',
  gold: '--brand-gold',
  bg: '--brand-bg',
  panel: '--brand-panel',
  border: '--brand-border',
  text: '--brand-text',
  muted: '--brand-muted',
};
export function applyBrand(c: Services['config']) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(c.brand.colors))
    if (BRAND_VARS[key] && /^#[0-9a-f]{6}$/i.test(value))
      root.style.setProperty(BRAND_VARS[key]!, value);
  // The editor's tokens (dark/light theme rules) also read --accent.
  if (/^#[0-9a-f]{6}$/i.test(c.brand.colors.accent ?? ''))
    root.style.setProperty('--accent', c.brand.colors.accent!);
  document.title = c.brand.name;
}
export const brandMark = (c: Services['config'], cls = 'brand') =>
  h(
    'span',
    { class: cls },
    c.brand.logoUrl
      ? h('img', { src: c.brand.logoUrl, alt: '', class: 'brand-logo' })
      : h('span', { class: 'brand-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'brand-name', text: c.brand.name }),
  );

export function mountPanel(
  root: HTMLElement,
  s: Services,
  user: CloudUser,
  screens: Record<string, Screen>,
) {
  let prefs = s.prefs(user.id);
  if (!prefs.name)
    prefs = { ...prefs, name: (user.email ?? '').split('@')[0] ?? '' };
  // Always the stored settings: a plan switch or another screen may have
  // changed them since this copy was read.
  const fresh = () =>
    (prefs = {
      ...prefs,
      ...s.prefs(user.id),
      name: s.prefs(user.id).name || prefs.name,
    });
  setLocale(prefs.locale);
  setSound(!!prefs.sound);
  document.documentElement.dataset.theme = prefs.theme;
  applyBrand(s.config);
  s.monthlyGrant(user.id);

  const credits = h('a', {
    class: 'credits-pill',
    id: 'credits-pill',
    href: '#/credits',
  });
  const toastHost = h('div', {
    class: 'toasts',
    role: 'status',
    'aria-live': 'polite',
  });
  const nav = h('nav', { class: 'side', 'aria-label': t('nav.label') });
  // The rail opens only for a pointer that really moves over it, not for one
  // parked there by the page loading.
  let lx = -1;
  let ly = -1;
  nav.addEventListener('pointermove', (e) => {
    if (lx >= 0 && Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly) >= 2)
      nav.classList.add('open');
    lx = e.clientX;
    ly = e.clientY;
  });
  nav.addEventListener('pointerleave', () => {
    nav.classList.remove('open');
    lx = -1;
  });
  // Any pointer movement outside the rail closes it (a missed "leave" must
  // never leave the rail stuck open over the page).
  document.addEventListener('pointermove', (e) => {
    if (nav.classList.contains('open') && !nav.contains(e.target as Node)) {
      nav.classList.remove('open');
      lx = -1;
    }
  });
  const out = h('main', { class: 'outlet', id: 'outlet', tabindex: '-1' });
  const top = h(
    'header',
    { class: 'top' },
    brandMark(s.config),
    h(
      'button',
      {
        class: 'search-pill',
        id: 'open-search',
        type: 'button',
        onclick: () => openPalette(ctx),
      },
      icon('search', 18),
      h('span', { class: 'search-text', text: t('home.searchHint') }),
      h('kbd', { text: 'Ctrl K' }),
    ),
    h('div', { class: 'top-gap' }),
    credits,
    h('span', { class: 'plan-chip', id: 'plan-chip' }),
    h(
      'a',
      { class: 'button', href: '/', id: 'open-editor' },
      t('top.openEditor'),
    ),
    h(
      'button',
      {
        class: 'button ghost',
        id: 'sign-out',
        type: 'button',
        onclick: async () => {
          await s.account.signOut();
          location.replace('/site/');
        },
      },
      t('top.signOut'),
    ),
  );
  clear(root, top, h('div', { class: 'body' }, nav, out), toastHost);

  const ctx: Ctx = {
    s,
    user,
    prefs: () => fresh(),
    setPrefs: (change) => {
      prefs = { ...fresh(), ...change };
      s.savePrefs(user.id, prefs);
      if (change.locale) setLocale(change.locale);
      if (change.sound !== undefined) setSound(change.sound);
      if (change.theme) document.documentElement.dataset.theme = change.theme;
      ctx.refreshTop();
    },
    go: (r) => {
      if (location.hash === `#/${r}`) void render();
      else location.hash = `#/${r}`;
    },
    refreshTop: () => {
      credits.textContent = t('top.credits', {
        n: s.ledger(user.id).balance(),
      });
      document.getElementById('plan-chip')!.textContent = say(
        s.planOf(user.id).name,
        prefs.locale,
      );
      const item = (n: (typeof NAV)[number]) =>
        h(
          'a',
          {
            href: `#/${n.route}`,
            class: 'nav-item',
            'data-route': n.route,
            onclick: () => tick('select'),
          },
          h('span', { class: 'nav-icon' }, icon(n.icon)),
          h('span', { class: 'nav-label', text: t(n.key) }),
        );
      clear(
        nav,
        ...NAV.filter((n) => !n.bottom).map(item),
        h('span', { class: 'nav-gap' }),
        ...NAV.filter((n) => n.bottom).map(item),
      );
      markNav();
    },
    toast: (message, kind = 'ok') => {
      const el = h('div', { class: `toast ${kind}`, text: message });
      toastHost.append(el);
      setTimeout(() => el.remove(), 6000);
    },
    say: (x) => say(x, prefs.locale),
  };
  savePrefsOnce();
  function savePrefsOnce() {
    s.savePrefs(user.id, prefs);
  }
  const markNav = () => {
    const name = location.hash.replace(/^#\//, '').split(/[/?]/)[0] || 'home';
    for (const a of nav.querySelectorAll<HTMLElement>('.nav-item'))
      a.toggleAttribute(
        'aria-current',
        a.dataset.route === name ||
          (name.startsWith('brief') && a.dataset.route === 'styles'),
      );
  };
  let seq = 0;
  async function render() {
    const mine = ++seq;
    const [name = 'home', ...args] = location.hash
      .replace(/^#\//, '')
      .split('?')[0]!
      .split('/')
      .map(decodeURIComponent);
    const screen = screens[name.split('?')[0]!] ?? screens.home!;
    clear(out, h('p', { class: 'loading', text: t('app.loading') }));
    markNav();
    try {
      const page = h('div', {
        class: 'page',
        'data-screen': name.split('?')[0],
      });
      await screen(ctx, args, page);
      if (mine === seq) {
        clear(out, page);
        reveal(page);
      }
    } catch (e) {
      console.debug('[panel] screen failed', e);
      if (mine === seq)
        clear(
          out,
          h('p', { class: 'error-state', role: 'alert', text: t('app.error') }),
        );
    }
    ctx.refreshTop();
  }
  spotlight(root);
  tilt(root);
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette(ctx);
    }
  });
  window.addEventListener('hashchange', () => void render());
  ctx.refreshTop();
  if (s.configFallback) ctx.toast(t('app.configFallback'), 'error');
  void render();
  return ctx;
}
