import { test, expect, hook, showCategory } from './fixtures';

// FIX7-031: the owner's switches name only controls the editor really has,
// and every toolbar button the editor shows for a kind of selection is one
// the owner can switch off.
const SKIP = new Set(['toolbar-more', 'gradient']);
const toolbarIds = async (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#context-toolbar > *')].flatMap(
      (el) => {
        // The same id the editor filters by (see context-toolbar render).
        const id =
          el.dataset.controlGroup ??
          el.dataset.control ??
          el.querySelector<HTMLElement>('[data-control]')?.dataset.control;
        return id ? [id] : [];
      },
    ),
  );
const registry = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    const mod = (await import('/src/library-client/controls.ts' as string)) as {
      CONTROL_REGISTRY: { surface: string; id: string; types: string[] }[];
    };
    return mod.CONTROL_REGISTRY.filter((def) => def.surface === 'toolbar');
  });

test('[FIX7-031] every toolbar button shown for text, shapes, several selected and a group can be switched off by the owner', async ({
  page,
}) => {
  await page.goto('/');
  await hook(page);
  await showCategory(page, 'Text');
  await page.locator('#add-text-box').click();
  await page.keyboard.insertText('Hello');
  await page.keyboard.press('Escape');
  const seen: Record<string, string[]> = {};
  seen.text = await toolbarIds(page);
  await showCategory(page, 'Elements');
  await page.locator('[data-shape="rectangle"]').click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBe(1);
  seen.shape = await toolbarIds(page);
  await page.locator('[data-shape="rectangle"]').first().click();
  await page.keyboard.press('Control+a');
  await expect
    .poll(async () => (await hook(page)).session.selectedIds.length)
    .toBeGreaterThan(1);
  seen.multi = await toolbarIds(page);
  await page.keyboard.press('Control+g');
  await expect
    .poll(async () => (await toolbarIds(page)).includes('ungroup'))
    .toBe(true);
  seen.group = await toolbarIds(page);
  const defs = await registry(page);
  for (const [type, ids] of Object.entries(seen)) {
    expect(ids.length, type).toBeGreaterThan(0);
    const names = new Set(
      defs.filter((def) => def.types.includes(type)).map((def) => def.id),
    );
    const missing = ids.filter((id) => !SKIP.has(id) && !names.has(id));
    expect(missing, `${type} buttons the owner cannot switch off`).toEqual([]);
  }
});

test('[FIX7-031] every top-level right-click entry for text and a shape can be switched off by the owner', async ({
  page,
}) => {
  await page.goto('/');
  await hook(page);
  const defs = await page.evaluate(async () => {
    const mod = (await import('/src/library-client/controls.ts' as string)) as {
      CONTROL_REGISTRY: { surface: string; id: string; types: string[] }[];
    };
    return mod.CONTROL_REGISTRY.filter((def) => def.surface === 'menu');
  });
  const menuIds = async () => {
    const canvas = (await page.locator('#composition-canvas').boundingBox())!;
    await page.mouse.click(
      canvas.x + canvas.width / 2,
      canvas.y + canvas.height / 2,
      { button: 'right' },
    );
    const ids = await page
      .locator('#canvas-context-menu > [data-action]')
      .evaluateAll((els) =>
        els.map((el) => (el as HTMLElement).dataset.action!),
      );
    await page.keyboard.press('Escape');
    return ids;
  };
  await showCategory(page, 'Text');
  await page.locator('#add-text-box').click();
  await page.keyboard.insertText('Hello');
  await page.keyboard.press('Escape');
  const text = await menuIds();
  await showCategory(page, 'Elements');
  await page.locator('[data-shape="rectangle"]').first().click();
  const shape = await menuIds();
  for (const [type, ids] of Object.entries({ text, shape })) {
    expect(ids.length, type).toBeGreaterThan(3);
    const names = new Set(
      defs.filter((d) => d.types.includes(type)).map((d) => d.id),
    );
    const missing = ids.filter(
      (id) => !names.has(id === 'unlock' ? 'lock' : id),
    );
    expect(missing, `${type} entries the owner cannot switch off`).toEqual([]);
  }
});
