// FX10: the editor's Cloud switch (docs/EDITOR-OWNERSHIP.md). A master
// switch and one switch per group say what the person wants kept in the
// cloud. Turning it ON sends everything that exists in the chosen groups,
// then every later import or save follows. The target is a `CloudBackend`.
// Accounts arrive in Phase 2; until then the only backend is a local one that
// keeps a manifest of what is waiting ("connected: false"), and the panel
// says so. Nothing here touches the project or its history.
export const SYNC_GROUPS = ['project', 'media', 'templates', 'ai'] as const;
export type SyncGroup = (typeof SYNC_GROUPS)[number];

export interface SyncSettings {
  on: boolean;
  groups: Record<SyncGroup, boolean>;
}
export interface GroupSize {
  count: number;
  bytes: number;
}
export interface CloudBackend {
  /** False until an account is connected (Phase 2). */
  readonly connected: boolean;
  /** Sends (or, for the local backend, records) one group of one project. */
  push(projectId: string, group: SyncGroup, size: GroupSize): Promise<void>;
}
export type SyncStatus = 'off' | 'syncing' | 'synced' | 'waiting';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const SETTINGS_KEY = 'aive.cloudSync';
const STUB_KEY = 'aive.cloudStub';

export const defaultSettings = (): SyncSettings => ({
  on: false,
  groups: { project: true, media: true, templates: true, ai: true },
});

/** The local backend: remembers what was handed over, sends nothing. */
export function localBackend(storage: Storage | null): CloudBackend & {
  manifest(): Record<string, Partial<Record<SyncGroup, GroupSize>>>;
} {
  const read = (): Record<string, Partial<Record<SyncGroup, GroupSize>>> => {
    try {
      return JSON.parse(storage?.getItem(STUB_KEY) ?? '{}') as never;
    } catch {
      return {};
    }
  };
  return {
    connected: false,
    manifest: read,
    async push(projectId, group, size) {
      const all = read();
      all[projectId] = { ...all[projectId], [group]: size };
      try {
        storage?.setItem(STUB_KEY, JSON.stringify(all));
      } catch {
        // Browser storage full or off: the next push records it again.
      }
    },
  };
}

export interface SyncDeps {
  readonly storage: Storage | null;
  readonly backend: CloudBackend;
  readonly projectId: () => string;
  /** How much a group holds for the open project. */
  readonly measure: (group: SyncGroup) => Promise<GroupSize> | GroupSize;
  readonly debounceMs?: number;
}

export function createCloudSync(deps: SyncDeps) {
  const readSettings = (): SyncSettings => {
    try {
      const value = JSON.parse(
        deps.storage?.getItem(SETTINGS_KEY) ?? 'null',
      ) as Partial<SyncSettings> | null;
      const base = defaultSettings();
      return {
        on: value?.on === true,
        groups: { ...base.groups, ...(value?.groups ?? {}) },
      };
    } catch {
      return defaultSettings();
    }
  };
  let settings = readSettings();
  let status: SyncStatus = settings.on ? 'waiting' : 'off';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;
  let dirty = settings.on;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  const save = () => {
    try {
      deps.storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Kept for this session only.
    }
  };
  const run = (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      try {
        while (dirty && settings.on) {
          dirty = false;
          status = 'syncing';
          emit();
          const project = deps.projectId();
          for (const group of SYNC_GROUPS)
            if (settings.groups[group])
              await deps.backend.push(
                project,
                group,
                await deps.measure(group),
              );
        }
        status = !settings.on
          ? 'off'
          : deps.backend.connected
            ? 'synced'
            : 'waiting';
      } finally {
        running = null;
        emit();
      }
    })();
    return running;
  };
  return {
    settings: (): SyncSettings => ({
      on: settings.on,
      groups: { ...settings.groups },
    }),
    status: (): SyncStatus => status,
    /** False until an account is connected: "on" then means "waiting". */
    connected: () => deps.backend.connected,
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async setOn(on: boolean) {
      settings = { ...settings, on };
      save();
      dirty = on;
      if (!on) status = 'off';
      emit();
      if (on) await run();
    },
    async setGroup(group: SyncGroup, value: boolean) {
      settings = {
        ...settings,
        groups: { ...settings.groups, [group]: value },
      };
      save();
      // A group switched on sends what it holds; the others are unchanged.
      dirty = settings.on;
      emit();
      if (settings.on) await run();
    },
    /** Something in the open project changed: send it soon (when ON). */
    changed() {
      if (!settings.on) return;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(() => void run(), deps.debounceMs ?? 1500);
    },
    /** Send everything now (the exit dialog's Save). */
    async syncNow() {
      dirty = true;
      const previous = settings;
      if (!settings.on) {
        // Save from the exit dialog sends once without keeping the switch on.
        settings = { ...settings, on: true };
        try {
          await run();
        } finally {
          settings = previous;
          status = 'off';
          emit();
        }
        return;
      }
      await run();
    },
    sizes: async (): Promise<Record<SyncGroup, GroupSize>> => {
      const result = {} as Record<SyncGroup, GroupSize>;
      for (const group of SYNC_GROUPS)
        result[group] = await deps.measure(group);
      return result;
    },
    /** What the local backend holds (for the panel and the tests). */
    dispose() {
      clearTimeout(timer);
    },
  };
}
export type CloudSync = ReturnType<typeof createCloudSync>;

export const formatBytes = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(0)} KB`
      : bytes < 1073741824
        ? `${(bytes / 1048576).toFixed(1)} MB`
        : `${(bytes / 1073741824).toFixed(2)} GB`;
