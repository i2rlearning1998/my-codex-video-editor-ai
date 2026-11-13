// P2-R2: the panel against the real gateway server (in the test process),
// which calls the fake provider servers over real HTTP. No real keys.
import { test, expect } from './fixtures';
import { balance, openStudioResults, signUp } from './p2-helpers';
import { startStack, type Stack } from './p2-stack';

let stack: Stack | null = null;
test.afterEach(async () => {
  await stack?.close();
  stack = null;
});

test('[P2R2-008] with VITE_GATEWAY_URL the panel uses the server: credits, models and a Studio run go through it; keys stay on the server', async ({
  page,
}) => {
  stack = await startStack(['ANTHROPIC_API_KEY']);
  await stack.use(page);
  const seen: string[] = [];
  const gatewayUrl = stack.url;
  page.on('response', async (r) => {
    if (r.url().startsWith(gatewayUrl))
      seen.push(await r.text().catch(() => ''));
  });
  await signUp(page);
  expect(await balance(page)).toBe(60);
  // Round A: Write is off by default; Story is a text tool on the same
  // models. With a server a model with declared fields draws the form
  // (P3U-006, one prompt field), else the config's Story form (its plot).
  await page.goto('/panel/#/studio/story');
  await page
    .locator('#sf-prompt, #sf-plot')
    .first()
    .fill('Three facts about shadows');
  await page.locator('#studio-run').click();
  await expect(page.locator('#studio-saved')).toContainText(
    'Saved to the Asset Library',
  );
  // The text came from the fake Anthropic server, through the gateway.
  // The model-driven Studio saves and says where (P3U-008); read it there.
  await openStudioResults(page, 'story');
  await expect(page.locator('.asset-text').first()).toContainText('echo:');
  expect(
    stack.fake.seen.some(
      (s) => s.provider === 'anthropic' && s.path === '/v1/messages',
    ),
  ).toBe(true);
  await expect.poll(() => balance(page)).toBeLessThan(60);
  await page.goto('/panel/#/credits');
  await expect(
    page.locator('#ledger-table tr[data-type="settle"]'),
  ).toHaveCount(1);
  // No key ever reached the browser.
  expect(seen.join('\n')).not.toContain(stack.fake.key);
  // The server log has the calls and no key.
  expect(stack.logs.some((l) => l.startsWith('POST /v1/run 200'))).toBe(true);
  expect(stack.logs.join('\n')).not.toContain(stack.fake.key);
});
