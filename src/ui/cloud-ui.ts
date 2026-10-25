// Phase 1 (docs/PHASE1-PLAN.md, APP-020): the top bar's account slot and
// cloud save. Logged out it reads "Log in"; logged in it shows the email
// and a menu: Save to cloud, Open from cloud, Log out. The Supabase library
// loads on the first click, so the editor starts as before; when the cloud
// is off, not set up or unreachable, a message says so and nothing local
// changes (the local autosave keeps running).
import {
  deserializeProject,
  FutureSchemaError,
  serializeProject,
} from '../core';
import type { EditorEngine, Project } from '../core';
import { t } from '../i18n';
import {
  CloudConflictError,
  CloudNotConfiguredError,
  cloudConfig,
  type CloudBackend,
  type CloudProjectSummary,
  type CloudUser,
} from '../cloud/backend';
import { assetFingerprint, mediaKey } from '../media/import';
import type { MediaStore } from '../media/store';
import { showToast } from './components/toast';
import {
  confirmDialog,
  escapeHtml,
  openModal,
  promptDialog,
} from './components/modal';
import { iconSvg } from './icons';

export interface CloudHost {
  readonly engine: EditorEngine;
  readonly mediaStore: Promise<MediaStore | null>;
  /** The open local project's id (null without a project library). */
  localId(): string | null;
  /** Saves the open project locally, then opens `project` as a new one. */
  openProject(project: Project): Promise<string | null>;
  poster(): string | undefined;
}

const LINKS_KEY = 'aive.cloudLinks';
const SESSION_KEY = 'aive.cloud.session';
interface Link {
  cloudId: string;
  revision: number;
}
const readLinks = (): Record<string, Link> => {
  try {
    const value = JSON.parse(
      localStorage.getItem(LINKS_KEY) ?? '{}',
    ) as unknown;
    return value && typeof value === 'object'
      ? (value as Record<string, Link>)
      : {};
  } catch {
    return {};
  }
};
const writeLink = (localId: string, link: Link | null) => {
  try {
    const links = readLinks();
    if (link) links[localId] = link;
    else delete links[localId];
    localStorage.setItem(LINKS_KEY, JSON.stringify(links));
  } catch {
    // A browser without storage only forgets the link.
  }
};
/** The email of a kept session, read without loading the library. */
const storedEmail = (): string | null => {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as {
      user?: { email?: string };
    } | null;
    return session?.user?.email ?? null;
  } catch {
    return null;
  }
};

/** A plain sentence for a cloud failure. */
export function cloudErrorText(error: unknown): string {
  if (error instanceof CloudNotConfiguredError) return t('cloud.notConfigured');
  if (error instanceof CloudConflictError) return t('cloud.conflict');
  const text = error instanceof Error ? error.message : String(error);
  if (/fetch|network|load failed|ECONNREFUSED/i.test(text))
    return t('cloud.unreachable');
  return t('cloud.failed', { error: text });
}

export function mountCloud(
  slot: HTMLElement,
  host: CloudHost,
  makeBackend: () => Promise<CloudBackend | null> = async () => {
    const config = cloudConfig();
    if (!config) return null;
    const { createSupabaseBackend } = await import('../cloud/supabase');
    return createSupabaseBackend(config);
  },
): () => void {
  let backend: Promise<CloudBackend | null> | null = null;
  let user: CloudUser | null = null;
  let stopWatching: (() => void) | null = null;
  let busy = false;
  const get = async (): Promise<CloudBackend> => {
    backend ??= makeBackend().then((made) => {
      if (made)
        stopWatching = made.onUserChange((next) => {
          user = next;
          render(next?.email ?? null);
        });
      return made;
    });
    const made = await backend;
    if (!made) throw new CloudNotConfiguredError();
    return made;
  };

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'account';
  button.className = 'account-button';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.className = 'account-menu context-menu';
  menu.id = 'account-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  slot.append(button, menu);

  const render = (email: string | null) => {
    button.dataset.state = email ? 'in' : 'out';
    const label = email ?? t('cloud.logIn');
    button.innerHTML = `${iconSvg('user', 20)}<span class="account-label"></span>`;
    button.querySelector('span')!.textContent = label;
    button.setAttribute(
      'aria-label',
      email ? t('cloud.accountOf', { email }) : t('cloud.logIn'),
    );
    button.title = email
      ? t('cloud.accountOf', { email })
      : t('cloud.logInHint');
  };
  render(storedEmail());

  const closeMenu = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  const item = (id: string, icon: string, label: string, run: () => void) => {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.setAttribute('role', 'menuitem');
    entry.dataset.action = id;
    entry.innerHTML = `${iconSvg(icon, 16)}<span></span>`;
    entry.querySelector('span')!.textContent = label;
    entry.onclick = () => {
      closeMenu();
      run();
    };
    return entry;
  };
  const openMenu = () => {
    const email = user?.email ?? null;
    menu.replaceChildren();
    if (email) {
      const head = document.createElement('div');
      head.className = 'account-menu-email';
      head.textContent = email;
      menu.append(
        head,
        item('cloud-save', 'save', t('cloud.save'), () => void save()),
        item('cloud-open', 'folder', t('cloud.open'), () => void openList()),
        item('cloud-logout', 'close', t('cloud.logOut'), () => void logOut()),
      );
    } else
      menu.append(
        item('cloud-login', 'user', t('cloud.logInOrSignUp'), () => signIn()),
      );
    const box = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${box.bottom + 6}px`;
    menu.style.right = `${Math.max(8, innerWidth - box.right)}px`;
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  };
  button.onclick = async () => {
    if (!menu.hidden) return closeMenu();
    try {
      const made = await get();
      user = await made.user();
      render(user?.email ?? null);
    } catch (error) {
      user = null;
      render(null);
      showToast(cloudErrorText(error), 'error', 8000);
      return;
    }
    openMenu();
  };
  const outside = (event: PointerEvent) => {
    if (!menu.hidden && !slot.contains(event.target as Node)) closeMenu();
  };
  const keys = (event: KeyboardEvent) => {
    if (menu.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      button.focus();
    }
  };
  document.addEventListener('pointerdown', outside, true);
  menu.addEventListener('keydown', keys);

  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    try {
      await task();
    } catch (error) {
      showToast(cloudErrorText(error), 'error', 10_000);
    } finally {
      busy = false;
    }
  };

  // Log in or sign up.
  const signIn = () => {
    let error!: HTMLElement;
    const handle = openModal({
      titleText: t('cloud.logInTitle'),
      bodyBuilder: (body) => {
        body.classList.add('cloud-login');
        body.innerHTML = `
          <p class="modal-message">${escapeHtml(t('cloud.logInIntro'))}</p>
          <label class="field-row">${escapeHtml(t('cloud.email'))}<input id="cloud-email" type="email" autocomplete="email" required /></label>
          <label class="field-row">${escapeHtml(t('cloud.password'))}<input id="cloud-password" type="password" autocomplete="current-password" minlength="8" required /></label>
          <p class="cloud-error" role="alert" hidden></p>
          <div class="modal-actions">
            <button type="button" class="button" data-action="cloud-signup">${escapeHtml(t('cloud.signUp'))}</button>
            <button type="button" class="button primary" data-action="cloud-signin">${escapeHtml(t('cloud.logIn'))}</button>
          </div>`;
        error = body.querySelector('.cloud-error')!;
      },
    });
    const root = handle.root;
    const email = root.querySelector<HTMLInputElement>('#cloud-email')!;
    const password = root.querySelector<HTMLInputElement>('#cloud-password')!;
    const buttons = [
      ...root.querySelectorAll<HTMLButtonElement>('.modal-actions button'),
    ];
    const attempt = async (create: boolean) => {
      error.hidden = true;
      if (!email.value.includes('@') || password.value.length < 8) {
        error.textContent = t('cloud.needCredentials');
        error.hidden = false;
        return;
      }
      buttons.forEach((each) => (each.disabled = true));
      try {
        const made = await get();
        user = create
          ? await made.signUp(email.value.trim(), password.value)
          : await made.signIn(email.value.trim(), password.value);
        render(user.email);
        handle.close();
        showToast(
          t(create ? 'cloud.signedUp' : 'cloud.signedIn', {
            email: user.email ?? '',
          }),
          'success',
        );
      } catch (failure) {
        error.textContent = cloudErrorText(failure);
        error.hidden = false;
      } finally {
        buttons.forEach((each) => (each.disabled = false));
      }
    };
    root.querySelector<HTMLButtonElement>(
      '[data-action="cloud-signin"]',
    )!.onclick = () => void attempt(false);
    root.querySelector<HTMLButtonElement>(
      '[data-action="cloud-signup"]',
    )!.onclick = () => void attempt(true);
    password.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void attempt(false);
    });
    email.focus();
  };

  const logOut = () =>
    run(async () => {
      await (await get()).signOut();
      user = null;
      render(null);
      showToast(t('cloud.signedOut'), 'info');
    });

  // Save: the project JSON plus every media file the cloud does not have.
  const save = () =>
    run(async () => {
      const made = await get();
      const project = host.engine.state;
      const store = await host.mediaStore;
      const files = new Map<
        string,
        {
          readonly name: string;
          readonly metadata: Readonly<Record<string, unknown>>;
        }
      >();
      for (const asset of project.assets as unknown as readonly {
        name: string;
        source: { kind: string; reference: string };
        metadata: Readonly<Record<string, unknown>>;
      }[]) {
        const fingerprint = assetFingerprint(asset);
        if (fingerprint && asset.metadata.removed !== true)
          files.set(fingerprint, asset);
      }
      const dismiss = showToast(t('cloud.saving'), 'info', 120_000);
      let missing = 0;
      try {
        const have = await made.hasMedia([...files.keys()]);
        let sent = 0;
        for (const [fingerprint, asset] of files) {
          if (have.has(fingerprint)) continue;
          const blob = await store?.read(mediaKey(fingerprint));
          if (!blob) {
            missing += 1;
            continue;
          }
          const name =
            typeof asset.metadata.fileName === 'string'
              ? asset.metadata.fileName
              : asset.name;
          const mimeType =
            typeof asset.metadata.mimeType === 'string'
              ? asset.metadata.mimeType
              : blob.type;
          await made.uploadMedia(fingerprint, blob, {
            name,
            mimeType,
            size: blob.size,
          });
          sent += 1;
          showToast(
            t('cloud.uploading', { done: sent, total: files.size - have.size }),
            'info',
            120_000,
          );
        }
        const input = {
          name: project.metadata.name,
          schemaVersion: project.schemaVersion,
          document: serializeProject(project),
          thumbnail: host.poster() ?? null,
        };
        const localId = host.localId() ?? 'single';
        const link = readLinks()[localId];
        let saved: CloudProjectSummary;
        if (link)
          try {
            saved = await made.saveProject(link.cloudId, link.revision, input);
          } catch (error) {
            if (!(error instanceof CloudConflictError)) throw error;
            dismiss();
            if (
              !(await confirmDialog(t('cloud.conflictAsk'), {
                titleText: t('cloud.conflictTitle'),
                confirmLabel: t('cloud.saveAsNew'),
              }))
            )
              return;
            saved = await made.createProject(input);
          }
        else saved = await made.createProject(input);
        writeLink(localId, { cloudId: saved.id, revision: saved.revision });
      } catch (error) {
        dismiss();
        throw error;
      }
      showToast(
        missing
          ? t('cloud.savedMissing', { count: missing })
          : t('cloud.saved', { name: project.metadata.name }),
        missing ? 'error' : 'success',
      );
    });

  // Open: the person's projects; a project opens as a new local project
  // after its media is downloaded into this browser.
  const openOne = (summary: CloudProjectSummary, close: () => void) =>
    run(async () => {
      const made = await get();
      const { summary: latest, document } = await made.loadProject(summary.id);
      let project: Project;
      try {
        project = deserializeProject(document);
      } catch (error) {
        if (error instanceof FutureSchemaError)
          throw new Error(
            t('cloud.newerSchema', { version: latest.schemaVersion }),
          );
        throw error;
      }
      const store = await host.mediaStore;
      let failed = 0;
      for (const asset of project.assets) {
        const fingerprint = assetFingerprint(asset);
        if (!fingerprint || !store || (await store.has(mediaKey(fingerprint))))
          continue;
        try {
          await store.write(
            mediaKey(fingerprint),
            await made.downloadMedia(fingerprint),
          );
        } catch {
          failed += 1;
        }
      }
      close();
      const localId = await host.openProject(project);
      writeLink(localId ?? 'single', {
        cloudId: latest.id,
        revision: latest.revision,
      });
      showToast(
        failed
          ? t('cloud.openedMissing', { count: failed })
          : t('cloud.opened', { name: latest.name }),
        failed ? 'error' : 'success',
      );
    });

  const openList = () =>
    run(async () => {
      const made = await get();
      const list = await made.listProjects();
      const handle = openModal({
        titleText: t('cloud.openTitle'),
        bodyBuilder: (body) => {
          body.classList.add('cloud-projects');
          if (!list.length) {
            const empty = document.createElement('p');
            empty.className = 'modal-message';
            empty.textContent = t('cloud.noProjects');
            body.append(empty);
            return;
          }
          const rows = document.createElement('ul');
          rows.className = 'cloud-project-list';
          for (const summary of list) {
            const row = document.createElement('li');
            row.className = 'cloud-project';
            row.dataset.cloudId = summary.id;
            const name = document.createElement('span');
            name.className = 'cloud-project-name';
            name.textContent = summary.name;
            const time = document.createElement('span');
            time.className = 'cloud-project-time';
            time.textContent = new Date(summary.updatedAt).toLocaleString();
            const open = document.createElement('button');
            open.type = 'button';
            open.className = 'button primary';
            open.dataset.action = 'cloud-project-open';
            open.textContent = t('cloud.openOne');
            open.onclick = () => void openOne(summary, () => handle.close());
            const rename = document.createElement('button');
            rename.type = 'button';
            rename.className = 'icon-button';
            rename.dataset.action = 'cloud-project-rename';
            rename.setAttribute('aria-label', t('projects.rename'));
            rename.title = t('projects.rename');
            rename.innerHTML = iconSvg('edit', 18);
            rename.onclick = async () => {
              const next = await promptDialog(
                t('projects.rename'),
                summary.name,
                {
                  label: t('project.name'),
                  confirmLabel: t('projects.rename'),
                  cancelLabel: t('action.cancel'),
                  maxLength: 200,
                },
              );
              if (!next?.trim()) return;
              await run(async () => {
                await made.renameProject(summary.id, next.trim());
                name.textContent = next.trim();
              });
            };
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'icon-button';
            remove.dataset.action = 'cloud-project-delete';
            remove.setAttribute('aria-label', t('projects.delete'));
            remove.title = t('projects.delete');
            remove.innerHTML = iconSvg('delete', 18);
            remove.onclick = async () => {
              if (
                !(await confirmDialog(
                  escapeHtml(t('cloud.deleteAsk', { name: summary.name })),
                  {
                    titleText: t('projects.delete'),
                    confirmLabel: t('projects.delete'),
                    danger: true,
                  },
                ))
              )
                return;
              await run(async () => {
                await made.deleteProject(summary.id);
                row.remove();
              });
            };
            row.append(name, time, open, rename, remove);
            rows.append(row);
          }
          body.append(rows);
        },
      });
      handle.root.classList.add('cloud-dialog');
    });

  return () => {
    stopWatching?.();
    document.removeEventListener('pointerdown', outside, true);
    button.remove();
    menu.remove();
  };
}
