// ROUND-C3 Part 6.1 (RDC3-062): Readymade Styles in the panel. People see
// published Styles only; the owner's own account also sees a Tested one,
// marked. A Style with a plan template gives the Director its first plan,
// the slots filled from the Brief.
import { test, expect, allowError } from './fixtures';
import { PASSWORD } from './p2-helpers';
import { say, toPlan } from './round-b-helpers';
import { startC2Stack, type C2Stack } from './round-c2-stack';
import type { PlatformConfig } from '../src/platform-config';

let stack: C2Stack | null = null;
test.afterEach(async () => {
  await stack?.close();
  stack = null;
});
const template = {
  format: 'video-plan',
  version: 4,
  meta: { title: 'Fact: {{topic}}', language: 'en', aspect: '9:16', fps: 30 },
  captions: { enabled: false },
  scenes: [
    {
      id: 'open',
      title: '{{topic}}',
      narration: 'Here is a fact about {{topic}}.',
      durationHint: 4,
      notes: 'method:library',
      layers: [{ id: 't', kind: 'title', text: '{{topic}}', anchor: 'center' }],
    },
  ],
};
async function withStyles(page: import('@playwright/test').Page) {
  stack = await startC2Stack((c: PlatformConfig) => {
    const base = c.styles[0]!;
    c.workspace.ownerEmails = ['owner@example.com'];
    c.styles.push(
      {
        ...base,
        id: 'facts-tested',
        name: { en: 'Facts (tested)' },
        status: 'tested',
        order: 90,
      },
      {
        ...base,
        id: 'facts-in-60',
        name: { en: 'Facts in 60' },
        status: 'published',
        publishOverride: 'Tested by hand on five topics in Round C3.',
        planTemplate: template,
        slots: [
          { name: 'topic', kind: 'text', default: 'the sky', route: 'later' },
        ],
        order: 91,
      } as never,
    );
  });
  await page.addInitScript((u) => {
    (window as { __AIVE_GATEWAY_URL__?: string }).__AIVE_GATEWAY_URL__ = u;
  }, stack.url);
  allowError(
    page,
    (m) => /401|404|Failed to load resource/.test(m),
    'RDC3-062: the panel reads the connector state before sign-in.',
  );
}
async function signUpAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/site/#/signup');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();
  await expect(page).toHaveURL(/\/panel\//);
}

test('[RDC3-062] the Styles page and Home show published Styles only; the owner also sees a Tested Style, marked; a Style with a template gives the Director its first plan with the slots filled from the Brief', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await withStyles(page);
  await signUpAs(page, `person-${Date.now()}@example.com`);
  await page.goto('/panel/#/styles');
  await expect(page.locator('[data-style="facts-in-60"]')).toBeVisible();
  await expect(page.locator('[data-style="facts-tested"]')).toHaveCount(0);
  await page.goto('/panel/#/home');
  await expect(
    page.locator('#style-reel [data-style="facts-tested"]'),
  ).toHaveCount(0);
  // The owner's own account.
  await page.locator('#sign-out').click();
  await signUpAs(page, 'owner@example.com');
  await page.goto('/panel/#/styles');
  await expect(
    page.locator('[data-style="facts-tested"] [data-style-status="tested"]'),
  ).toHaveText('Tested (only you see it)');
  // The template Style: the first plan is the template, filled.
  await page.locator('[data-style="facts-in-60"] [data-use-style]').click();
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/, {
    timeout: 30_000,
  });
  await say(page, 'Volcanoes, in English, 30 seconds');
  await toPlan(page);
  await expect(page.locator('#ai-plan-card h4')).toContainText('Fact: ');
});
