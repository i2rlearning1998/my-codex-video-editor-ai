// I1.7 / I2: media folders are a library convenience kept in this browser
// with the media metadata, never in the project and never on the Undo stack.
// One record per project: the folders, and which folder each asset is in.

export interface MediaFolder {
  readonly id: string;
  readonly name: string;
}
interface Record {
  folders: MediaFolder[];
  items: { [assetId: string]: string };
}

const PREFIX = 'aive.mediaFolders.';

function read(projectId: string): Record {
  try {
    const raw = localStorage.getItem(PREFIX + projectId);
    const value = raw ? (JSON.parse(raw) as Partial<Record>) : null;
    const folders = Array.isArray(value?.folders)
      ? value.folders.filter(
          (folder): folder is MediaFolder =>
            typeof folder?.id === 'string' && typeof folder.name === 'string',
        )
      : [];
    const items: Record['items'] = {};
    if (value?.items && typeof value.items === 'object')
      for (const [assetId, folderId] of Object.entries(value.items))
        if (
          typeof folderId === 'string' &&
          folders.some((folder) => folder.id === folderId)
        )
          items[assetId] = folderId;
    return { folders, items };
  } catch {
    return { folders: [], items: {} };
  }
}
function write(projectId: string, record: Record) {
  try {
    localStorage.setItem(PREFIX + projectId, JSON.stringify(record));
  } catch {
    // Folders are a convenience; a full or blocked storage keeps them for
    // this page only.
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((listener) => listener());

export const mediaFolders = {
  list(projectId: string): readonly MediaFolder[] {
    return read(projectId).folders;
  },
  folderOf(projectId: string, assetId: string): string | null {
    return read(projectId).items[assetId] ?? null;
  },
  create(projectId: string, name: string): MediaFolder {
    const record = read(projectId);
    const folder = { id: `folder-${crypto.randomUUID()}`, name: name.trim() };
    record.folders.push(folder);
    write(projectId, record);
    notify();
    return folder;
  },
  rename(projectId: string, folderId: string, name: string) {
    const record = read(projectId);
    record.folders = record.folders.map((folder) =>
      folder.id === folderId ? { ...folder, name: name.trim() } : folder,
    );
    write(projectId, record);
    notify();
  },
  /** Deletes the folder; its media stay, outside any folder. */
  remove(projectId: string, folderId: string) {
    const record = read(projectId);
    record.folders = record.folders.filter((folder) => folder.id !== folderId);
    for (const [assetId, id] of Object.entries(record.items))
      if (id === folderId) delete record.items[assetId];
    write(projectId, record);
    notify();
  },
  /** Moves an asset into a folder, or out of every folder with null. */
  move(projectId: string, assetId: string, folderId: string | null) {
    const record = read(projectId);
    if (folderId) record.items[assetId] = folderId;
    else delete record.items[assetId];
    write(projectId, record);
    notify();
  },
  onChange(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
