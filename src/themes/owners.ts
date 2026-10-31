// FX10: a saved theme belongs to the project it was saved in (docs/
// EDITOR-OWNERSHIP.md). The theme record itself stays one schema; which
// project owns it is kept beside it (`aive.themeOwners`, theme id to project
// id). A theme with no owner was saved before projects: it is listed only in
// "Import ... from your Cloud", never in a project's Theme panel.
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const KEY = 'aive.themeOwners';

export function themeOwners(storage: Storage | null) {
  const read = (): Record<string, string> => {
    try {
      const value = JSON.parse(storage?.getItem(KEY) ?? '{}') as unknown;
      return value && typeof value === 'object'
        ? (value as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  };
  const write = (all: Record<string, string>) => {
    try {
      storage?.setItem(KEY, JSON.stringify(all));
    } catch {
      // Browser storage full or off: the theme then reads as "earlier".
    }
  };
  return {
    ownerOf: (id: string): string | undefined => read()[id],
    claim(id: string, projectId: string) {
      write({ ...read(), [id]: projectId });
    },
    forget(id: string) {
      const all = read();
      delete all[id];
      write(all);
    },
    /** The ids this project owns. */
    ownedBy(projectId: string): Set<string> {
      return new Set(
        Object.entries(read())
          .filter(([, owner]) => owner === projectId)
          .map(([id]) => id),
      );
    },
  };
}
