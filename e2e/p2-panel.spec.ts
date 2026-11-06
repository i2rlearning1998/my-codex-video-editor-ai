// P2-R1: the user panel and website in a real browser, on the offline mock
// (no keys, no third-party network). Every test acts like a person.
import { readFileSync } from 'node:fs';
import { test, expect, hook, settleBuild } from './fixtures';
import { balance, PASSWORD, setPlan, signUp, approvePlan } from './p2-helpers';
import { defaultConfig } from '../src/platform-config';

test('[P2R1-018] no guest mode: logged out sees only the website; sign up, log out, log in and reset a password; the editor opens only after login', async ({
  page,
}) => {
  await page.goto('/site/');
  await page.evaluate(() => localStorage.setItem('aive.e2e.noAutoLogin', '1'));
  await page.goto('/panel/');
  await expect(page).toHaveURL(/\/site\/#\/login/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/site\/#\/login/);
  await expect(page.locator('#auth-login')).toBeVisible();
  // Wrong details are refused with one sentence.
  await page.locator('#auth-email').fill('nobody@example.com');
  await page.locator('#auth-password').fill('wrong password');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-error')).toHaveText(
    'The email or password is wrong',
  );
  const email = await signUp(page);
  await page.locator('#sign-out').click();
  await expect(page).toHaveURL(/\/site\/$/);
  await expect(page.locator('#site-login')).toBeVisible();
  // Reset with the emailed code (local outbox).
  await page.goto('/site/#/login');
  await page.locator('#auth-forgot').click();
  await expect(page.locator('#auth-reset')).toBeVisible();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-note')).toContainText(/\d{6}/);
  const note = await page.locator('#auth-note').textContent();
  const code = /(\d{6})/.exec(note ?? '')![1]!;
  await page.locator('#auth-code').fill(code);
  await page.locator('#auth-password').fill('a brand new one');
  await page.locator('#auth-submit').click();
  await expect(page).toHaveURL(/\/panel\//);
  await page.locator('#sign-out').click();
  await page.goto('/site/#/login');
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-error')).toHaveText(
    'The email or password is wrong',
  );
  await page.locator('#auth-password').fill('a brand new one');
  await page.locator('#auth-submit').click();
  await expect(page).toHaveURL(/\/panel\//);
  // Logged in: the panel opens the editor.
  await page.locator('#open-editor').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.locator('#composition-canvas')).toBeVisible();
});

test('[P2R1-017] [P2R1-020] the panel shell: sidebar, credits pill, routes, Hindi, empty and error states; the plan and its limits come from config', async ({
  page,
}) => {
  await signUp(page);
  const nav = page.locator('nav.side .nav-item');
  await expect(nav).toHaveCount(9);
  expect(await balance(page)).toBe(60); // Free: 60 credits a month (config)
  await expect(page.locator('#plan-chip')).toHaveText('Free');
  for (const route of [
    'styles',
    'projects',
    'studio',
    'assets',
    'credits',
    'brand',
    'learn',
    'settings',
    'home',
  ]) {
    await page.locator(`nav.side [data-route="${route}"]`).click();
    await expect(page.locator(`.page[data-screen="${route}"]`)).toBeVisible();
    await expect(
      page.locator(`nav.side [data-route="${route}"]`),
    ).toHaveAttribute('aria-current', '');
  }
  await page.locator('nav.side [data-route="assets"]').click();
  await expect(page.locator('.empty-state')).toBeVisible();
  await page.goto('/panel/#/credits');
  await expect(page.locator('#usage-table')).toContainText('0 / 10'); // projects limit 10 on Free
  await expect(page.locator('#usage-table')).toContainText('0 / 60'); // credits a day
  // A broken screen shows the error state, not a blank page.
  await page.goto('/panel/#/brief/no-such-style');
  await expect(page.locator('.empty-state')).toBeVisible();
  // Hindi.
  await page.goto('/panel/#/settings');
  await page.locator('#settings-language').selectOption('hi');
  // A person moves the pointer off the rail before pressing Save.
  await page.mouse.move(900, 500);
  await page.locator('#settings-save').click();
  await expect(page.locator('nav.side [data-route="home"]')).toHaveText(/होम/);
  await expect(page.locator('#credits-pill')).toContainText('क्रेडिट');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
});

test('[P2R1-019] the brand name and accent come from the Platform Config', async ({
  page,
}) => {
  await page.goto('/site/');
  // The owner's published config (what Admin will write).
  const c = defaultConfig();
  c.brand.name = 'Vidya Studio';
  c.brand.colors.accent = '#e4572e';
  const stored = JSON.stringify({
    versions: [
      { version: 1, savedAt: '2026-11-01T00:00:00Z', note: 'brand', config: c },
    ],
    live: 1,
  });
  await page.evaluate(
    (v) => localStorage.setItem('aive.platformConfig', v),
    stored,
  );
  await page.reload();
  await expect(page.locator('.brand-name')).toHaveText('Vidya Studio');
  await expect(page).toHaveTitle('Vidya Studio');
  await signUp(page);
  await expect(page.locator('.top .brand-name')).toHaveText('Vidya Studio');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--accent')
        .trim(),
    ),
  ).toBe('#e4572e');
});

test('[P2R1-022] [P2R1-023] Home greets with credits and opens Director from the prompt; Styles filter, search, show prices and lock what the plan lacks', async ({
  page,
}) => {
  await signUp(page, 'meera.home@example.com');
  await expect(page.locator('#greeting')).toHaveText('Hello, meera.home');
  await expect(page.locator('#home-balance')).toContainText('60 credits');
  await expect(page.locator('.page [data-style]')).toHaveCount(3);
  await expect(page.locator('.page .list li')).toHaveCount(3); // Learn
  await page.locator('#chat-input').fill('How Eratosthenes measured the Earth');
  await page.locator('[data-start="brief"]').click();
  await expect(page.locator('h1')).toContainText('Story Explainer');
  await expect(page.locator('#f-idea')).toHaveValue(
    'How Eratosthenes measured the Earth',
  );
  await page.goto('/panel/#/styles');
  await expect(page.locator('#style-grid [data-style]')).toHaveCount(3);
  await expect(page.locator('[data-style="cinematic-story"]')).toHaveAttribute(
    'data-locked',
    'true',
  );
  await expect(page.locator('[data-upgrade="cinematic-story"]')).toBeVisible();
  await expect(
    page.locator('[data-style="story-explainer"] .price'),
  ).toHaveText('About 25–60 credits per minute');
  await page.locator('#style-search').fill('short');
  await expect(page.locator('#style-grid [data-style]')).toHaveCount(1);
  await page.locator('#style-search').fill('');
  await page.locator('[data-format="1:1"]').click();
  await expect(page.locator('#style-grid [data-style]')).toHaveCount(1);
  await page.locator('[data-format=""]').click();
  await page.locator('#style-mine').check();
  await expect(page.locator('#style-grid [data-style]')).toHaveCount(2);
  await page.locator('[data-upgrade]').first().waitFor({ state: 'detached' });
});

test('[P2R1-024] [P2R1-025] Brief Room: fields from config with show-if and validation, brief strength, and an estimate that changes with the model; drafts are kept', async ({
  page,
}) => {
  await signUp(page);
  await setPlan(page, 'pro');
  await page.goto('/panel/#/brief/quick-short');
  // Every field type from config.
  for (const type of [
    'text',
    'multi',
    'slider',
    'toggle',
    'color',
    'voice',
    'ref',
    'number',
  ])
    await expect(
      page.locator(`.field[data-type="${type}"]`).first(),
    ).toBeVisible();
  await page.locator('#make-plan').click();
  await expect(page.locator('[data-field="hook"] .field-error')).toHaveText(
    'This is needed.',
  );
  await expect(page.locator('[data-field="points"] .field-error')).toHaveText(
    'This is needed.',
  );
  await page.locator('#f-cta').fill('25');
  await expect(page.locator('[data-field="cta"] .field-error')).toHaveText(
    'Use a number from 0 to 10.',
  );
  await page.locator('#f-cta').fill('5');
  await page.locator('#f-hook').fill('Why is the sky blue?');
  await page.locator('[data-field="points"] input[value="facts"]').check();
  await expect(page.locator('#brief-strength')).toContainText(/Good|Strong/);
  // The estimate follows the model.
  const est = page.locator('#brief-estimate');
  await page.locator('[data-model="mock-fast"]').click();
  await expect(est).toHaveText(/Estimated cost: \d+–\d+ credits/);
  const fast = Number(await est.getAttribute('data-max'));
  await page.locator('[data-model="mock-best"]').click();
  await expect
    .poll(async () => Number(await est.getAttribute('data-max')))
    .toBeGreaterThan(fast);
  // More scenes cost more.
  const best = Number(await est.getAttribute('data-max'));
  await page.locator('#f-scenes').fill('8');
  await expect
    .poll(async () => Number(await est.getAttribute('data-max')))
    .toBeGreaterThan(best);
  await expect(page.locator('#draft-saved')).toHaveText('Draft saved');
  // Show-if: Story Explainer's caption style appears only with a language.
  await page.goto('/panel/#/brief/story-explainer');
  await expect(page.locator('[data-field="captionStyle"]')).toBeHidden();
  await page.locator('[data-field="captionLang"] input[value="hi"]').check();
  await expect(page.locator('[data-field="captionStyle"]')).toBeVisible();
  // Drafts survive a reload.
  await page.goto('/panel/#/brief/quick-short');
  await expect(page.locator('#f-hook')).toHaveValue('Why is the sky blue?');
  // Free plan: Best is locked.
  await setPlan(page, 'free');
  await page.goto('/panel/#/brief/quick-short');
  await expect(page.locator('[data-model="mock-best"]')).toBeDisabled();
});

async function circumferenceBrief(page: import('@playwright/test').Page) {
  await page.goto('/panel/#/styles');
  await page.locator('[data-style="story-explainer"] a.button').click();
  await page
    .locator('#f-idea')
    .fill(
      'How Eratosthenes measured the circumference of the Earth. He used shadows in two cities.',
    );
  await page.locator('#talk-director').click();
  // Director asks only what the brief does not answer.
  await expect(page.locator('.msg[data-kind="question"]').last()).toContainText(
    'script',
  );
  await page.locator('#chat-input').fill('Write it for me');
  await page.locator('#chat-send').click();
  await page.locator('#chat-input').fill('Text to speech');
  await page.locator('#chat-send').click();
  // A forbidden request gets the owner's reply.
  await page
    .locator('#chat-input')
    .fill('also make a deepfake of a famous scientist');
  await page.locator('#chat-send').click();
  await expect(page.locator('.msg[data-kind="refusal"]')).toContainText(
    'I do not make videos that pretend to be a real person',
  );
  await page.locator('#chat-input').fill('None');
  await page.locator('#chat-send').click();
  await page.locator('#chat-input').fill('Hindi');
  await page.locator('#chat-send').click();
  await expect(page.locator('.msg[data-kind="upgrade"]')).toBeVisible();
  await page.locator('#make-plan').click();
  await expect(page.locator('#plan-card .scene')).toHaveCount(5);
}

test('[P2R1-029] the Plan card: methods with cheaper and richer swaps, per-scene and total credits for the chosen model, balance, a shortage with options, and Cancel', async ({
  page,
}) => {
  await signUp(page);
  await circumferenceBrief(page);
  const total = page.locator('#plan-total');
  await expect(total).toHaveText(/Total: \d+–\d+ credits/);
  await expect(page.locator('#plan-balance')).toHaveText(
    'Your balance: 60 credits',
  );
  await expect(page.locator('.scene').first()).toHaveAttribute(
    'data-method',
    'library',
  );
  await expect(page.locator('.scene').nth(1)).toHaveAttribute(
    'data-method',
    'motion-graphics',
  );
  await expect(page.locator('.scene').nth(1).locator('.scene-cost')).toHaveText(
    /\d+–\d+ credits/,
  );
  const before = Number(await total.getAttribute('data-max'));
  await page.locator('.scene').nth(1).locator('[data-swap="cheaper"]').click();
  await expect(page.locator('.scene').nth(1)).toHaveAttribute(
    'data-method',
    'stock',
  );
  await expect
    .poll(async () => Number(await total.getAttribute('data-max')))
    .toBeLessThan(before);
  // Richer than motion graphics is an AI image: not on Free, so it offers Upgrade.
  await page.locator('.scene').nth(2).locator('[data-swap="richer"]').click();
  await expect(page).toHaveURL(/#\/credits/);
  await page.goBack();
  // Spend most credits elsewhere to see the shortage.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith('aive.credits.'),
    )!;
    const rows = JSON.parse(localStorage.getItem(key)!);
    rows.push({
      id: 'adjust-x',
      at: new Date().toISOString(),
      type: 'adjust',
      delta: -50,
      key: 'test-spend',
      note: 'test',
    });
    localStorage.setItem(key, JSON.stringify(rows));
  });
  await page.reload();
  await expect(page.locator('#plan-shortage')).toContainText('you have 10');
  await expect(page.locator('#plan-approve')).toBeDisabled();
  await expect(page.locator('#shortage-topup')).toBeVisible();
  await page.locator('#shortage-scenes').click();
  await page.locator('#plan-cancel').click();
  await expect(page.locator('h1')).toContainText('Brief Room');
});

test('[P2R1-031] Circumference end to end: login, Story Explainer, brief, Director, plan with credits, approve, build, the editor opens with editable scenes, export; a failed build refunds', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await signUp(page);
  // First a failed build: the mock model fails on its third call.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('aive.e2e.failedOnce'))
      (
        window as { __AIVE_E2E_MOCK_FAIL_AT__?: number }
      ).__AIVE_E2E_MOCK_FAIL_AT__ = 3;
  });
  await page.goto('/panel/#/home');
  await page.reload();
  await circumferenceBrief(page);
  const max = Number(
    await page.locator('#plan-total').getAttribute('data-max'),
  );
  await approvePlan(page);
  await expect(page.locator('#build-steps li').first()).toHaveText(
    `Held ${max} credits`,
  );
  await expect(page.locator('#build-status')).toHaveAttribute(
    'data-state',
    'failed',
  );
  await expect(page.locator('#build-status')).toContainText(
    `All ${max} credits came back.`,
  );
  expect(await balance(page)).toBe(60);
  // Try again works.
  await page.evaluate(() => sessionStorage.setItem('aive.e2e.failedOnce', '1'));
  await page.locator('#build-retry').click();
  await expect(page.locator('#build-status')).toHaveAttribute(
    'data-state',
    'done',
    { timeout: 30_000 },
  );
  const done = (await page.locator('#build-status').textContent())!;
  const used = Number(/(\d+) credits used/.exec(done)![1]);
  expect(used).toBeLessThanOrEqual(max);
  expect(await balance(page)).toBe(60 - used);
  await page.goto('/panel/#/credits');
  await expect(
    page.locator('#ledger-table tr[data-type="reserve"]'),
  ).toHaveCount(2);
  await expect(
    page.locator('#ledger-table tr[data-type="refund"]'),
  ).toHaveCount(2);
  await page.goBack();
  // Open in editor: the editor's own Build video makes editable scenes.
  await page.locator('#open-in-editor').click();
  await expect(page.locator('.plan-build')).toBeVisible({ timeout: 30_000 });
  await settleBuild(page);
  const state = await hook(page);
  expect(state.project.compositions).toHaveLength(5);
  expect(state.project.metadata.name).toContain('Eratosthenes');
  expect(state.project.compositions.every((c) => c.layers.length > 0)).toBe(
    true,
  );
  expect(state.history.labels.at(-1)).toBe('Build video');
  expect(state.project.compositions[0]!.width).toBe(1080); // 9:16 Story Explainer
  // Export: a PNG frame from the editor's own export dialog.
  await page.locator('.plan-build #plan-cancel').click();
  await expect(page.locator('.plan-build')).toHaveCount(0);
  await page.locator('#export').click();
  const saving = page.waitForEvent('download');
  await page.locator('.modal-dialog #export-png').click();
  const png = await saving;
  const file = testInfo.outputPath('frame.png');
  await png.saveAs(file);
  const bytes = readFileSync(file);
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
    1080, 1920,
  ]);
});

test('[P2R1-032] [P2R1-033] [P2R1-034] a Studio tool shows its cost, runs on the mock and saves to the project-wise Asset Library; copying to another project keeps the original; a tool the plan lacks is locked with Upgrade; a voice clone needs consent', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/studio');
  await expect(page.locator('#studio-list [data-studio]')).toHaveCount(8);
  await expect(page.locator('[data-studio="images"]')).toHaveAttribute(
    'data-locked',
    'true',
  );
  await page.locator('[data-upgrade="images"]').click();
  await expect(page).toHaveURL(/#\/credits/);
  await page.goto('/panel/#/studio/images');
  await expect(page.locator('#studio-locked')).toBeVisible();
  await expect(page.locator('#studio-upgrade')).toBeVisible();
  // Write: cost first, then the result lands in the Asset Library.
  await page.goto('/panel/#/studio/write');
  await page.locator('#f-topic').fill('Three facts about shadows');
  await page.locator('[data-field="length"] input[value="short"]').check();
  await expect(page.locator('#studio-cost')).toHaveText(
    /This costs up to \d+ credits\./,
  );
  const before = await balance(page);
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-saved')).toContainText(
    'Saved to the Asset Library',
  );
  await expect(page.locator('#studio-result .asset-text')).toContainText(
    'Three facts about shadows',
  );
  expect(await balance(page)).toBeLessThan(before);
  // Voice clone: consent first.
  await page.goto('/panel/#/studio/voice');
  await page.locator('#f-text').fill('Namaste');
  await page.locator('[data-field="mode"] input[value="clone"]').check();
  await expect(page.locator('#studio-consent-row')).toBeVisible();
  await page.locator('#studio-run').click();
  await expect(page.locator('.toast.error')).toContainText(
    'Tick the consent box first.',
  );
  await page.locator('#studio-consent').check();
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-result audio')).toBeVisible();
  // A second clone hits the Free limit (1 cloned voice).
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-error')).toContainText(
    'Your plan allows 1 cloned voices.',
  );
  // Asset Library: two assets in "Not in a project yet"; copy one to a project.
  await page.goto('/?new=Shadows&aspect=16:9');
  await expect(page.locator('#composition-canvas')).toBeVisible();
  await expect
    .poll(async () => (await hook(page)).project.metadata.name)
    .toBe('Shadows');
  await page.waitForTimeout(0);
  // The editor writes the new project to this browser's Projects library.
  await page.goto('/panel/#/assets');
  await expect
    .poll(async () => {
      await page.reload();
      await page.locator('#assets-project').waitFor();
      return page.locator('#assets-project option').count();
    })
    .toBeGreaterThan(1);
  await expect(page.locator('#asset-list [data-asset]')).toHaveCount(2);
  const first = page.locator('#asset-list [data-asset]').first();
  await first.locator('select').selectOption({ label: 'Shadows' });
  await first.locator('[data-copy]').click();
  await expect(
    page.locator('.toast', { hasText: 'The original stays here.' }),
  ).toBeVisible();
  await page.locator('#assets-project').selectOption({ label: 'Shadows' });
  await expect(page.locator('#asset-list [data-asset]')).toHaveCount(1);
  await page.locator('#assets-project').selectOption({ index: 0 });
  await expect(page.locator('#asset-list [data-asset]')).toHaveCount(2);
});

test('[P2R1-035] Projects: new blank, open, search, rename, duplicate, trash and restore', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/projects');
  await page.locator('#new-blank').click();
  await page.locator('#blank-name').fill('Monsoon lesson');
  await page.locator('#blank-aspect').selectOption('9:16');
  await page.locator('#blank-create').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  await expect
    .poll(async () => (await hook(page)).project.compositions[0]!.height)
    .toBe(1920);
  expect((await hook(page)).project.metadata.name).toBe('Monsoon lesson');
  await page.goto('/panel/#/projects');
  const card = page.locator('#project-list [data-project]', {
    hasText: 'Monsoon lesson',
  });
  await expect
    .poll(async () => {
      await page.reload();
      await page.locator('#project-list').waitFor();
      return card.count();
    })
    .toBe(1);
  await expect(card).toBeVisible();
  await page.locator('#project-search').fill('monsoon');
  await expect(page.locator('#project-list [data-project]')).toHaveCount(1);
  await card.locator('[data-act="rename"]').click();
  await page.locator('.rename-field').fill('Monsoon lesson v2');
  await page.keyboard.press('Enter');
  await expect(
    page.locator('#project-list [data-project]', {
      hasText: 'Monsoon lesson v2',
    }),
  ).toBeVisible();
  await page.locator('#project-search').fill('');
  const count = await page.locator('#project-list [data-project]').count();
  await page
    .locator('#project-list [data-project]', { hasText: 'Monsoon lesson v2' })
    .locator('[data-act="duplicate"]')
    .click();
  await expect(page.locator('#project-list [data-project]')).toHaveCount(
    count + 1,
  );
  await page
    .locator('#project-list [data-project]', { hasText: 'Monsoon lesson v2' })
    .first()
    .locator('[data-act="trash"]')
    .click();
  await expect(page.locator('#project-list [data-project]')).toHaveCount(count);
  await page.locator('[data-view="trash"]').click();
  await expect(page.locator('#project-list [data-project]')).toHaveCount(1);
  await page.locator('[data-act="restore"]').click();
  await expect(page.locator('#project-list .empty-state')).toBeVisible();
  await page.locator('[data-view="all"]').click();
  await expect(page.locator('#project-list [data-project]')).toHaveCount(
    count + 1,
  );
  // Open goes to the editor on that project.
  const id = await page
    .locator('#project-list [data-project]', { hasText: 'Monsoon lesson v2' })
    .first()
    .getAttribute('data-project');
  await page.locator(`[data-project="${id}"] [data-act="open"]`).click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  await expect.poll(async () => (await hook(page)).project.id).toBe(id);
});

test('[P2R1-036] Credits and Plan: plan cards, costs, INR/USD, a mock top up adds credits, history and usage against limits', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/credits');
  await expect(page.locator('#plan-cards [data-plan]')).toHaveCount(3);
  await expect(page.locator('[data-plan="creator"] .price')).toHaveText(
    '₹799/mo',
  );
  await page.locator('[data-currency="USD"]').click();
  await expect(page.locator('[data-plan="creator"] .price')).toHaveText(
    '$9/mo',
  );
  await expect(page.locator('#cost-table')).toContainText('AI image');
  await page.locator('[data-buy="pack-200"]').click();
  await expect(page.locator('#pay-dialog')).toContainText(
    'Test payment: no money moves.',
  );
  await page.locator('#pay-confirm').click();
  await expect(
    page.locator('.toast', { hasText: '200 credits added.' }),
  ).toBeVisible();
  expect(await balance(page)).toBe(260);
  await expect(page.locator('#ledger-table tr[data-type="grant"]')).toHaveCount(
    2,
  );
  await page.locator('[data-switch="pro"]').click();
  await expect(page.locator('#plan-chip')).toHaveText('Pro');
  expect(await balance(page)).toBe(2260);
  await expect(page.locator('#usage-table')).toContainText('no limit');
});

test('[P2R1-037] Brand Kit (Pro), Settings and Learn; the Brief Room uses the Brand Kit', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/brand');
  await expect(page.locator('#brand-upgrade')).toBeVisible();
  await setPlan(page, 'pro');
  await page.goto('/panel/#/brand');
  await page.locator('[data-color="0"]').evaluate((el: HTMLInputElement) => {
    el.value = '#e4572e';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#brand-heading').selectOption('Poppins');
  await page.locator('#brand-save').click();
  await expect(page.locator('.toast', { hasText: 'Saved' })).toBeVisible();
  await page.goto('/panel/#/brief/quick-short');
  await expect(page.locator('#brand-kit-on')).toBeVisible();
  await page.goto('/panel/#/settings');
  await page.locator('#settings-name').fill('Asha');
  await page.locator('#settings-theme').selectOption('light');
  await page.locator('#settings-save').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/panel/#/home');
  await expect(page.locator('#greeting')).toHaveText('Hello, Asha');
  await page.goto('/panel/#/learn');
  await expect(page.locator('#learn-list [data-learn]')).toHaveCount(4);
});

test('[P2R1-038] the website: landing, Styles, showcase and pricing from config, sign-up and log-in links, no demo and no editor for visitors', async ({
  page,
}) => {
  await page.goto('/site/');
  await expect(page.locator('[data-section="hero"] h1')).toHaveText(
    'Tell it the video. Get an editable project.',
  );
  await expect(
    page.locator('[data-section="styles"] [data-style]'),
  ).toHaveCount(3);
  await expect(page.locator('#showcase [data-showcase]')).toHaveCount(2);
  await expect(page.locator('#pricing [data-plan]')).toHaveCount(3);
  await page.locator('[data-section="pricing"] [data-currency="USD"]').click();
  await expect(page.locator('#pricing [data-plan="pro"] .price')).toHaveText(
    '$24/month',
  );
  await expect(page.locator('#site-signup')).toHaveAttribute(
    'href',
    '#/signup',
  );
  await expect(page.locator('#site-login')).toHaveAttribute('href', '#/login');
  await expect(page.locator('a[href="/"]')).toHaveCount(0);
  await page.locator('#site-lang').click();
  await expect(page.locator('[data-section="hero"] h1')).toHaveText(
    'वीडियो बताइए। एडिट करने लायक़ प्रोजेक्ट पाइए।',
  );
});
