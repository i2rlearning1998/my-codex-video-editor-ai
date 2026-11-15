// RDC1-008: the editor's own Stock panels list the provider registry of the
// Platform Config: a REST provider the owner added is its own provider
// there (search, add with its credit), and a built-in the owner switched
// off is gone. Existing Stock panels keep working (F2 tests).
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory } from './fixtures';
import { MEDIA_HOST, proofConfig, stage } from './round-c1-helpers';

const elements = (page: Page) => page.locator('#library-elements');
const openPhotos = async (page: Page) => {
  await showCategory(page, 'Elements');
  await elements(page).locator('[data-tile="photos"]').click();
  await elements(page).locator('.browse-chip[data-chip="stock"]').click();
};
test('[RDC1-008] Stock › Photos lists the REST provider the owner added; its search and add work offline from fixtures with the credit kept; a built-in switched off is hidden', async ({
  page,
}) => {
  const config = proofConfig((c) => {
    for (const p of c.mediaProviders) if (p.id === 'pixabay') p.enabled = true;
  });
  await stage(
    page,
    {
      format: 'video-plan',
      version: 4,
      meta: { title: 'x' },
      scenes: [{ id: 'a', layers: [{ id: 't', kind: 'title', text: 'x' }] }],
    },
    config,
  );
  await page.goto('/');
  await openPhotos(page);
  const panel = elements(page).locator('.stock-panel');
  const fake = panel.locator('.stock-providers [data-provider="fakestock"]');
  await expect(fake).toBeVisible();
  await expect(
    panel.locator('.stock-providers [data-provider="pexels"]'),
  ).toHaveCount(0);
  await expect(
    panel.locator('.stock-providers [data-provider="pixabay"]'),
  ).toBeVisible();
  await fake.click();
  await panel.locator('.stock-search').fill('fort');
  const card = panel.locator('.stock-item').first();
  await expect(card.locator('.shelf-name')).toHaveText(
    /old stone fort history/,
  );
  await card.click();
  await expect
    .poll(async () =>
      JSON.stringify(
        (await hook(page)).project.assets.find((a) => /fort/.test(a.name))
          ?.metadata ?? {},
      ),
    )
    .toMatch(
      /"providerId":"fakestock".*"author":"Fake Stock \/ photographer fort-1".*"license":\{"name":"free"/,
    );
  void MEDIA_HOST;
});
