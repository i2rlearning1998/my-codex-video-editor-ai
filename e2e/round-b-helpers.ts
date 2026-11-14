// ROUND-B: shared steps of the AI mode tests. Each acts like a person.
import type { Page } from '@playwright/test';
import { expect, hook } from './fixtures';
import { setPlan, signUp } from './p2-helpers';

export const RAIN = 'Explain how rain forms, in Hindi, 1 minute';
export const thread = (page: Page) => page.locator('#ai-thread');
export const lastDirector = (page: Page) =>
  page.locator('#ai-thread .ai-msg[data-role="director"]').last();
export const openProposal = (page: Page) =>
  page.locator('[data-card="proposal"][data-state="open"]');
export const credits = async (page: Page) =>
  Number(
    (await page.locator('#ai-credits').textContent())!.replace(/\D+/g, ''),
  );

/** Signs up, types the first message in Home's Director box: AI mode opens on a new Video with its Brief card. */
export async function startAi(page: Page, message = RAIN, plan = '') {
  await signUp(page);
  if (plan) await setPlan(page, plan);
  await page.goto('/panel/#/home');
  await page.locator('#home-input').fill(message);
  await page.locator('#home-send').click();
  await expect(page.locator('.editor-shell')).toHaveClass(/ai-layout/, {
    timeout: 30_000,
  });
  await expect(page.locator('#ai-brief-card')).toBeVisible({ timeout: 30_000 });
  return (await hook(page)).project.id;
}
/** Brief card › Make the plan (the required fields are already answered). */
export async function toPlan(page: Page) {
  await page.locator('#ai-brief-card .ai-btn.primary').click();
  await expect(page.locator('#ai-plan-card')).toBeVisible({ timeout: 30_000 });
}
export async function toAssets(page: Page) {
  await page.locator('#ai-plan-approve').click();
  await expect(page.locator('#ai-assets-card')).toBeVisible();
}
/** Build the video and wait until its scenes are on the canvas. */
export async function build(page: Page) {
  await page.locator('#ai-build').click();
  await expect(
    page.locator('[data-card="build"][data-state="done"]'),
  ).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('#ai-orb-state')).toHaveText('Ready');
}
/** The whole flow: a built video in AI mode. Returns the Video id. */
export async function builtVideo(page: Page, message = RAIN) {
  const id = await startAi(page, message);
  await toPlan(page);
  await toAssets(page);
  await build(page);
  return id;
}
export async function say(page: Page, text: string) {
  await page.locator('#ai-input').fill(text);
  await page.locator('#ai-send').click();
}
/** Clicks the first layer of the open scene whose name matches, on the stage (through its clip in the slim timeline). */
export async function selectLayer(page: Page, match: RegExp) {
  const h = await hook(page);
  const scene = h.project.compositions.find(
    (s) => s.id === h.session.compositionId,
  )!;
  const layer = scene.layers.find(
    (l) => match.test(l.name) || match.test(l.type),
  );
  if (!layer) throw new Error(`No layer matches ${match}`);
  await page.locator(`#ai-track .ai-clip[data-layer="${layer.id}"]`).click();
  await expect
    .poll(async () => (await hook(page)).session.selectedIds)
    .toEqual([layer.id]);
  return layer.id;
}
export const layerOf = async (page: Page, id: string) => {
  for (const scene of (await hook(page)).project.compositions) {
    const find = (
      layers: typeof scene.layers,
    ): (typeof scene.layers)[number] | undefined => {
      for (const l of layers) {
        if (l.id === id) return l;
        const inner = find(l.children);
        if (inner) return inner;
      }
      return undefined;
    };
    const hit = find(scene.layers);
    if (hit) return hit;
  }
  return undefined;
};
