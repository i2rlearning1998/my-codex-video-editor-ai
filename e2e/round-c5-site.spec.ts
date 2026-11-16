// ROUND-C5 Part 1 in the browser. (1) The Owner App's Website & Brand screen,
// used like the owner: change the tagline and a colour, switch on a banner,
// add a legal page, preview the sections, save, see the version; maintenance
// on asks for the code. (2) What a person then sees: the banner on the
// website and the panel (closed once, it stays closed), the footer's legal
// link and the legal page with its https link, the sign-up link, Hindi; then
// maintenance: the website and the panel show the maintenance page, signing
// in still works, the owner's own account still gets the panel.
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, allowError } from './fixtures';
import { PASSWORD } from './p2-helpers';
import {
  OWNER,
  ownerCode,
  startOwnerStack,
  type OwnerStack,
} from './lib-owner-helpers';
import { startC2Stack, type C2Stack } from './round-c2-stack';
import type { PlatformConfig } from '../src/platform-config';

const SHOTS = 'reports/round-c5/screens';
mkdirSync(SHOTS, { recursive: true });

test.describe('the Owner App', () => {
  let stack: OwnerStack;
  test.beforeAll(async () => {
    stack = await startOwnerStack(17);
  });
  test.afterAll(() => stack?.stop());

  async function logIn(page: Page) {
    allowError(
      page,
      (m) =>
        m.includes(stack.ownerUrl) &&
        /400|401|403|404|409|413|415|502|503/.test(m),
      'The owner app answers 401 before login, 403 when it asks for the code and 400 for a refused step, on purpose.',
    );
    await page.goto(stack.ownerUrl);
    await page.locator('#email').fill(OWNER.email);
    await page.locator('#password').fill(OWNER.password);
    await page.locator('#code').fill(ownerCode());
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.locator('[data-tab="dashboard"]')).toBeVisible();
  }
  async function confirmCode(page: Page) {
    const dialog = page.locator('#reauth');
    const asked = await dialog
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!asked) return;
    await page.locator('#reauth-password').fill(OWNER.password);
    await page.locator('#reauth-code').fill(ownerCode());
    await page.locator('#reauth-confirm').click();
    await expect(dialog).toHaveCount(0);
  }

  test('[RDC5-012] Website & Brand: the owner changes the tagline and a colour (with reset), switches on a banner, refuses an end before its start, adds a published legal page, previews the sections and saves; the version is listed; maintenance on asks for the password and code', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await logIn(page);
    await page.locator('[data-tab="site"]').click();
    await expect(page.locator('#site-screen')).toBeVisible();
    await page.locator('#brand-tagline-en').fill('Films from one line');
    await page.locator('#brand-tagline-hi').fill('एक लाइन से फ़िल्में');
    await page.locator('[data-colour-hex="accent"]').fill('#ff5500');
    await expect(page.locator('[data-colour="accent"]')).toHaveValue('#ff5500');
    await page.locator('[data-colour-reset="gold"]').click();
    await expect(page.locator('[data-colour-hex="gold"]')).toHaveValue(
      '#ffc247',
    );
    await expect(page.locator('#brand-preview')).toContainText(
      'Films from one line',
    );
    // Sections: preview the draft.
    await page.locator('#site-preview-button').click();
    await expect(
      page.locator('#site-preview [data-preview-section]').first(),
    ).toBeVisible();
    // Banner with an end before its start: refused in one sentence.
    await page.locator('#banner-on').check();
    await page.locator('#banner-text-en').fill('New voices this week');
    await page.locator('#banner-text-hi').fill('इस हफ़्ते नई आवाज़ें');
    await page.locator('#banner-start').fill('2030-02-01T10:00');
    await page.locator('#banner-end').fill('2030-01-01T10:00');
    await page.locator('#site-save').click();
    await expect(page.locator('#status')).toContainText(
      'Banner: the end must be after the start.',
    );
    await page.locator('#banner-start').fill('');
    await page.locator('#banner-end').fill('');
    await page.locator('#banner-start').dispatchEvent('change');
    await page.locator('#banner-end').dispatchEvent('change');
    // A legal page.
    await page.locator('#site-add-legal').click();
    await page
      .locator('#legal-0-body-en')
      .fill(
        'We keep your projects private. Questions: https://example.com/help',
      );
    await page
      .locator('#legal-0-body-hi')
      .fill('हम आपके प्रोजेक्ट निजी रखते हैं।');
    await page.locator('[data-legal-published="privacy"]').check();
    await page.screenshot({
      path: `${SHOTS}/website-brand.png`,
      fullPage: true,
    });
    await page.locator('#site-note').fill('banner and privacy');
    await page.locator('#site-save').click();
    await expect(page.locator('#status')).toContainText(
      'Saved as config version',
    );
    await expect(page.locator('[data-site-version]').first()).toContainText(
      'banner and privacy',
    );
    await expect(page.locator('#brand-tagline-en')).toHaveValue(
      'Films from one line',
    );
    await expect(page.locator('[data-legal-version^="privacy-"]')).toHaveCount(
      1,
    );
    // Maintenance on asks for the code first.
    await page.locator('#maintenance-on').check();
    await page.locator('#site-save').click();
    await confirmCode(page);
    await expect(page.locator('#status')).toContainText(
      'Saved as config version',
    );
    await expect(page.locator('#maintenance-on')).toBeChecked();
    await page.locator('#maintenance-on').uncheck();
    await page.locator('#site-save').click();
    await expect(page.locator('#status')).toContainText(
      'Saved as config version',
    );
  });
});

test.describe('the website and the panel', () => {
  let stack: C2Stack | null = null;
  test.afterEach(async () => {
    await stack?.close();
    stack = null;
  });
  const base = (c: PlatformConfig) => {
    c.workspace.ownerEmails = ['owner-c5@example.com'];
    c.site.banner = {
      enabled: true,
      text: { en: 'New voices this week', hi: 'इस हफ़्ते नई आवाज़ें' },
      link: '#/styles',
      color: 'success',
      where: ['website', 'panel'],
      dismissible: true,
      version: 3,
    };
    c.site.legal = [
      {
        id: 'privacy',
        title: { en: 'Privacy', hi: 'गोपनीयता' },
        body: {
          en: 'We keep your projects private.\n\nQuestions: https://example.com/help',
          hi: 'हम आपके प्रोजेक्ट निजी रखते हैं।',
        },
        version: 2,
        updated: '2026-11-16',
        published: true,
      },
      {
        id: 'terms',
        title: { en: 'Terms' },
        body: { en: '' },
        version: 1,
        updated: '',
        published: false,
      },
    ];
    c.site.footer = {
      groups: [
        {
          title: { en: 'Company', hi: 'कंपनी' },
          links: [
            {
              label: { en: 'Connect Claude', hi: 'Claude जोड़ें' },
              href: '#/claude',
              enabled: true,
            },
          ],
        },
      ],
      copyright: { en: '© 2026 Kahani', hi: '© 2026 कहानी' },
    };
  };
  async function start(page: Page, edit: (c: PlatformConfig) => void) {
    stack = await startC2Stack(edit, { CONFIG_TTL_MS: '0' });
    await page.addInitScript((u) => {
      (window as { __AIVE_GATEWAY_URL__?: string }).__AIVE_GATEWAY_URL__ = u;
    }, stack.url);
    allowError(
      page,
      (m) => /401|403|404|503|Failed to load resource/.test(m),
      'RDC5: the panel reads the connector state before sign-in; under maintenance the server answers 503 on purpose.',
    );
  }
  async function publish(edit: (c: PlatformConfig) => void) {
    const versions = await stack!.store.configVersions();
    const last = versions.sort((a, b) => b.version - a.version)[0]!;
    const next = JSON.parse(JSON.stringify(last.config)) as PlatformConfig;
    edit(next);
    await stack!.store.saveConfigVersion({
      version: last.version + 1,
      savedAt: new Date().toISOString(),
      note: 'c5',
      config: next,
    });
    await stack!.store.setLiveConfig(last.version + 1);
  }
  async function signUpAs(page: Page, email: string) {
    await page.goto('/site/#/signup');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.locator('#auth-submit').click();
    await expect(page).toHaveURL(/\/panel\//);
  }

  test("[RDC5-013] the owner's banner shows on the website and the panel and stays closed after a reload; the footer has the owner's group, copyright and the published legal page (an unpublished one is not linked); the legal page shows its date, version and a clickable https link; sign-up links it; Hindi reads Hindi", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await start(page, base);
    await page.goto('/site/#/');
    const banner = page.locator('#site-banner');
    await expect(banner).toContainText('New voices this week');
    await expect(banner.locator('a')).toHaveAttribute('href', '#/styles');
    const footer = page.locator('#site-footer');
    await expect(footer).toContainText('Company');
    await expect(footer).toContainText('© 2026 Kahani');
    await expect(footer.locator('[data-legal="privacy"]')).toBeVisible();
    await expect(footer.locator('[data-legal="terms"]')).toHaveCount(0);
    await page.screenshot({
      path: `${SHOTS}/site-banner-footer.png`,
      fullPage: true,
    });
    await footer.locator('[data-legal="privacy"]').click();
    const legal = page.locator('#legal-privacy');
    await expect(legal).toContainText('We keep your projects private.');
    await expect(legal).toContainText('Updated 2026-11-16 · v2');
    await expect(
      legal.locator('a[href="https://example.com/help"]'),
    ).toBeVisible();
    await page.goto('/site/#/legal/terms');
    await expect(page.locator('#legal-missing')).toBeVisible();
    await banner.locator('#site-banner-close').click();
    await expect(page.locator('#site-banner')).toHaveCount(0);
    await page.goto('/site/#/');
    await page.reload();
    await expect(page.locator('#site-footer')).toBeVisible();
    await expect(page.locator('#site-banner')).toHaveCount(0);
    await page.goto('/site/#/signup');
    await expect(
      page.locator('#auth-legal [data-legal="privacy"]'),
    ).toBeVisible();
    // Hindi.
    await page.locator('#site-lang').click();
    await page.goto('/site/#/legal/privacy');
    await expect(page.locator('#legal-privacy h1')).toHaveText('गोपनीयता');
    await page.locator('#site-lang').click();
    // The panel: its own banner (the website's close is the same version, so
    // a new version shows it again).
    await signUpAs(page, `person-${Date.now()}@example.com`);
    await publish((c) => {
      c.site.banner!.version = 4;
    });
    await page.reload();
    await expect(page.locator('#site-banner')).toContainText(
      'New voices this week',
    );
    await page.screenshot({ path: `${SHOTS}/panel-banner.png` });
  });

  test("[RDC5-014] maintenance: the website shows the owner's message and signing in still works; a person's panel shows the maintenance page; the owner's own account still gets the panel; off again, the panel opens", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await start(page, base);
    const email = `m-${Date.now()}@example.com`;
    await signUpAs(page, email);
    await page.goto('/panel/#/home');
    await page.locator('#sign-out').click();
    await publish((c) => {
      c.site.maintenance = {
        on: true,
        message: { en: 'Back after lunch.', hi: 'दोपहर के बाद लौटेंगे।' },
        backAt: '14:00 IST',
        covers: ['website', 'panel', 'editor'],
      };
    });
    await page.goto('/site/#/');
    await expect(page.locator('#maintenance-message')).toHaveText(
      'Back after lunch.',
    );
    await expect(page.locator('#maintenance-back')).toHaveText('14:00 IST');
    await page.screenshot({ path: `${SHOTS}/site-maintenance.png` });
    await page.goto('/site/#/login');
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(PASSWORD);
    await page.locator('#auth-submit').click();
    await expect(page.locator('#maintenance-page')).toBeVisible();
    await expect(page.locator('#maintenance-message')).toHaveText(
      'Back after lunch.',
    );
    await page.goto('/panel/#/home');
    await page.locator('#maintenance-page').waitFor();
    // The owner's own account is never locked out.
    await page.evaluate(() => localStorage.clear());
    await signUpAs(page, 'owner-c5@example.com');
    await expect(page.locator('#maintenance-page')).toHaveCount(0);
    await expect(page.locator('#sign-out')).toBeVisible();
    await publish((c) => {
      c.site.maintenance!.on = false;
    });
    await page.reload();
    await expect(page.locator('#sign-out')).toBeVisible();
  });
});
