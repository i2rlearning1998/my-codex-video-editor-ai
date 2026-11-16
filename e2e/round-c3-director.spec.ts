// ROUND-C3 Part 3.3 (RDC3-034): the Director's upgrade step in AI mode. The
// offline planner gives one deterministic upgrade; the Plan card lists it
// under "Extra ideas" and the person can remove it.
import { test, expect } from './fixtures';
import { startAi, toPlan } from './round-b-helpers';

test('[RDC3-034] the Director\'s Plan card lists "Extra ideas" beyond what was asked; Remove takes one away and the Video sheet keeps both steps', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await startAi(page);
  await toPlan(page);
  const ideas = page.locator('#ai-plan-ideas');
  await expect(ideas.locator('.ai-label')).toHaveText(
    'Extra ideas (beyond what you asked; remove any you do not want)',
  );
  const rows = ideas.locator('[data-idea]');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  await rows
    .first()
    .getByRole('button', { name: /^Remove: / })
    .click();
  await expect(page.locator('#ai-plan-ideas [data-idea]')).toHaveCount(n - 1);
});
