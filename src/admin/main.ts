// P3U: the admin page's entry. Its own page (`/admin/`), never part of the
// editor or user-panel bundles. A sign-in gate, then a shell with hash routes.
import '../ui/tokens.css';
import '../panel/aurora.css';
import '../panel/panel.css';
import './admin.css';
import { h, clear } from '../panel/dom';
import { aicon, type AdminIcon } from './icons';
import { adminAuth, adminServices } from './services';
import { at, setAdminLocale, adminLocale, type AdminKey } from './strings';
import type { AdminCtx, AdminScreen } from './screens/common';
import { dashboardScreen } from './screens/dashboard';
import { usersScreen } from './screens/users';
import { flagsScreen } from './screens/flags';
import { auditScreen } from './screens/audit';
import { emergencyScreen, whatText } from './screens/emergency';
import { settingsScreen } from './screens/settings';

const root = document.getElementById('admin')!;
const auth = adminAuth();

const NAV: {
  route: string;
  key: AdminKey;
  icon: AdminIcon;
  group: AdminKey;
}[] = [
  {
    route: 'dashboard',
    key: 'ad.nav.dashboard',
    icon: 'dashboard',
    group: 'ad.nav.group.run',
  },
  {
    route: 'users',
    key: 'ad.nav.users',
    icon: 'users',
    group: 'ad.nav.group.run',
  },
  {
    route: 'flags',
    key: 'ad.nav.flags',
    icon: 'flag',
    group: 'ad.nav.group.control',
  },
  {
    route: 'settings',
    key: 'ad.nav.settings',
    icon: 'chat',
    group: 'ad.nav.group.control',
  },
  {
    route: 'audit',
    key: 'ad.nav.audit',
    icon: 'audit',
    group: 'ad.nav.group.safety',
  },
  {
    route: 'emergency',
    key: 'ad.nav.emergency',
    icon: 'emergency',
    group: 'ad.nav.group.safety',
  },
];
const SCREENS: Record<string, AdminScreen> = {
  dashboard: dashboardScreen,
  users: usersScreen,
  flags: flagsScreen,
  settings: settingsScreen,
  audit: auditScreen,
  emergency: emergencyScreen,
};

function saved<T extends string>(
  key: string,
  ok: readonly T[],
  fallback: T,
): T {
  try {
    const v = localStorage.getItem(key);
    return (ok as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* a private window keeps it until reload */
  }
}
setAdminLocale(saved('aive.admin.locale', ['en', 'hi'] as const, 'en'));
document.documentElement.dataset.theme = saved(
  'aive.admin.theme',
  ['dark', 'light'] as const,
  'dark',
);

function showGate(message?: string) {
  const services = adminServices();
  const err = h('p', {
    class: 'ad-dlg-error',
    id: 'ad-gate-error',
    role: 'alert',
    text: message ?? '',
  });
  const form = h(
    'form',
    { class: 'ad-gate-card', id: 'ad-gate', novalidate: true },
    h('div', { class: 'ad-gate-mark' }, aicon('shield', 28)),
    h('h1', { text: at('ad.signin') }),
    h('p', { class: 'muted', text: at('ad.signinLead') }),
    services
      ? [
          h(
            'label',
            { class: 'ad-field' },
            h('span', { text: at('ad.email') }),
            h('input', {
              type: 'email',
              id: 'ad-email',
              autocomplete: 'username',
              required: true,
            }),
          ),
          h(
            'label',
            { class: 'ad-field' },
            h('span', { text: at('ad.password') }),
            h('input', {
              type: 'password',
              id: 'ad-password',
              autocomplete: 'current-password',
              required: true,
            }),
          ),
          err,
          h('button', {
            type: 'submit',
            class: 'button primary wide',
            id: 'ad-signin',
            text: at('ad.signinBtn'),
          }),
          ...(services.demo
            ? [
                h('p', { class: 'ad-demo', text: at('ad.demo') }),
                h('p', { class: 'ad-demo hint mono', text: at('ad.demoHint') }),
              ]
            : []),
        ]
      : h('p', {
          class: 'ad-note warn',
          id: 'ad-no-server',
          role: 'alert',
          text: at('ad.noServer'),
        }),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('ad-email') as HTMLInputElement)
      .value;
    const pass = (document.getElementById('ad-password') as HTMLInputElement)
      .value;
    if (await auth.signIn(email, pass)) start(email.trim().toLowerCase());
    else showGate(at('ad.signinBad'));
  });
  clear(root, h('div', { class: 'ad-gate' }, form));
  (document.getElementById('ad-email') as HTMLElement | null)?.focus();
}

function start(who: string) {
  const services = adminServices();
  if (!services) return showGate();
  const nav = h('nav', { class: 'ad-nav', 'aria-label': at('ad.title') });
  const out = h('main', { class: 'ad-outlet', id: 'ad-outlet', tabindex: -1 });
  const banner = h('div', {
    class: 'ad-banner',
    id: 'ad-banner',
    role: 'status',
    hidden: true,
  });
  const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });

  const ctx: AdminCtx = {
    s: services,
    who,
    go: (route) => {
      if (location.hash === `#/${route}`) void render();
      else location.hash = `#/${route}`;
    },
    toast: (message, kind = 'ok') => {
      const el = h('div', { class: `toast ${kind}`, text: message });
      toasts.append(el);
      setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3200);
    },
    refreshBanner: () => void paintBanner(),
  };

  async function paintBanner() {
    try {
      const e = await services!.client.emergency();
      const on = e.aiOff || e.signupsOff || e.paymentsOff;
      banner.hidden = !on;
      if (on)
        clear(
          banner,
          aicon('emergency', 18),
          h('span', { text: at('ad.banner.on', { what: whatText(e) }) }),
          h('a', { href: '#/emergency', text: at('ad.banner.open') }),
        );
    } catch {
      banner.hidden = true;
    }
  }

  const render = async () => {
    const [route = 'dashboard', ...args] = location.hash
      .replace(/^#\//, '')
      .split('?')[0]!
      .split('/');
    const name = SCREENS[route] ? route : 'dashboard';
    for (const a of nav.querySelectorAll('a')) {
      const on = a.dataset.route === name;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    out.setAttribute('aria-busy', 'true');
    clear(out, h('p', { class: 'loading', text: at('ad.loading') }));
    await SCREENS[name]!(ctx, args, out);
    out.removeAttribute('aria-busy');
  };

  const paintNav = () => {
    let group: AdminKey | null = null;
    const items: Node[] = [];
    for (const n of NAV) {
      if (n.group !== group) {
        group = n.group;
        items.push(h('p', { class: 'ad-nav-group', text: at(n.group) }));
      }
      items.push(
        h(
          'a',
          { href: `#/${n.route}`, 'data-route': n.route, class: 'ad-nav-item' },
          aicon(n.icon),
          h('span', { text: at(n.key) }),
        ),
      );
    }
    clear(nav, ...items);
  };
  paintNav();

  const shell = () => {
    clear(
      root,
      h(
        'div',
        { class: 'ad-shell' },
        h(
          'aside',
          { class: 'ad-side' },
          h(
            'div',
            { class: 'ad-brand' },
            h('span', { class: 'ad-brand-dot' }),
            h('strong', { text: at('ad.title') }),
          ),
          nav,
          h('p', {
            class: 'ad-demo-chip',
            text: services.demo ? at('ad.demo') : '',
          }),
        ),
        h(
          'div',
          { class: 'ad-main' },
          h(
            'header',
            { class: 'ad-top' },
            h('span', { class: 'ad-who mono', id: 'ad-who', text: who }),
            h('button', {
              type: 'button',
              class: 'button sm ghost',
              id: 'ad-lang',
              text: at('ad.lang'),
              onclick: () => {
                const next = adminLocale() === 'en' ? 'hi' : 'en';
                setAdminLocale(next);
                remember('aive.admin.locale', next);
                shell();
                void paintBanner();
                void render();
              },
            }),
            h(
              'button',
              {
                type: 'button',
                class: 'button sm ghost',
                id: 'ad-theme',
                'aria-label': at('ad.theme'),
                title: at('ad.theme'),
                onclick: () => {
                  const next =
                    document.documentElement.dataset.theme === 'light'
                      ? 'dark'
                      : 'light';
                  document.documentElement.dataset.theme = next;
                  remember('aive.admin.theme', next);
                },
              },
              aicon('sun', 16),
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'button sm ghost',
                id: 'ad-signout',
                onclick: () => {
                  auth.signOut();
                  window.removeEventListener('hashchange', render);
                  showGate();
                },
              },
              aicon('signout', 16),
              at('ad.signout'),
            ),
          ),
          banner,
          out,
        ),
        toasts,
      ),
    );
    paintNav();
  };
  shell();
  window.addEventListener('hashchange', render);
  void paintBanner();
  void render();
}

const existing = auth.user();
if (existing && adminServices()) start(existing);
else showGate();
