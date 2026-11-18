// P2-17: the user panel's entry (its own page, never part of the editor bundle).
import '../ui/tokens.css';
import './aurora.css';
import './panel.css';
import './cinema.css';
import './studio.css';
import './mine.css';
import './credits.css';
import './polish.css';
import './workspace.css';
import './projects.css';
import './round-b.css';
import { startControls } from './controls';
import { createServices } from './services';
import { mountPanel, type Screen } from './app';
import { maintenancePage, siteBanner } from './site-notices';
import { watchSlots } from './appearance';
import { t } from './strings';
import type { MockFailure } from '../gateway';
import {
  brandScreen,
  creditsScreen,
  homeScreen,
  learnScreen,
  settingsScreen,
  stylesScreen,
} from './screens/pages';
import { studioScreen } from './screens/studio';
import { assetsScreen } from './screens/library';
import { projectScreen, projectsScreen } from './screens/workspace';
import { claudePageScreen, connectClaudeScreen } from './screens/claude';
import { migrateP3Memory } from './p3-services';

const root = document.getElementById('panel')!;
const screens: Record<string, Screen> = {
  home: homeScreen,
  styles: stylesScreen,
  project: projectScreen,
  studio: studioScreen,
  assets: assetsScreen,
  projects: projectsScreen,
  credits: creditsScreen,
  brand: brandScreen,
  learn: learnScreen,
  settings: settingsScreen,
  // ROUND-C2: the consent page the Claude connector's sign-in opens.
  'connect-claude': connectClaudeScreen,
  // ROUND-C3 (0.5): Home's Connect Claude.
  claude: claudePageScreen,
};

// Dev and e2e only: make the offline mock model fail on its Nth call, to
// prove refunds. A production build ignores it.
const e2eFailure = ():
  MockFailure | ((r: unknown) => MockFailure) | undefined => {
  if (!import.meta.env.DEV) return undefined;
  const n = Number(
    (window as { __AIVE_E2E_MOCK_FAIL_AT__?: number })
      .__AIVE_E2E_MOCK_FAIL_AT__,
  );
  if (!Number.isFinite(n) || n <= 0) return undefined;
  let calls = 0;
  return () => (++calls === n ? 'error' : 'none');
};

async function start() {
  root.textContent = t('app.loading');
  try {
    const failure = e2eFailure();
    const services = await createServices(
      localStorage,
      failure ? { mockFailure: failure } : {},
    );
    const user = await services.account.user();
    if (!user) {
      // Owner rule 5: no guest mode. Logged-out people see the website.
      // ROUND-C3 (0.4): Claude's consent page sends a new person to Sign up
      // (it links to Log in for those who have an account); `next` is kept.
      const page = location.hash.startsWith('#/connect-claude')
        ? 'signup'
        : 'login';
      location.replace(
        `/site/#/${page}?next=${encodeURIComponent('/panel/' + location.hash)}`,
      );
      return;
    }
    // Plan, credits and usage (the server's, when it is used).
    await services.sync(user.id);
    // ROUND-C5 (1.6): under maintenance the panel shows its page; the
    // owner's own accounts (workspace.ownerEmails) are never locked out.
    const owner = services.config.workspace.ownerEmails.includes(
      (user.email ?? '').toLowerCase(),
    );
    const closed = owner ? null : maintenancePage(services.config, 'panel');
    if (closed) {
      root.replaceChildren(closed);
      return;
    }
    startControls();
    mountPanel(root, services, user, screens);
    // ROUND-C5 (2.1): every card and hero is a slot the owner may dress.
    watchSlots(
      root,
      () => services.config,
      () => (document.documentElement.lang === 'hi' ? 'hi' : 'en'),
    );
    // ROUND-C5 (1.5): the owner's banner over the panel.
    const banner = siteBanner(services.config, 'panel');
    if (banner) root.prepend(banner);
    // ROUND-B B1: old Project chats move to their first Video (once).
    void migrateP3Memory({ s: services, user } as never);
  } catch (e) {
    console.debug('[panel] start failed', e);
    root.textContent = t('app.error');
    root.setAttribute('role', 'alert');
  }
}
void start();
