// P2-R2 Part E: the Aurora Ink look on every panel and website screen, at
// 1440 and 390 px (and 360 px for overflow); screenshots go to reports/p2-r2/.
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUp } from './p2-helpers';

const OUT = 'reports/p2-r2';
mkdirSync(OUT, { recursive: true });
const shot = async (page: Page, name: string) => {
  // No page may scroll sideways.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
    `${name} overflows`,
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: `${OUT}/${name}-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
};
async function say(page: Page, text: string) {
  await page.locator('#chat-input').fill(text);
  await page.locator('#chat-send').click();
  await expect(page.locator('#chat-input')).toHaveValue('');
}

async function auroraScreens(page: Page, width: number) {
  test.setTimeout(240_000);
  await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
  // Website.
  await page.goto('/site/');
  await expect(page.locator('#story .story-step')).toHaveCount(4);
  await page.locator('#story .story-step').last().scrollIntoViewIfNeeded();
  await expect(page.locator('#story .story-step').last()).toHaveAttribute(
    'data-seen',
    'true',
  );
  await expect(page.locator('#faq .faq-item')).toHaveCount(3);
  await page.locator('#faq .faq-item summary').first().click();
  await expect(page.locator('#faq .faq-item').first()).toHaveAttribute(
    'open',
    '',
  );
  await expect(page.locator('[data-style] svg.art').first()).toBeVisible();
  await shot(page, 'site-landing');
  await page.goto('/site/#/login');
  await shot(page, 'site-login');
  // Panel.
  await signUp(page);
  const font = await page.evaluate(
    () => getComputedStyle(document.body).fontFamily,
  );
  expect(font).toContain('Plus Jakarta Sans');
  await expect(page.locator('#director-card.aurora-card .orb')).toBeVisible();
  await expect(page.locator('[data-start-style]').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await shot(page, 'panel-home');
  await page.goto('/panel/#/styles');
  await expect(page.locator('#style-grid .style-card svg.art')).toHaveCount(3);
  await shot(page, 'panel-styles');
  await page.locator('[data-style="story-explainer"] a.button').click();
  await expect(page.locator('details.field-group')).toHaveCount(3);
  await page
    .locator('#f-idea')
    .fill('How Eratosthenes measured the circumference of the Earth.');
  await shot(page, 'panel-brief');
  await page.locator('#talk-director').click();
  await expect(page.locator('.msg.director .orb').first()).toBeVisible();
  const card = page.locator('.msg.question-card');
  await expect(card).toHaveCount(1);
  await shot(page, 'panel-director');
  // An answer chip answers the question.
  await card.locator('.answer-chips .chip').first().click();
  await expect(page.locator('.msg.user')).toHaveCount(1);
  await say(page, 'Text to speech');
  await say(page, 'None');
  await say(page, 'Hindi');
  await page.locator('#make-plan').click();
  await expect(page.locator('#plan-card .scene .scene-thumb svg')).toHaveCount(
    5,
  );
  await expect(
    page.locator('#plan-card .chip.method[data-cost]').first(),
  ).toHaveAttribute('data-cost', /free|low|high/);
  await shot(page, 'panel-plan');
  await page.locator('#plan-approve').click();
  await expect(page.locator('#build-status')).toHaveAttribute(
    'data-state',
    'done',
    { timeout: 60_000 },
  );
  await page.locator('.code-view summary').click();
  await expect(page.locator('#build-code')).toContainText('"video-plan"');
  expect(
    await page
      .locator('#build-code')
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain('JetBrains Mono');
  await shot(page, 'panel-build');
  for (const [route, name] of [
    ['credits', 'panel-credits'],
    ['projects', 'panel-projects'],
    ['assets', 'panel-assets'],
    ['brand', 'panel-brand'],
    ['settings', 'panel-settings'],
    ['learn', 'panel-learn'],
  ] as const) {
    await page.goto(`/panel/#/${route}`);
    await expect(page.locator(`[data-screen="${route}"]`)).toBeVisible();
    await shot(page, name);
  }
  await page.goto('/panel/#/studio/voice');
  await expect(page.locator('.tool-tab[aria-current="page"]')).toHaveText(
    'Voice',
  );
  await expect(page.locator('.choice svg.wave').first()).toBeVisible();
  await shot(page, 'panel-studio-voice');
  // Keyboard focus shows a ring.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(
    () => getComputedStyle(document.activeElement!).boxShadow,
  );
  expect(ring).not.toBe('none');
  // The light theme keeps the same screens readable.
  await page.goto('/panel/#/settings');
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe('rgb(246, 245, 251)');
  await shot(page, 'panel-settings-light');
}

test('[P2R2-029] [P2R2-030] [P2R2-031] [P2R2-032] [P2R2-033] [P2R2-034] Aurora Ink screens at 1440 px: Director card, Styles with art, grouped Brief, chat with orb and answer chips, Plan card thumbnails and cost chips, Live Build code, Studio tabs and waves, website story and FAQ', async ({
  page,
}) => {
  await auroraScreens(page, 1440);
});

test('[P2R2-029] [P2R2-030] [P2R2-031] [P2R2-032] [P2R2-033] [P2R2-034] Aurora Ink screens at 390 px: Director card, Styles with art, grouped Brief, chat with orb and answer chips, Plan card thumbnails and cost chips, Live Build code, Studio tabs and waves, website story and FAQ', async ({
  page,
}) => {
  await auroraScreens(page, 390);
});

test('[P2R2-034] at 360 px no panel or website screen scrolls sideways; reduced motion stops the orb', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto('/site/');
  await shot(page, 'site-landing');
  await signUp(page);
  expect(
    await page
      .locator('#director-card .orb')
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  for (const route of ['home', 'styles', 'credits', 'studio', 'projects'])
    await page
      .goto(`/panel/#/${route}`)
      .then(() => shot(page, `panel-${route}`));
});
