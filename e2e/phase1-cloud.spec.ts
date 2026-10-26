import path from 'node:path';
import { statSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, hook, showCategory, allowError } from './fixtures';
import { CLOUD_URL, fakeCloud } from './cloud-fake';

// Phase 1 (docs/PHASE1-PLAN.md): the account slot and cloud save, against
// the stand-in Supabase API of cloud-fake.ts (the real database rules are
// tested by `npm run cloud:test`). Real mouse and keyboard only.
const MEDIA = 'tests/fixtures/media';
const PICTURE = 'image_testsrc_1200x800.jpg';
const EMAIL = 'owner@example.com';
const PASSWORD = 'correct-horse-9';

async function ready(page: Page) {
  await page.goto('/');
  await expect
    .poll(async () => page.evaluate(() => '__AIVE__' in window))
    .toBe(true);
}
async function accountAction(page: Page, action: string) {
  await page.locator('#account').click();
  const entry = page.locator(`#account-menu [data-action="${action}"]`);
  await expect(entry).toBeVisible();
  await entry.click();
}
async function logIn(page: Page, create: boolean) {
  await accountAction(page, 'cloud-login');
  await page.locator('#cloud-email').fill(EMAIL);
  await page.locator('#cloud-password').fill(PASSWORD);
  await page
    .locator(`[data-action="${create ? 'cloud-signup' : 'cloud-signin'}"]`)
    .click();
  await expect(page.locator('#account')).toContainText(EMAIL);
}
/** The bytes kept in this browser's media store (OPFS) for a fingerprint. */
const storedSize = (page: Page, fingerprint: string) =>
  page.evaluate(async (fp) => {
    try {
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('aive-media');
      const folder = await root.getDirectoryHandle('media');
      return (await (await folder.getFileHandle(fp)).getFile()).size;
    } catch {
      return -1;
    }
  }, fingerprint);

test('[APP-020] sign up, save to the cloud, reload, and open it in a fresh browser: the project and its media come back', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const cloud = await fakeCloud(page.context());
  await ready(page);
  await expect(page.locator('#account')).toHaveText('Log in');
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(path.join(MEDIA, PICTURE));
  await expect(page.locator('#media-import')).toBeHidden({ timeout: 30_000 });
  await page.locator(`.media-card[data-name="${PICTURE}"]`).dblclick();
  const project = (await hook(page)).project;
  const asset = project.assets.find((item) => item.name === PICTURE)!;
  const fingerprint = /^media\/([0-9a-f]{32})$/.exec(
    asset.source.reference,
  )![1]!;

  await logIn(page, true);
  await accountAction(page, 'cloud-save');
  await expect(page.locator('.toast')).toContainText(/^Saved "/);
  expect(cloud.projects).toHaveLength(1);
  expect(cloud.projects[0]!.name).toBe(project.metadata.name);
  // The JSON keeps references only; the bytes went to the owner's folder.
  expect(cloud.projects[0]!.document).not.toContain('base64');
  const key = `${cloud.projects[0]!.owner_id}/${fingerprint}`;
  expect(cloud.files.get(key)?.length).toBe(
    statSync(path.join(MEDIA, PICTURE)).size,
  );

  // A second save updates the same cloud project and uploads nothing new.
  const uploads = cloud.requests.filter((r) => r.startsWith('POST /storage'));
  await accountAction(page, 'cloud-save');
  await expect.poll(() => cloud.projects[0]!.revision).toBe(2);
  expect(cloud.projects).toHaveLength(1);
  expect(
    cloud.requests.filter((r) => r.startsWith('POST /storage')),
  ).toHaveLength(uploads.length);

  // Reload: still logged in.
  await page.reload();
  await expect(page.locator('#account')).toContainText(EMAIL);

  // A fresh browser (no local projects, no media): log in and open.
  const other = await browser.newContext({
    viewport: { width: 1920, height: 940 },
  });
  await fakeCloud(other, cloud);
  const fresh = await other.newPage();
  await fresh.goto(page.url());
  await expect
    .poll(async () => fresh.evaluate(() => '__AIVE__' in window))
    .toBe(true);
  expect(await storedSize(fresh, fingerprint)).toBe(-1);
  await logIn(fresh, false);
  await accountAction(fresh, 'cloud-open');
  const row = fresh.locator('.cloud-project').first();
  await expect(row.locator('.cloud-project-name')).toHaveText(
    project.metadata.name,
  );
  await row.locator('[data-action="cloud-project-open"]').click();
  await expect(fresh.locator('#project-name')).toHaveText(
    project.metadata.name,
  );
  await expect
    .poll(() => storedSize(fresh, fingerprint))
    .toBe(statSync(path.join(MEDIA, PICTURE)).size);
  const opened = (await hook(fresh)).project;
  expect(opened.assets.map((item) => item.id)).toContain(asset.id);
  expect(opened.compositions.flatMap((item) => item.layers).length).toBe(
    project.compositions.flatMap((item) => item.layers).length,
  );
  await other.close();
});

test('[APP-020] cloud rename and delete change only the cloud list; logging out keeps the local project', async ({
  page,
}) => {
  const cloud = await fakeCloud(page.context());
  await ready(page);
  await logIn(page, true);
  await accountAction(page, 'cloud-save');
  await expect(page.locator('.toast')).toContainText(/^Saved "/);
  await accountAction(page, 'cloud-open');
  const row = page.locator('.cloud-project').first();
  await row.locator('[data-action="cloud-project-rename"]').click();
  const field = page.locator('.modal-dialog input').last();
  await field.fill('Lesson one');
  await page.keyboard.press('Enter');
  await expect(row.locator('.cloud-project-name')).toHaveText('Lesson one');
  expect(cloud.projects[0]!.name).toBe('Lesson one');
  await row.locator('[data-action="cloud-project-delete"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').last().click();
  await expect(row).toHaveCount(0);
  expect(cloud.projects).toHaveLength(0);
  await page.keyboard.press('Escape');
  const name = await page.locator('#project-name').textContent();
  await accountAction(page, 'cloud-logout');
  await expect(page.locator('#account')).toHaveText('Log in');
  await expect(page.locator('#project-name')).toHaveText(name!);
});

test('[APP-020] without a cloud set up, or with the server down, the account slot says so and local work is untouched', async ({
  page,
}) => {
  await ready(page);
  const before = (await hook(page)).history.labels.length;
  await page.locator('#account').click();
  await expect(page.locator('.toast-error')).toContainText('not set up');
  await expect(page.locator('#account-menu')).toBeHidden();
  expect((await hook(page)).history.labels.length).toBe(before);

  allowError(
    page,
    (message) => message.includes(CLOUD_URL),
    'The cloud server is switched off on purpose.',
  );
  await page.addInitScript((url) => {
    (
      window as { __AIVE_CLOUD_CONFIG__?: { url: string; anonKey: string } }
    ).__AIVE_CLOUD_CONFIG__ = { url, anonKey: 'e2e-anon-key' };
  }, CLOUD_URL);
  await page.route(`${CLOUD_URL}/**`, (route) =>
    route.abort('connectionrefused'),
  );
  await page.reload();
  await logInDown(page);
});

async function logInDown(page: Page) {
  await page.locator('#account').click();
  await page.locator('#account-menu [data-action="cloud-login"]').click();
  await page.locator('#cloud-email').fill(EMAIL);
  await page.locator('#cloud-password').fill(PASSWORD);
  await page.locator('[data-action="cloud-signin"]').click();
  await expect(page.locator('.cloud-error')).toContainText('cannot be reached');
  await expect(page.locator('#account')).toHaveText('Log in');
}

test('[LIB-032][LIB-031] the Open list shows each project picture, Free space lists and deletes only unused cloud files, Google sign-in shows only when set up, and a training record goes up with Save', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const cloud = await fakeCloud(page.context());
  await ready(page);
  // Logged out, without a Google client id: no Google button, one line why.
  await page.locator('#account').click();
  await expect(
    page.locator('#account-menu [data-note="google-off"]'),
  ).toHaveText('Google sign-in is not set up for this editor yet.');
  await page.keyboard.press('Escape');

  const project = (await hook(page)).project;
  // P1-31: this project was built by AI (the record the editor keeps for it).
  await page.evaluate(
    (projectId) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('aive-training', 1);
        open.onupgradeneeded = () =>
          open.result.createObjectStore('records', { keyPath: 'projectId' });
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const put = open.result
            .transaction('records', 'readwrite')
            .objectStore('records')
            .put({
              version: 1,
              projectId,
              createdAt: '2026-10-26T10:00:00.000Z',
              brief: 'A short lesson',
              plan: { format: 'video-plan', version: 2 },
              edits: [
                {
                  at: '2026-10-26T10:01:00.000Z',
                  label: 'Move',
                  commands: ['SET_PROPERTY'],
                },
              ],
            });
          put.onsuccess = () => resolve();
          put.onerror = () => reject(put.error);
        };
      }),
    project.id,
  );
  // After a reload the editor records this project's later edits.
  await page.reload();
  await hook(page);
  await showCategory(page, 'Media');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#import-media').click();
  await (await chooser).setFiles(path.join(MEDIA, PICTURE));
  await expect(page.locator('#media-import')).toBeHidden({ timeout: 30_000 });
  await page.locator(`.media-card[data-name="${PICTURE}"]`).dblclick();
  const edits = () =>
    page.evaluate(
      (projectId) =>
        new Promise<string[]>((resolve) => {
          const open = indexedDB.open('aive-training', 1);
          open.onsuccess = () => {
            const get = open.result
              .transaction('records')
              .objectStore('records')
              .get(projectId);
            get.onsuccess = () =>
              resolve(
                ((get.result?.edits ?? []) as { label: string }[]).map(
                  (edit) => edit.label,
                ),
              );
          };
        }),
      project.id,
    );
  await expect.poll(async () => (await edits()).length).toBeGreaterThan(1);
  expect((await edits())[0]).toBe('Move');

  await logIn(page, true);
  await accountAction(page, 'cloud-save');
  await expect(page.locator('.toast')).toContainText(/^Saved "/);
  await expect.poll(() => cloud.training?.length ?? 0).toBe(1);
  expect(cloud.training![0]).toMatchObject({
    project_id: project.id,
    brief: 'A short lesson',
    plan: { format: 'video-plan', version: 2 },
  });

  // The Open list shows the project's picture.
  await accountAction(page, 'cloud-open');
  const thumb = page.locator('.cloud-project .cloud-project-thumb').first();
  await expect(thumb).toBeVisible();
  if (cloud.projects[0]!.thumbnail)
    await expect(thumb.locator('img')).toHaveAttribute('src', /^data:image\//);
  else await expect(thumb.locator('svg')).toBeVisible();
  await page.keyboard.press('Escape');

  // An old upload no project uses any more.
  const owner = cloud.projects[0]!.owner_id;
  const old = 'f'.repeat(32);
  cloud.media.push({
    owner_id: owner,
    fingerprint: old,
    name: 'old-clip.webm',
    size: 2048,
  });
  cloud.files.set(`${owner}/${old}`, Buffer.alloc(2048));
  const used = cloud.media.find((row) => row.fingerprint !== old)!.fingerprint;
  await accountAction(page, 'cloud-free-space');
  const rows = page.locator('.cloud-free-space .cloud-media');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('.cloud-media-name')).toHaveText(
    'old-clip.webm',
  );
  await expect(rows.first().locator('.cloud-media-size')).toHaveText('2 KB');
  await rows.first().locator('[data-action="cloud-media-delete"]').click();
  await page.locator('.modal-dialog [data-role="confirm"]').last().click();
  await expect(rows).toHaveCount(0);
  expect(cloud.media.map((row) => row.fingerprint)).toEqual([used]);
  expect(cloud.files.has(`${owner}/${old}`)).toBe(false);
  expect(cloud.files.has(`${owner}/${used}`)).toBe(true);
  await page.keyboard.press('Escape');
  await accountAction(page, 'cloud-logout');

  // With a Google client id the sign-in dialog offers Google.
  await page.addInitScript(() => {
    (
      window as { __AIVE_GOOGLE_CLIENT_ID__?: string }
    ).__AIVE_GOOGLE_CLIENT_ID__ = 'e2e-google';
  });
  await page.reload();
  await hook(page);
  await page.locator('#account').click();
  await expect(
    page.locator('#account-menu [data-note="google-off"]'),
  ).toHaveCount(0);
  await page.locator('#account-menu [data-action="cloud-login"]').click();
  await expect(page.locator('[data-action="cloud-google"]')).toHaveText(
    'Continue with Google',
  );
});
