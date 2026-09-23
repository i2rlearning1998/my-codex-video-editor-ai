import { observeDiagnostics, installDebugReport } from './dev/debug-report';
import { EditorEngine, deserializeProject, serializeProject } from './core';
import { Autosave, LocalProjectStore } from './persistence/local';
import { createExampleProject } from './ui/example';
import { mountEditorShell } from './ui/shell';
import { confirmDialog } from './ui/components/modal';
import { t } from './i18n';
import './style.css';

let store: LocalProjectStore | undefined;
let initialProject = createExampleProject();
let initialMessage =
  'Example project · All artwork is part of the canonical scene.';
try {
  store = new LocalProjectStore(window.localStorage);
  const loaded = store.load();
  if (loaded.project) {
    initialProject = loaded.project;
    initialMessage = loaded.recovered
      ? `Recovered the last good backup. ${loaded.warning ?? ''}`
      : 'Project loaded from this browser.';
  }
} catch (error) {
  store = undefined;
  initialMessage = `Local persistence paused to protect existing data. JSON export remains available. ${String(error)}`;
}

const engine = new EditorEngine(initialProject, {
  onListenerError: (error) => console.error('Editor observer failed', error),
});
const diagnostics = observeDiagnostics(engine);
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
      const project = deserializeProject(await file.text());
      if (
        await confirmDialog(t('project.openConfirm'), {
          titleText: t('project.openTitle'),
          confirmLabel: t('project.openTitle'),
        })
      ) {
        engine.load(project);
        shell.message(t('project.opened'));
      }
    },
    openExample: async () => {
      if (
        await confirmDialog(t('project.exampleConfirm'), {
          titleText: t('project.exampleTitle'),
          confirmLabel: t('project.exampleTitle'),
        })
      ) {
        engine.load(createExampleProject());
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
  document.querySelector('.statusbar')!,
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
      );
  });
}
const autosave = store
  ? new Autosave(engine, store, {
      onDirty: () => shell.setSaveStatus('unsaved'),
      onSaved: () => {
        shell.message(t('status.saved'));
        shell.setSaveStatus('saved');
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
