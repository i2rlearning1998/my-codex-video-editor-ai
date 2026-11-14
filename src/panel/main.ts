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
      location.replace(
        `/site/#/login?next=${encodeURIComponent('/panel/' + location.hash)}`,
      );
      return;
    }
    // Plan, credits and usage (the server's, when it is used).
    await services.sync(user.id);
    startControls();
    mountPanel(root, services, user, screens);
    // ROUND-B B1: old Project chats move to their first Video (once).
    void migrateP3Memory({ s: services, user } as never);
  } catch (e) {
    console.debug('[panel] start failed', e);
    root.textContent = t('app.error');
    root.setAttribute('role', 'alert');
  }
}
void start();
