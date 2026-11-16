// ROUND-C4: what a person sees of Readymade Styles in the panel and the
// website. 0.3 (RDC4-003): the New project dialog lists published Styles
// only (the owner's own account also sees a Draft). 1.7 (RDC4-026): a Style
// limited to a paid plan is locked with the panel's Upgrade on the free plan
// and open on the paid one. 1.9 (RDC4-027): a Style going Draft, Published,
// back to Tested is followed by the panel's Home and Styles page and the
// website's Styles with no restart (the Platform Config publish path).
import type { Page } from '@playwright/test';
import { test, expect, allowError } from './fixtures';
import { createHash } from 'node:crypto';
import { PASSWORD } from './p2-helpers';
import { startC2Stack, type C2Stack } from './round-c2-stack';
import {
  defaultConfig,
  type PlatformConfig,
  type Style,
} from '../src/platform-config';
import { draftStyleFromVideo } from '../src/director/style-builder';
import { say, toPlan } from './round-b-helpers';

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
const facts = (base: Style, o: Partial<Style>): Style =>
  ({
    ...base,
    id: 'facts-c4',
    name: { en: 'Facts C4' },
    status: 'published',
    publishOverride: 'Checked by hand for the C4 test.',
    planTemplate: template,
    slots: [
      { name: 'topic', kind: 'text', default: 'the sky', route: 'later' },
    ],
    order: 90,
    ...o,
  }) as Style;

async function start(page: Page, edit: (c: PlatformConfig) => void) {
  stack = await startC2Stack(
    (c) => {
      c.workspace.ownerEmails = ['owner-c4@example.com'];
      edit(c);
    },
    { CONFIG_TTL_MS: '0' },
  );
  await page.addInitScript((u) => {
    (window as { __AIVE_GATEWAY_URL__?: string }).__AIVE_GATEWAY_URL__ = u;
  }, stack.url);
  allowError(
    page,
    (m) => /401|403|404|Failed to load resource/.test(m),
    'RDC4: the panel reads the connector state before sign-in; a plan switch may answer 403 on purpose.',
  );
}
/** The server's person id for a local sign-in (server/app.ts, /v1/local/token). */
function personId(email: string) {
  const sub = createHash('sha256').update(email).digest('hex').slice(0, 32);
  return `${sub.slice(0, 8)}-${sub.slice(8, 12)}-${sub.slice(12, 16)}-${sub.slice(16, 20)}-${sub.slice(20, 32)}`;
}
/** A full page load of a panel or website address (not a hash change). */
async function load(page: Page, url: string) {
  await page.goto(url);
  await page.reload();
}
async function signUpAs(page: Page, email: string) {
  await page.goto('/site/#/signup');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();
  await expect(page).toHaveURL(/\/panel\//);
}
/** Publishes a new live config the way the Owner App's save does. */
async function publish(edit: (c: PlatformConfig) => void) {
  const versions = await stack!.store.configVersions();
  const last = versions.sort((a, b) => b.version - a.version)[0]!;
  const next = JSON.parse(JSON.stringify(last.config)) as PlatformConfig;
  edit(next);
  await stack!.store.saveConfigVersion({
    version: last.version + 1,
    savedAt: new Date().toISOString(),
    note: 'c4',
    config: next,
  });
  await stack!.store.setLiveConfig(last.version + 1);
}

test("[RDC4-003] the New project dialog lists Published Styles only; a Draft is missing for a person and shown to the owner's own account; a Published one is in both", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await start(page, (c) => {
    const base = c.styles[0]!;
    c.styles.push(
      facts(base, {}),
      facts(base, {
        id: 'draft-c4',
        name: { en: 'Draft C4' },
        status: 'draft',
        order: 91,
      }),
    );
  });
  const open = async () => {
    await page.goto('/panel/#/projects?new=1');
    await page.locator('[data-option="style"]').click();
    await expect(page.locator('#np-gallery')).toBeVisible();
  };
  await signUpAs(page, `person-${Date.now()}@example.com`);
  await open();
  await expect(page.locator('[data-template="facts-c4"]')).toBeVisible();
  await expect(page.locator('[data-template="draft-c4"]')).toHaveCount(0);
  await page.goto('/panel/#/home');
  await page.locator('#sign-out').click();
  await signUpAs(page, 'owner-c4@example.com');
  await open();
  await expect(page.locator('[data-template="facts-c4"]')).toBeVisible();
  await expect(page.locator('[data-template="draft-c4"]')).toBeVisible();
});

test("[RDC4-026] a Style the owner limits to the Pro plan: the free person sees it locked with the panel's Upgrade and the plan sentence; on Pro it opens", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await start(page, (c) => {
    c.styles.push(facts(c.styles[0]!, { plans: ['pro'] }));
  });
  const email = `free-${Date.now()}@example.com`;
  await signUpAs(page, email);
  await page.goto('/panel/#/styles');
  const card = page.locator('[data-style="facts-c4"]');
  await expect(card).toHaveAttribute('data-locked', 'true');
  await expect(card.locator('[data-upgrade="facts-c4"]')).toBeVisible();
  await expect(card.locator('[data-plan-locked="facts-c4"]')).toHaveText(
    'This Style is part of the Pro plan.',
  );
  // On Pro (set on the server the way the payment webhook does).
  const id = personId(email);
  await expect.poll(async () => !!(await stack!.store.profile(id))).toBe(true);
  await stack!.store.saveProfile({
    ...(await stack!.store.profile(id))!,
    plan: 'pro',
  });
  await load(page, '/panel/#/styles');
  await expect(card).toHaveAttribute('data-locked', 'false');
  await expect(card.locator('[data-use-style="facts-c4"]')).toBeVisible();
});

test("[RDC4-027] Draft → Published → back to Tested: the panel's Styles page and Home and the website's Styles follow each publish with no restart", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await start(page, (c) => {
    c.styles.push(facts(c.styles[0]!, { status: 'draft' }));
  });
  const site = async () => {
    await load(page, '/site/#/styles');
    await expect(page.locator('[data-style]').first()).toBeVisible();
    return page.locator('[data-style="facts-c4"]').count();
  };
  expect(await site()).toBe(0);
  await signUpAs(page, `viewer-${Date.now()}@example.com`);
  await page.goto('/panel/#/styles');
  await expect(page.locator('[data-style]').first()).toBeVisible();
  await expect(page.locator('[data-style="facts-c4"]')).toHaveCount(0);
  await publish((c) => {
    c.styles.find((s) => s.id === 'facts-c4')!.status = 'published';
  });
  await load(page, '/panel/#/styles');
  await expect(page.locator('[data-style="facts-c4"]')).toBeVisible();
  await load(page, '/panel/#/home');
  await expect(
    page.locator('#style-reel [data-style="facts-c4"]'),
  ).toBeVisible();
  expect(await site()).toBe(1);
  await publish((c) => {
    c.styles.find((s) => s.id === 'facts-c4')!.status = 'tested';
  });
  expect(await site()).toBe(0);
  await load(page, '/panel/#/styles');
  await expect(page.locator('[data-style]').first()).toBeVisible();
  await expect(page.locator('[data-style="facts-c4"]')).toHaveCount(0);
});

test("[RDC4-035] a Style made from a Video (draftStyleFromVideo), once Published: panel gallery, choose it, a short Brief, AI mode, and the first plan is the template with the person's topic filled in", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const made = draftStyleFromVideo(
    defaultConfig(),
    {
      name: 'Volcano facts',
      plan: {
        format: 'video-plan',
        version: 4,
        meta: { title: 'Volcanoes', language: 'en', aspect: '9:16', fps: 30 },
        captions: { enabled: false },
        scenes: [
          {
            id: 'open',
            title: 'Opening',
            narration: 'Every volcano starts deep below.',
            durationHint: 4,
            notes: 'method:library',
            layers: [
              { id: 't', kind: 'title', text: 'Deep below', anchor: 'center' },
            ],
          },
        ],
      },
      cost: 5,
    },
    'volcano-facts',
  );
  if (!made.ok) throw new Error(made.message);
  await start(page, (c) => {
    c.styles.push({
      ...made.style,
      status: 'published',
      publishOverride: "Made from the owner's tested Video (C4 test).",
      order: 1,
    });
  });
  await signUpAs(page, `maker-${Date.now()}@example.com`);
  await page.goto('/panel/#/styles');
  await page.locator('[data-style="volcano-facts"] [data-use-style]').click();
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/, {
    timeout: 30_000,
  });
  await say(page, 'How deserts form, in English, 30 seconds');
  await toPlan(page);
  await expect(page.locator('#ai-plan-card h4')).toContainText(
    'How deserts form',
  );
});
