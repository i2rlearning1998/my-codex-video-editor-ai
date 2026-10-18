// FINAL2 U1: the status of the offline (in-browser) speech engines, shown in
// Settings › Offline voice & captions, the Voice-over section and the Auto
// captions dialog. One controller so every surface shows the same state.
import { t } from '../i18n';
import { LOCAL_MODELS, type createSpeechRegistry } from '../speech';

type Registry = ReturnType<typeof createSpeechRegistry>;
export type EngineAction = 'download' | 'cancel' | 'remove';
export interface LocalEngineView {
  id: string;
  state: 'ready' | 'needs-download' | 'downloading' | 'unavailable';
  label: string;
  note: string;
  progress?: number;
  actions: EngineAction[];
}
/** What a downloadable engine needs to offer Download, Cancel and Remove. */
export interface LocalEngineDriver {
  download(
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
  ): Promise<void>;
  remove(): Promise<void>;
}

export const LOCAL_ENGINE_IDS = ['local-whisper', 'local-tts'] as const;
const drivers = new Map<string, LocalEngineDriver>();
const running = new Map<
  string,
  { controller: AbortController; progress: number }
>();
const errors = new Map<string, string>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of [...listeners]) listener();
};

/** Redraws every surface showing the engines (a status changed). */
export const refreshLocalEngines = () => notify();
/** U11 registers the Whisper driver here; tests register fakes. */
export function registerLocalEngineDriver(
  id: string,
  driver: LocalEngineDriver,
): void {
  drivers.set(id, driver);
  notify();
}

export const formatBytes = (bytes: number) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

export function localEngines(registry: Registry) {
  const view = (id: string): LocalEngineView => {
    const status = registry.getSpeechStatus().find((s) => s.id === id);
    const job = running.get(id);
    if (job)
      return {
        id,
        state: 'downloading',
        label: t('settings.offline.state.downloading', {
          percent: Math.round(job.progress * 100),
        }),
        note: t('settings.offline.note.downloading'),
        progress: job.progress,
        actions: ['cancel'],
      };
    if (!status || status.state === 'unavailable')
      return {
        id,
        state: 'unavailable',
        label: t('settings.offline.state.unavailable'),
        note: t(`settings.offline.note.${id}`),
        actions: [],
      };
    if (status.state === 'needs-download')
      return {
        id,
        state: 'needs-download',
        label: t('settings.offline.state.needsDownload', {
          size: formatBytes(status.sizeBytes),
        }),
        note:
          errors.get(id) ??
          t(
            LOCAL_MODELS.find((m) => m.id === id)?.pinned === false
              ? 'settings.offline.note.unpinned'
              : 'settings.offline.note.download',
          ),
        actions: drivers.has(id) ? ['download'] : [],
      };
    return {
      id,
      state: 'ready',
      label: t('settings.offline.state.ready'),
      note: t('settings.offline.note.ready'),
      actions: drivers.has(id) ? ['remove'] : [],
    };
  };
  return {
    views: () => LOCAL_ENGINE_IDS.map(view),
    view,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async act(id: string, action: EngineAction) {
      const driver = drivers.get(id);
      if (action === 'cancel') {
        running.get(id)?.controller.abort();
        return;
      }
      if (!driver) return;
      if (action === 'remove') {
        await driver.remove();
        notify();
        return;
      }
      if (running.has(id)) return;
      const job = { controller: new AbortController(), progress: 0 };
      running.set(id, job);
      errors.delete(id);
      notify();
      try {
        await driver.download((fraction) => {
          job.progress = Math.min(1, Math.max(0, fraction));
          notify();
        }, job.controller.signal);
      } catch {
        if (!job.controller.signal.aborted)
          errors.set(id, t('settings.offline.note.failed'));
      } finally {
        running.delete(id);
        notify();
      }
    },
  };
}
