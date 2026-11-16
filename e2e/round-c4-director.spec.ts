// ROUND-C4 Part 4.2 (RDC4-066): the attachment control in AI mode reads the
// owner's limit (Admin › Director limits › Largest attachment) and says it
// in its sentence. The Admin save of that number is proven in
// tests/round-c4/effects.test.ts (RDC4-062); here the control uses it.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { startAi } from './round-b-helpers';
import { defaultConfig } from '../src/platform-config';

async function useConfig(
  page: Page,
  change: (c: ReturnType<typeof defaultConfig>) => void,
) {
  const config = defaultConfig();
  change(config);
  await page.addInitScript((c) => {
    localStorage.setItem(
      'aive.platformConfig',
      JSON.stringify({
        versions: [
          {
            version: 1,
            savedAt: new Date().toISOString(),
            note: 't',
            config: c,
          },
        ],
        live: 1,
      }),
    );
  }, config);
}

test("[RDC4-066] a file bigger than the owner's new attachment limit is refused in AI mode with that limit in the sentence", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await useConfig(page, (c) => {
    c.director.context.maxAttachmentMb = 2;
  });
  await startAi(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#ai-attach').click(),
  ]);
  await chooser.setFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.alloc(3 * 1024 * 1024, 97),
  });
  await expect(
    page.locator('#ai-thread .ai-msg[data-role="director"]').last(),
  ).toContainText('That file is too big. The most is 2 MB.');
  await expect(page.locator('#ai-files [data-file]')).toHaveCount(0);
});
