// R3: user folders of the AI and My Templates panels. They belong to this
// browser, not to a project, and are never an undo step. A folder may stay
// empty; deleting one moves its items back to no folder.
export interface LibraryFolder {
  readonly id: string;
  readonly name: string;
}
interface Record {
  folders: LibraryFolder[];
  items: { [itemId: string]: string };
}
const key = (shelf: string) => `aive.folders.${shelf}`;
const listeners = new Set<() => void>();
function read(shelf: string): Record {
  try {
    const value = JSON.parse(
      localStorage.getItem(key(shelf)) ?? 'null',
    ) as Record | null;
    if (value && Array.isArray(value.folders) && value.items) return value;
  } catch {
    // A damaged record starts empty.
  }
  return { folders: [], items: {} };
}
function write(shelf: string, record: Record) {
  localStorage.setItem(key(shelf), JSON.stringify(record));
  for (const listener of [...listeners]) listener();
}

export function shelfFolders(shelf: string) {
  return {
    list(): readonly LibraryFolder[] {
      return read(shelf).folders;
    },
    folderOf(itemId: string): string | null {
      const record = read(shelf);
      const id = record.items[itemId];
      return id && record.folders.some((folder) => folder.id === id)
        ? id
        : null;
    },
    create(name: string): LibraryFolder {
      const record = read(shelf);
      const folder = { id: `folder-${crypto.randomUUID()}`, name: name.trim() };
      record.folders.push(folder);
      write(shelf, record);
      return folder;
    },
    rename(folderId: string, name: string) {
      const record = read(shelf);
      record.folders = record.folders.map((folder) =>
        folder.id === folderId ? { ...folder, name: name.trim() } : folder,
      );
      write(shelf, record);
    },
    remove(folderId: string) {
      const record = read(shelf);
      record.folders = record.folders.filter(
        (folder) => folder.id !== folderId,
      );
      for (const [item, folder] of Object.entries(record.items))
        if (folder === folderId) delete record.items[item];
      write(shelf, record);
    },
    move(itemId: string, folderId: string | null) {
      const record = read(shelf);
      if (folderId) record.items[itemId] = folderId;
      else delete record.items[itemId];
      write(shelf, record);
    },
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
