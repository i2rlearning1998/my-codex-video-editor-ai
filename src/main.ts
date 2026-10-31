import { observeDiagnostics, installDebugReport } from './dev/debug-report';
import {
  EditorEngine,
  adoptFreeLayers,
  deserializeProject,
  serializeProject,
} from './core';
import { Autosave, LocalProjectStore } from './persistence/local';
import {
  canvasThumb,
  IdbBackend,
  ProjectLibrary,
} from './persistence/projects';
import { TabGuard } from './persistence/tab-guard';
import { createExampleProject } from './ui/example';
import { mountEditorShell } from './ui/shell';
import { confirmDialog } from './ui/components/modal';
import { t } from './i18n';
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

let store: LocalProjectStore | undefined;
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
let initialProject = openable(createExampleProject()).project;
let initialMessage =
  'Example project · All artwork is part of the canonical scene.';
// PRJ-017: a backup that replaced an unreadable save is offered, not forced.
let recoveredProject: ReturnType<typeof openable> | undefined;
try {
  store = new LocalProjectStore(window.localStorage);
  const loaded = store.load();
  if (loaded.project) {
    const opened = openable(loaded.project);
    if (loaded.recovered) {
      recoveredProject = opened;
      initialMessage = `Recovered the last good backup. ${loaded.warning ?? ''}`;
    } else {
      initialProject = opened.project;
      initialMessage = 'Project loaded from this browser.' + opened.note;
    }
  }
} catch (error) {
  store = undefined;
  initialMessage = `Local persistence paused to protect existing data. JSON export remains available. ${String(error)}`;
}

const engine = new EditorEngine(initialProject, {
  onListenerError: (error) => console.error('Editor observer failed', error),
});
const diagnostics = observeDiagnostics(engine);
// PRJ-015/016: every saved project also lives in the Projects library.
const library = new ProjectLibrary(new IdbBackend());
const thumbNow = () => {
  const canvas = document.querySelector<HTMLCanvasElement>(
    '#composition-canvas',
  );
  return canvas ? canvasThumb(canvas) : '';
};
let mirrorTimer: ReturnType<typeof setTimeout> | undefined;
const mirrorNow = async () => {
  clearTimeout(mirrorTimer);
  try {
    await library.save(engine.state, thumbNow());
  } catch {
    /* The library is a convenience copy; the main save already happened. */
  }
};
// FX10: ask the browser to keep this site's data (projects and media) when
// the disk runs low; a refusal changes nothing.
void navigator.storage?.persist?.().catch(() => false);
const mirrorSoon = () => {
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => void mirrorNow(), 800);
};
const shell = mountEditorShell(
  document.querySelector<HTMLDivElement>('#app')!,
  engine,
  {
    ...(store
      ? {
          save: () => {
            store!.save(engine.state);
            shell.message(t('status.saved'));
            shell.setSaveStatus('saved');
          },
        }
      : {}),
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
        await confirmDialog(t('project.openConfirm'), {
          titleText: t('project.openTitle'),
          confirmLabel: t('project.openTitle'),
        })
      ) {
        engine.load(opened.project);
        shell.message(t('project.opened') + opened.note);
      }
    },
    projects: {
      // FX10: the open project is always in the list, even before its
      // first background copy was written.
      list: async () => {
        await mirrorNow();
        return library.list();
      },
      currentId: () => engine.state.id,
      open: async (id) => {
        autosave?.flush();
        await mirrorNow();
        const project = await library.open(id);
        if (!project) throw new Error('Project not found');
        const opened = openable(project);
        engine.load(opened.project);
        tabGuard?.announce();
        shell.message(
          t('projects.opened', { name: opened.project.metadata.name }) +
            opened.note,
        );
      },
      rename: async (id, name) => {
        if (id === engine.state.id) {
          engine.library('Rename project', [
            { type: 'SET_PROJECT_NAME', name },
          ]);
          await mirrorNow();
          return true;
        }
        return library.rename(id, name);
      },
      duplicate: async (id) => {
        if (id === engine.state.id) await mirrorNow();
        const copyId = await library.duplicate(id, t('projects.copy'));
        // FX10: its My Templates, AI compositions and themes come along.
        if (copyId) await shell.copyProjectLibraries(id, copyId);
      },
      remove: (id) => library.remove(id),
    },
    openExample: async () => {
      if (
        await confirmDialog(t('project.exampleConfirm'), {
          titleText: t('project.exampleTitle'),
          confirmLabel: t('project.exampleTitle'),
        })
      ) {
        engine.load(openable(createExampleProject()).project);
        shell.message(t('project.exampleOpened'));
      }
    },
  },
);
shell.message(initialMessage);
shell.setSaveStatus(
  store ? 'saved' : 'error',
  store ? undefined : t('status.localUnavailable'),
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
const autosave = store
  ? new Autosave(engine, store, {
      onDirty: () => shell.setSaveStatus('unsaved'),
      // H2: the top bar shows the save state; a background save does not
      // replace the last message (a refusal must stay readable).
      onSaved: () => {
        shell.setSaveStatus('saved');
        mirrorSoon();
        tabGuard?.saved();
      },
      onError: (error) => {
        shell.message(t('status.saveFailed', { error: String(error) }));
        shell.setSaveStatus('error', t('status.saveError'));
      },
    })
  : undefined;
const flush = () => {
  autosave?.flush();
};
window.addEventListener('pagehide', flush);
// APP-018: closing while a save is still pending (it could not be written)
// asks the browser to warn first.
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (!autosave?.pending) return;
  autosave.flush();
  if (autosave.pending) {
    event.preventDefault();
    event.returnValue = '';
  }
};
window.addEventListener('beforeunload', beforeUnload);
// APP-019: the same project in two tabs never overwrites silently.
let tabGuard: TabGuard | undefined;
let conflictOpen = false;
if (typeof BroadcastChannel !== 'undefined') {
  tabGuard = new TabGuard(
    new BroadcastChannel('aive-project-tabs'),
    () => engine.state.id,
    (kind) => {
      if (conflictOpen || !autosave) return;
      conflictOpen = true;
      autosave.pause();
      void confirmDialog(
        t(
          kind === 'open-elsewhere'
            ? 'tabs.openElsewhere'
            : 'tabs.savedElsewhere',
        ),
        {
          titleText: t('tabs.title'),
          confirmLabel: t('tabs.keep'),
          cancelLabel: t('tabs.reload'),
        },
      ).then((keep) => {
        conflictOpen = false;
        if (keep) autosave.resume();
        else {
          // Leave without saving this tab's copy; the other tab's save wins.
          window.removeEventListener('pagehide', flush);
          window.removeEventListener('beforeunload', beforeUnload);
          location.reload();
        }
      });
    },
  );
  tabGuard.announce();
}
// PRJ-017: offer the backup that replaced an unreadable save.
if (recoveredProject) {
  const backup = recoveredProject;
  const time = new Date(backup.project.metadata.updatedAt).toLocaleString();
  void confirmDialog(t('recovery.body', { time }), {
    titleText: t('recovery.title'),
    confirmLabel: t('recovery.restore'),
    cancelLabel: t('recovery.skip'),
  }).then(async (restore) => {
    if (restore) {
      engine.load(backup.project);
      shell.message(t('recovery.restored', { time }) + backup.note);
    } else {
      // Keep the backup reachable from the Projects list.
      try {
        await library.save(backup.project);
      } catch {
        /* best effort */
      }
    }
  });
}
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
  });
