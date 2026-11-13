// ROUND-A: the user panel rebuilt around Project (a container and one
// style) and Video (one editor project inside it). Every test acts like a
// person on the offline mock (no gateway), except where it says so.
import type { Page } from '@playwright/test';
import { test, expect, hook } from './fixtures';
import { signUp } from './p2-helpers';
import { defaultConfig } from '../src/platform-config';

const cards = (page: Page) => page.locator('#project-list [data-ws-project]');
const videos = (page: Page) => page.locator('#video-list [data-video]');

/** Opens the New project dialog. */
async function openNew(page: Page) {
  await page.goto('/panel/#/projects');
  await page.locator('#new-project').click();
  await expect(page.locator('.np-dialog')).toBeVisible();
}
/** Leaves the editor with the browser's Back button, without saving to the cloud. */
async function backFromEditor(page: Page) {
  await page.goBack();
  await page.getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page).toHaveURL(/\/panel\/#\/project\//);
}
/** New project, Start with editor: returns the Project id and the Video id. */
async function newEditorProject(page: Page, name: string) {
  await openNew(page);
  await page.locator('#np-name').fill(name);
  await page.locator('[data-option="editor"]').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  const videoId = (await hook(page)).project.id;
  await backFromEditor(page);
  const projectId = /#\/project\/([^/?]+)/.exec(page.url())![1]!;
  return { projectId, videoId };
}
/** Saves a config into this browser's Platform Config source (no gateway). */
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
            note: 'test',
            config: c,
          },
        ],
        live: 1,
      }),
    );
  }, config);
}

test('[RDA-006] New project offers the config start options (Ready-made Style, Director, Start with editor; Your own Claude hidden while its flag is off); Start with editor makes a Project with one empty Video and opens it, and the editor Back returns to the Project page', async ({
  page,
}) => {
  await signUp(page);
  await openNew(page);
  const options = page.locator('#np-options [data-option]');
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toHaveAttribute('data-option', 'style');
  await expect(options.nth(1)).toHaveAttribute('data-option', 'director');
  await expect(options.nth(2)).toHaveAttribute('data-option', 'editor');
  await expect(page.locator('[data-option="claude"]')).toHaveCount(0);
  // The ready-made gallery lives inside the dialog.
  await page.locator('[data-option="style"]').click();
  await expect(
    page.locator('#np-gallery [data-template]').first(),
  ).toBeVisible();
  await page.locator('#np-close').click();
  await expect(page.locator('.np-dialog')).toHaveCount(0);
  const { projectId, videoId } = await newEditorProject(page, 'Shadows');
  await expect(page.locator('#project-title')).toHaveText('Shadows');
  await expect(videos(page)).toHaveCount(1);
  await expect(page.locator(`[data-video="${videoId}"]`)).toHaveAttribute(
    'data-stage',
    'editor',
  );
  // The style record stays empty for a project started in the editor.
  await expect(page.locator('#project-style-line')).toContainText(
    'No style yet',
  );
  expect(projectId).toMatch(/^pr-/);
});

test('[RDA-006] with the config flag on, Your own Claude is offered; a plan whose start options lack "blank" has no Start with editor', async ({
  page,
}) => {
  await useConfig(page, (c) => {
    c.workspace.claudeConnector = true;
    c.workspace.startOptions = { free: ['director'] };
  });
  await signUp(page);
  await openNew(page);
  await expect(page.locator('[data-option="claude"]')).toHaveCount(1);
  await expect(page.locator('[data-option="editor"]')).toHaveCount(0);
});

test('[RDA-007] [RDA-008] the Projects page shows a card per Project with its video count and origin tag; the Project page has + New video, numbered Videos and the Videos, Style, Assets and Memory tabs', async ({
  page,
}) => {
  await signUp(page);
  const { projectId } = await newEditorProject(page, 'Series');
  // + New video › Empty editor: a second Video in the same Project.
  await page.locator('[data-new-video="editor"]').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  await backFromEditor(page);
  await expect(videos(page)).toHaveCount(2);
  await expect(videos(page).nth(0).locator('.rda-num')).toHaveText('1');
  await expect(videos(page).nth(1).locator('.rda-num')).toHaveText('2');
  for (const tab of ['videos', 'style', 'assets', 'memory'])
    await expect(page.locator(`.rda-tabs [data-tab="${tab}"]`)).toBeVisible();
  await page.goto('/panel/#/projects');
  const card = page.locator(`[data-ws-project="${projectId}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('[data-count]')).toHaveAttribute('data-count', '2');
  await expect(card.locator('.ws-tag')).toHaveText('Manual');
  // Memory tab: add and pin a fact (the existing memory screen).
  await page.goto(`/panel/#/project/${projectId}/memory`);
  await page.locator('#mem-new').fill('Always use metric units');
  await page.locator('#mem-add').click();
  const fact = page.locator('#mem-facts [data-fact]').first();
  await expect(fact).toContainText('Always use metric units');
  await fact.locator('[data-act="pin"]').click();
  await expect(
    page.locator('#mem-facts [data-fact]').first().locator('[data-act="pin"]'),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('[RDA-008] [RDA-005] the Style tab edits the project style; a change for one Video stays in it until "Update project style from this video"', async ({
  page,
}) => {
  await signUp(page);
  const { projectId, videoId } = await newEditorProject(page, 'Styled');
  await page.goto(`/panel/#/project/${projectId}/style`);
  await page.locator('#rda-voice').fill('Warm female');
  await page.locator('#rda-heading').fill('Poppins');
  await page.locator('#rda-style-save').click();
  await expect(page.locator('#style-note')).toHaveText('Style saved.');
  await expect(page.locator('#project-style-line')).toContainText(
    'Warm female',
  );
  // For one Video only.
  await page.locator('#rda-apply').selectOption(videoId);
  await expect(page.locator('#rda-voice')).toHaveValue('Warm female');
  await page.locator('#rda-voice').fill('Excited male');
  await page.locator('#rda-style-save').click();
  await expect(page.locator('#style-note')).toHaveText(
    'Saved for this video only.',
  );
  await page.locator('#rda-apply').selectOption('');
  await expect(page.locator('#rda-voice')).toHaveValue('Warm female');
  await page.locator('#rda-apply').selectOption(videoId);
  await page.locator('#rda-promote').click();
  await expect(page.locator('#project-style-line')).toContainText(
    'Excited male',
  );
  // Example videos switch on and off.
  const example = page.locator(`[data-example="${videoId}"]`);
  await example.check();
  await page.reload();
  await expect(page.locator(`[data-example="${videoId}"]`)).toBeChecked();
});

test('[RDA-009] the Video card menu renames (long and Hindi names), duplicates, lists Exports and deletes; deleting the last Video keeps the Project with its empty state', async ({
  page,
}) => {
  await signUp(page);
  const { projectId, videoId } = await newEditorProject(page, 'Menu');
  const card = page.locator(`[data-video="${videoId}"]`);
  const menu = async (act: string) => {
    await card.locator('summary').click();
    await card.locator(`[data-act="${act}"]`).click();
  };
  // A long Hindi name is kept, cut to 80 characters.
  const long = 'हिंदी वीडियो का बहुत लंबा नाम '.repeat(6);
  await menu('rename');
  await card.locator('.rename-field').fill(long);
  await card.locator('.rename-field').press('Enter');
  const kept = [...long.trim()].slice(0, 80).join('');
  await expect(page.locator(`[data-video="${videoId}"] h3`)).toHaveText(kept);
  // Exports: none yet, said plainly.
  await card.locator('summary').click();
  await card.locator('[data-act="exports"]').click();
  await expect(card.locator('.rda-exports')).toContainText('No exports yet');
  // Duplicate: a second Video in the same Project.
  await menu('duplicate');
  await expect(videos(page)).toHaveCount(2);
  // Delete both: the Project stays, with its empty state.
  for (let i = 0; i < 2; i++) {
    const first = videos(page).first();
    await first.locator('summary').click();
    await first.locator('[data-act="delete"]').click();
  }
  await expect(page.locator('#video-list')).toContainText(
    'No videos in this project yet',
  );
  await page.goto('/panel/#/projects');
  await expect(page.locator(`[data-ws-project="${projectId}"]`)).toBeVisible();
  // Both wait in the Trash on their own; one comes back.
  await page.goto('/panel/#/projects/trash');
  await expect(page.locator('#rda-trash [data-trash-video]')).toHaveCount(2);
  await page
    .locator(`[data-trash-video="${videoId}"] [data-act="restore"]`)
    .click();
  await page.goto(`/panel/#/project/${projectId}`);
  await expect(videos(page)).toHaveCount(1);
});

test('[RDA-010] [RDA-004] deleting a Project sends it and its Videos to the Trash and Restore brings everything back; a trashed Project or Video link says so', async ({
  page,
}) => {
  await signUp(page);
  const { projectId, videoId } = await newEditorProject(page, 'Gone');
  await page.locator('[data-new-video="editor"]').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  await backFromEditor(page);
  await page.goto('/panel/#/projects');
  const card = page.locator(`[data-ws-project="${projectId}"]`);
  await card.locator('summary').click();
  await card.locator('[data-act="delete"]').click();
  await expect(card).toHaveCount(0);
  // The link of the trashed Project, and of one of its Videos in the Library.
  await page.goto(`/panel/#/project/${projectId}`);
  await expect(page.locator('#project-trashed')).toContainText(
    'This project is in the Trash.',
  );
  await page.goto(`/panel/#/assets/v/${videoId}`);
  await expect(page.locator('.error-state')).toContainText(
    'This video is in the Trash.',
  );
  // Restore from the Trash: the Project and both Videos return.
  await page.goto('/panel/#/projects/trash');
  await expect(page.locator('#trash-note')).toContainText('30 days');
  await page
    .locator(`[data-trash-project="${projectId}"] [data-act="restore"]`)
    .click();
  await page.goto(`/panel/#/project/${projectId}`);
  await expect(videos(page)).toHaveCount(2);
  // A Project with zero Videos is still a Project.
  await page.goto('/panel/#/projects');
  await expect(page.locator(`[data-ws-project="${projectId}"]`)).toBeVisible();
});

test('[RDA-011] the Styles page is the ready-made gallery only; choosing a Style makes a Project tagged with its name and starts Director on its first Video', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/styles');
  await expect(page.locator('#style-grid [data-style]').first()).toBeVisible();
  await expect(
    page.locator('#ws-styles, #mine-strip, #mine-manage'),
  ).toHaveCount(0);
  await expect(page.getByText('Save to your styles')).toHaveCount(0);
  const first = page.locator('#style-grid [data-use-style]').first();
  const styleId = await first.getAttribute('data-use-style');
  await first.click();
  // Round B seam: the existing Director brief, bound to the new Video.
  await expect(page).toHaveURL(new RegExp(`#/brief/${styleId}\\?project=`));
  await page.goto('/panel/#/projects');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first().locator('.ws-tag')).toHaveText(
    'Story Explainer',
  );
  // Its style record came from the ready-made Style.
  await cards(page).first().locator('[data-act="open"]').click();
  await expect(page.locator('#project-style-line')).toContainText(
    'From the Style',
  );
  // The old My Styles address no longer has a screen: it shows Home.
  await page.goto('/panel/#/my-styles');
  await expect(page.locator('.room-orb canvas')).toBeVisible();
  await expect(page.locator('#mine-strip, .mine-section')).toHaveCount(0);
});

test('[RDA-012] Home has the Director box with the Orb, a row of ready-made Styles and Continue with unfinished Videos, newest first', async ({
  page,
}) => {
  await signUp(page);
  await page.goto('/panel/#/home');
  await expect(page.locator('.room-orb canvas')).toBeVisible();
  await expect(page.locator('#style-reel [data-style]').first()).toBeVisible();
  await expect(page.locator('#home-continue [data-video]')).toHaveCount(0);
  await page.locator('#style-reel [data-use-style]').first().click();
  await expect(page).toHaveURL(/#\/brief\//);
  await page.goto('/panel/#/home');
  const cont = page.locator('#home-continue [data-video]');
  await expect(cont).toHaveCount(1);
  await expect(cont.first()).toHaveAttribute('data-stage', 'brief');
  await cont.first().locator('[data-act="continue"]').click();
  await expect(page).toHaveURL(/#\/brief\//);
});

test('[RDA-013] reaching the projects limit or the videos-per-project limit shows the owner sentence with Upgrade and makes nothing', async ({
  page,
}) => {
  await useConfig(page, (c) => {
    const free = c.plans.find((p) => p.id === 'free')!;
    free.limits.projects = 1;
    free.limits.videosPerProject = 1;
  });
  await signUp(page);
  const { projectId } = await newEditorProject(page, 'Only one');
  // A second Video in the Project is refused.
  await page.locator('[data-new-video="editor"]').click();
  await expect(page.locator('#project-limit')).toContainText(
    'Your plan allows 1 videos in one project.',
  );
  await expect(page.locator('#project-limit a')).toHaveText('Upgrade');
  await expect(videos(page)).toHaveCount(1);
  // A second Project is refused; the typed name stays.
  await openNew(page);
  await page.locator('#np-name').fill('Second');
  await page.locator('[data-option="editor"]').click();
  await expect(page.locator('#project-limit')).toContainText(
    'Your plan allows 1 projects.',
  );
  await expect(page.locator('#np-name')).toHaveValue('Second');
  await page.locator('#np-close').click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator(`[data-ws-project="${projectId}"]`)).toBeVisible();
});

test('[RDA-014] a reload in the middle of New project keeps the dialog and the typed name; browser Back closes it; Back steps through the pages', async ({
  page,
}) => {
  await signUp(page);
  await openNew(page);
  await page.locator('#np-name').fill('Half typed');
  await page.reload();
  await expect(page.locator('.np-dialog')).toBeVisible();
  await expect(page.locator('#np-name')).toHaveValue('Half typed');
  await page.goBack();
  await expect(page.locator('.np-dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/projects$/);
  // Nothing was made by the half-finished dialog.
  await expect(cards(page)).toHaveCount(0);
  // Back from a Project page goes to Projects, and from a tab to the Project.
  const { projectId } = await newEditorProject(page, 'Steps');
  await page.locator('.rda-tabs [data-tab="style"]').click();
  await expect(page).toHaveURL(new RegExp(`#/project/${projectId}/style`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#/project/${projectId}$`));
  await expect(videos(page)).toHaveCount(1);
});

test('[RDA-015] two tabs on the same Project: a Video made in one shows in the other when it is opened again', async ({
  page,
  context,
}) => {
  await signUp(page);
  const { projectId } = await newEditorProject(page, 'Two tabs');
  const other = await context.newPage();
  await other.goto(`/panel/#/project/${projectId}`);
  await expect(other.locator('#video-list [data-video]')).toHaveCount(1);
  await page.locator('[data-new-video="editor"]').click();
  await expect(page.locator('#composition-canvas')).toBeVisible();
  await other.reload();
  await expect(other.locator('#video-list [data-video]')).toHaveCount(2);
  await other.close();
});

test('[RDA-016] [RDA-003] data from before Round A is migrated once on first open: a Style becomes a Project with its projects as Videos, a lone project its own Project; opening again changes nothing', async ({
  page,
}) => {
  const email = await signUp(page);
  const userId = await page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem('aive.localCloud') ?? '{}') as {
          session?: string;
        }
      ).session ?? '',
  );
  expect(userId).not.toBe('');
  // Two editor projects exist (made the old way), and a P4 workspace names them.
  await page.goto('/');
  await expect(page.locator('#composition-canvas')).toBeVisible();
  const first = (await hook(page)).project.id;
  await page.goto('/panel/#/projects');
  await page.evaluate(
    ({ userId, first }) => {
      const at = '2026-11-01T10:00:00.000Z';
      localStorage.setItem(
        `aive.ws.doc.${userId}`,
        JSON.stringify({
          v: 1,
          styles: [
            {
              id: 'st-oldstyle001',
              name: 'My old style',
              createdAt: at,
              sourceProjectId: first,
              recordId: null,
            },
          ],
          projects: [
            {
              id: first,
              name: 'Old video',
              origin: 'ai',
              styleId: 'st-oldstyle001',
              aspect: '16:9',
              createdAt: at,
              updatedAt: at,
              pause: null,
              trashedAt: null,
            },
          ],
        }),
      );
    },
    { userId, first },
  );
  await page.reload();
  const card = page.locator('[data-ws-project="st-oldstyle001"]');
  await expect(card).toBeVisible();
  await expect(card.locator('h3')).toHaveText('My old style');
  const doc = () =>
    page.evaluate((u) => localStorage.getItem(`aive.ws.doc.${u}`), userId);
  const once = await doc();
  expect(JSON.parse(once!).v).toBe(2);
  expect(
    await page.evaluate(
      (u) => localStorage.getItem(`aive.ws.doc.${u}.v1`) !== null,
      userId,
    ),
  ).toBe(true);
  await page.reload();
  await expect(card).toBeVisible();
  expect(await doc()).toBe(once);
  await card.locator('[data-act="open"]').click();
  await expect(page.locator(`[data-video="${first}"]`)).toBeVisible();
  void email;
});
