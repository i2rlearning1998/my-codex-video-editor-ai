import { observeDiagnostics, installDebugReport } from './dev/debug-report';
import {
  EditorEngine,
  adoptFreeLayers,
  deserializeProject,
  serializeProject,
} from './core';
import { Autosave, LocalProjectStore } from './persistence/local';
import {
  CURRENT_KEY,
  LEGACY_KEY,
  ProjectLibrary,
  SESSION_KEY,
  openIndexedDbStore,
} from './persistence/projects';
import type { ProjectsApi } from './ui/projects-dialog';
import { showToast } from './ui/components/toast';
import { createExampleProject } from './ui/example';
import { mountEditorShell } from './ui/shell';
import { confirmDialog } from './ui/components/modal';
import { getLanguage, t } from './i18n';
import { initTheme } from './ui/theme';
import { initAccent } from './ui/accent';
import { mountTooltips } from './ui/components/tooltip';
import './style.css';

initTheme();
initAccent();
mountTooltips();
// H2: the canvas shows its focus ring only after keyboard navigation (a click
// focuses it for shortcuts, which should not frame the whole stage).
document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Tab')
      document.documentElement.classList.add('keyboard-nav');
  },
  true,
);
document.addEventListener(
  'pointerdown',
  () => document.documentElement.classList.remove('keyboard-nav'),
  true,
);

// TL-001: documents open with every top-level layer as a clip on a track.
const openable = (project: unknown) => {
  const { project: adopted, adopted: count } = adoptFreeLayers(
    project as object,
  );
  return {
    project: adopted,
    note: count ? ` ${t('project.adopted', { count })}` : '',
  };
};
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const setting = {
  get: (key: string) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set: (key: string, value: string | null) => {
    try {
      if (value === null) storage?.removeItem(key);
      else storage?.setItem(key, value);
    } catch {
      // A blocked setting only costs the convenience it stores.
    }
  },
};
const timeOf = (iso: string) =>
  new Intl.DateTimeFormat(getLanguage(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));

/**
 * AUDIT-EDITOR (PRJ-015): projects live in IndexedDB, one record each. The
 * single localStorage slot of earlier versions is moved in once (and only
 * removed after the copy is written); a newer-schema slot is left alone.
 * Without IndexedDB the editor keeps using that slot as before.
 */
async function openLibrary() {
  let library: ProjectLibrary | null = null;
  try {
    library = new ProjectLibrary(await openIndexedDbStore());
  } catch {
    return { library: null, notice: null as string | null };
  }
  let notice: string | null = null;
  if (storage && storage.getItem(LEGACY_KEY) !== null) {
    try {
      const legacy = new LocalProjectStore(storage).load();
      if (legacy.project) {
        const id = crypto.randomUUID();
        await library.save(id, legacy.project);
        setting.set(CURRENT_KEY, id);
        storage.removeItem(LEGACY_KEY);
        storage.removeItem(`${LEGACY_KEY}:backup`);
      }
    } catch (error) {
      notice = `${t('projects.legacyKept')} ${String(error)}`;
    }
  }
  return { library, notice };
}

/**
 * REL-007 (D-002): the editor targets current desktop Chrome and Edge. Other
 * browsers get a clear message (they may still try).
 */
function supportedBrowser(): boolean {
  const brands = (
    navigator as Navigator & {
      userAgentData?: { brands?: readonly { brand: string }[] };
    }
  ).userAgentData?.brands;
  return (
    !!brands?.some((item) =>
      /Chromium|Google Chrome|Microsoft Edge/.test(item.brand),
    ) &&
    'VideoEncoder' in window &&
    'OffscreenCanvas' in window
  );
}

async function boot() {
  const { library, notice: libraryNotice } = await openLibrary();
  let store: LocalProjectStore | undefined;
  let currentId: string | null = null;
  let initialProject = openable(createExampleProject()).project;
  let initialMessage =
    'Example project · All artwork is part of the canonical scene.';
  const notices: { text: string; kind: 'info' | 'error' }[] = [];
  if (libraryNotice) notices.push({ text: libraryNotice, kind: 'error' });
  // PRJ-017: a page that closed without saying so last time crashed.
  const crashed = setting.get(SESSION_KEY) !== null;
  if (library) {
    const remembered = setting.get(CURRENT_KEY);
    if (remembered)
      try {
        const opened = await library.open(remembered);
        if (opened) {
          currentId = remembered;
          const ready = openable(opened.project);
          initialProject = ready.project;
          initialMessage = t('projects.loaded') + ready.note;
          if (opened.recovered)
            // PRJ-010: the damaged save is kept; the last good copy opens.
            notices.push({
              text: t('projects.recoveredBackup', {
                time: timeOf(opened.updatedAt),
              }),
              kind: 'error',
            });
          else if (crashed)
            notices.push({
              text: t('projects.recoveredCrash', {
                time: timeOf(opened.updatedAt),
              }),
              kind: 'info',
            });
        }
      } catch (error) {
        // A newer-schema or unreadable project stays as it is; a new one
        // opens instead.
        notices.push({
          text: t('projects.notOpened', { error: String(error) }),
          kind: 'error',
        });
      }
  } else {
    try {
      store = new LocalProjectStore(window.localStorage);
      const loaded = store.load();
      if (loaded.project) {
        const opened = openable(loaded.project);
        initialProject = opened.project;
        initialMessage =
          (loaded.recovered
            ? `Recovered the last good backup. ${loaded.warning ?? ''}`
            : 'Project loaded from this browser.') + opened.note;
      }
    } catch (error) {
      store = undefined;
      initialMessage = `Local persistence paused to protect existing data. JSON export remains available. ${String(error)}`;
    }
  }
  setting.set(SESSION_KEY, '1');

  const engine = new EditorEngine(initialProject, {
    onListenerError: (error) => console.error('Editor observer failed', error),
  });
  const diagnostics = observeDiagnostics(engine);
  let shell!: ReturnType<typeof mountEditorShell>;
  // The library's autosave: every edit marks the project unsaved; 500 ms
  // after the last one it is written (with a fresh poster).
  let dirty = false;
  let saving: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** A load that is not a stored project's open is a new project. */
  let openingStored = false;
  const writeNow = async () => {
    clearTimeout(timer);
    timer = undefined;
    if (!library || !dirty) return;
    if (saving) await saving;
    if (!dirty) return;
    dirty = false;
    const id = (currentId ??= crypto.randomUUID());
    setting.set(CURRENT_KEY, id);
    shell?.setSaveStatus('saving');
    saving = library
      .save(id, engine.state, shell?.projectPoster())
      .then(
        () => {
          if (!dirty) shell?.setSaveStatus('saved');
        },
        (error: unknown) => {
          dirty = true;
          shell?.message(t('status.saveFailed', { error: String(error) }));
          shell?.setSaveStatus('error', t('status.saveError'));
        },
      )
      .finally(() => {
        saving = null;
      });
    await saving;
  };
  if (library) {
    engine.on('state:changed', (event) => {
      if (event.reason === 'load' && !openingStored) currentId = null;
      dirty = true;
      shell?.setSaveStatus('unsaved');
      clearTimeout(timer);
      timer = setTimeout(
        () => void writeNow(),
        event.reason === 'load' ? 0 : 500,
      );
    });
  }
  const projects: ProjectsApi | undefined = library
    ? {
        list: () => library.list(),
        currentId: () => currentId,
        open: async (id) => {
          await writeNow();
          const opened = await library.open(id);
          if (!opened) throw new Error(t('projects.missing'));
          openingStored = true;
          try {
            engine.load(openable(opened.project).project);
          } finally {
            openingStored = false;
          }
          currentId = id;
          setting.set(CURRENT_KEY, id);
          dirty = false;
          clearTimeout(timer);
          shell.setSaveStatus('saved');
          shell.message(
            t('projects.opened', { name: opened.project.metadata.name }),
          );
          if (opened.recovered)
            showToast(
              t('projects.recoveredBackup', { time: timeOf(opened.updatedAt) }),
              'error',
            );
        },
        rename: async (id, name) => {
          if (id === currentId)
            engine.library('Rename project', [
              { type: 'SET_PROJECT_NAME', name: name.trim() },
            ]);
          else await library.rename(id, name);
        },
        duplicate: async (id) => {
          if (id === currentId) await writeNow();
          await library.duplicate(id, (name) =>
            t('projects.copyName', { name }),
          );
        },
        remove: async (id) => {
          if (id === currentId) throw new Error(t('projects.deleteOpen'));
          await library.remove(id);
        },
        create: () => undefined,
      }
    : undefined;

  shell = mountEditorShell(
    document.querySelector<HTMLDivElement>('#app')!,
    engine,
    {
      ...(library
        ? {
            save: () => {
              dirty = true;
              void writeNow().then(() => shell.message(t('status.saved')));
            },
          }
        : store
          ? {
              save: () => {
                store!.save(engine.state);
                shell.message(t('status.saved'));
                shell.setSaveStatus('saved');
              },
            }
          : {}),
      ...(projects ? { projects } : {}),
      exportProject: () => {
        const url = URL.createObjectURL(
          new Blob([serializeProject(engine.state)], {
            type: 'application/json',
          }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = 'project.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        shell.message(t('status.exported'));
      },
      importProject: async (file) => {
        if (file.size > 20_000_000) throw new Error(t('status.sizeLimit'));
        const opened = openable(deserializeProject(await file.text()));
        if (
          await confirmDialog(
            t(library ? 'project.openConfirmKept' : 'project.openConfirm'),
            {
              titleText: t('project.openTitle'),
              confirmLabel: t('project.openTitle'),
            },
          )
        ) {
          await writeNow();
          engine.load(opened.project);
          shell.message(t('project.opened') + opened.note);
        }
      },
      openExample: async () => {
        if (
          await confirmDialog(
            t(
              library ? 'project.exampleConfirmKept' : 'project.exampleConfirm',
            ),
            {
              titleText: t('project.exampleTitle'),
              confirmLabel: t('project.exampleTitle'),
            },
          )
        ) {
          await writeNow();
          engine.load(openable(createExampleProject()).project);
          shell.message(t('project.exampleOpened'));
        }
      },
    },
  );
  shell.message(initialMessage);
  shell.setSaveStatus(
    library || store ? 'saved' : 'error',
    library || store ? undefined : t('status.localUnavailable'),
  );
  if (!supportedBrowser())
    notices.unshift({ text: t('app.unsupportedBrowser'), kind: 'error' });
  for (const notice of notices)
    showToast(
      notice.text,
      notice.kind,
      12_000,
      projects
        ? {
            label: t('projects.menu'),
            run: () =>
              document.querySelector<HTMLButtonElement>('#projects')?.click(),
          }
        : undefined,
    );
  const removeDebugReport = installDebugReport(
    engine,
    shell.session,
    diagnostics,
    // H2: the Help group of the main menu.
    document.querySelector('#app-menu .app-menu-group:last-child')!,
    shell.message,
  );
  let removeTestHook: (() => void) | undefined;
  let disposed = false;
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
    void import('./dev/test-hook').then(({ installTestHook }) => {
      if (!disposed)
        removeTestHook = installTestHook(
          engine,
          shell.session,
          diagnostics.getErrors,
          shell.mediaDebug,
          shell.canvasDebug,
        );
    });
  }
  // A new library starts with the open project saved, so it is listed.
  if (library && !currentId) {
    dirty = true;
    void writeNow();
  }
  const autosave = store
    ? new Autosave(engine, store, {
        onDirty: () => shell.setSaveStatus('unsaved'),
        // H2: the top bar shows the save state; a background save does not
        // replace the last message (a refusal must stay readable).
        onSaved: () => shell.setSaveStatus('saved'),
        onError: (error) => {
          shell.message(t('status.saveFailed', { error: String(error) }));
          shell.setSaveStatus('error', t('status.saveError'));
        },
      })
    : undefined;
  // The page is going: the pending save starts now, in this task (the
  // library issues its write at once for a project it has saved before).
  const flush = () => {
    autosave?.flush();
    clearTimeout(timer);
    if (library && dirty) {
      dirty = false;
      const id = (currentId ??= crypto.randomUUID());
      setting.set(CURRENT_KEY, id);
      void library.save(id, engine.state).catch(() => undefined);
    }
    setting.set(SESSION_KEY, null);
  };
  // APP-018: closing the tab while a save is still pending asks first.
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!dirty && !saving) return;
    void writeNow();
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', beforeUnload);
  // REL-002: an error the UI did not catch never loses the project: the
  // work is saved at once and a message offers to reload the editor.
  let lastErrorNotice = 0;
  const onUiError = () => {
    if (library) {
      dirty = true;
      void writeNow();
    } else autosave?.flush();
    if (Date.now() - lastErrorNotice < 5000) return;
    lastErrorNotice = Date.now();
    showToast(t('app.uiError'), 'error', 15_000, {
      label: t('app.reload'),
      run: () => {
        flush();
        location.reload();
      },
    });
  };
  window.addEventListener('error', onUiError);
  window.addEventListener('unhandledrejection', onUiError);
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      disposed = true;
      removeTestHook?.();
      removeDebugReport();
      diagnostics.dispose();
      flush();
      autosave?.dispose();
      shell.dispose();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('error', onUiError);
      window.removeEventListener('unhandledrejection', onUiError);
    });
}
void boot();
