// ROUND-C1 Part G: records e2e/editor-guard.golden.json from the Round A
// editor (the Editor before AI mode). It is not a test of this tree and is
// not picked up by Playwright here (no ".spec" in the name). To record:
//
//   git worktree add --detach <dir> origin/claude/round-a-panel
//   ln -s "$PWD/node_modules" <dir>/node_modules
//   cp e2e/editor-guard-collect.ts <dir>/e2e/
//   cp e2e/editor-guard.record.ts <dir>/e2e/zz-guard-record.spec.ts
//   (cd <dir> && GUARD_OUT=$PWD/../golden.json E2E_PORT=4180 \
//     npx playwright test e2e/zz-guard-record.spec.ts --project=desktop)
//
// The golden is never edited by hand or refreshed to make the guard pass.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from './fixtures';
import {
  SIZES,
  listsOf,
  realStart,
  statesAt,
  topbarControls,
  type Golden,
} from './editor-guard-collect';

test('record the Editor guard golden', async ({ page }) => {
  test.setTimeout(900_000);
  await realStart(page);
  const fixture = path.resolve('tests/fixtures/projects/two-scenes.json');
  const golden: Golden = {
    recordedFrom: process.env.GUARD_FROM ?? 'origin/claude/round-a-panel',
    sizes: {},
    topbarControls: {},
    lists: {},
  };
  for (const size of SIZES) {
    const key = `${size[0]}x${size[1]}`;
    golden.sizes[key] = await statesAt(page, size, fixture);
    await page.goto('/');
    await page.waitForFunction(() => '__AIVE__' in window);
    golden.topbarControls[key] = await topbarControls(page);
  }
  const { lists } = await listsOf(page, fixture);
  golden.lists = lists;
  writeFileSync(
    process.env.GUARD_OUT ?? 'editor-guard.golden.json',
    `${JSON.stringify(golden, null, 1)}\n`,
  );
});
