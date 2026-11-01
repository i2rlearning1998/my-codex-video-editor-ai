// P2-R1 (P2-03): the local account backend. The same `CloudBackend` interface
// as the Supabase one (./supabase.ts), with every row kept in this browser:
// people (email and a PBKDF2 password hash), the signed-in session, projects,
// media rows and training records in one storage entry; media bytes in
// IndexedDB (memory when it is missing). Nothing leaves the browser. Round 2
// swaps in the Supabase backend without changing any caller.
import {
  CloudConflictError,
  type CloudBackend,
  type CloudMediaRow,
  type CloudProjectSummary,
  type CloudTrainingRecord,
  type CloudUser,
} from './backend';

type KV = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
interface StoredUser {
  id: string;
  email: string;
  salt: string;
  hash: string;
  createdAt: string;
}
interface StoredProject extends CloudProjectSummary {
  ownerId: string;
  document: string;
}
interface Store {
  users: StoredUser[];
  session: string | null;
  projects: StoredProject[];
  media: (CloudMediaRow & { ownerId: string; mimeType: string })[];
  training: (CloudTrainingRecord & { ownerId: string })[];
  /** The local "outbox": reset codes that an email would carry. */
  outbox: { email: string; code: string; at: string }[];
}
export const LOCAL_CLOUD_KEY = 'aive.localCloud';
const empty = (): Store => ({
  users: [],
  session: null,
  projects: [],
  media: [],
  training: [],
  outbox: [],
});

/** Files by key: IndexedDB in a browser, a Map elsewhere. */
export interface BlobStore {
  get(key: string): Promise<Blob | null>;
  set(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
}
export function memoryBlobStore(): BlobStore {
  const map = new Map<string, Blob>();
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, blob) => void map.set(key, blob),
    delete: async (key) => void map.delete(key),
  };
}
export function indexedBlobStore(name = 'aive-local-cloud'): BlobStore {
  if (typeof indexedDB === 'undefined') return memoryBlobStore();
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const run = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const base = await db;
    return new Promise<T>((resolve, reject) => {
      const call = work(base.transaction('files', mode).objectStore('files'));
      call.onsuccess = () => resolve(call.result);
      call.onerror = () => reject(call.error);
    });
  };
  return {
    get: async (key) =>
      ((await run('readonly', (s) => s.get(key))) as Blob | undefined) ?? null,
    set: async (key, blob) =>
      void (await run('readwrite', (s) => s.put(blob, key))),
    delete: async (key) => void (await run('readwrite', (s) => s.delete(key))),
  };
}

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return hex(bits);
}
/** Compares two equal-length hex strings without stopping early. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

export interface LocalAccountOptions {
  readonly storage: KV | null;
  readonly blobs?: BlobStore;
  readonly now?: () => string;
  /** A random id or code (tests pass a fixed one). */
  readonly random?: () => string;
}

export function localAccountBackend(
  options: LocalAccountOptions,
): CloudBackend & {
  /** The local outbox: the newest reset code sent to `email`, if any. */
  lastResetCode(email: string): string | null;
} {
  const now = options.now ?? (() => new Date().toISOString());
  const random =
    options.random ?? (() => hex(crypto.getRandomValues(new Uint8Array(16))));
  const blobs = options.blobs ?? indexedBlobStore();
  let memory: Store | null = null;
  const read = (): Store => {
    try {
      const raw = options.storage?.getItem(LOCAL_CLOUD_KEY);
      if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<Store>) };
    } catch {
      // Unreadable: start again; nothing else is touched.
    }
    return memory ?? empty();
  };
  const write = (store: Store) => {
    memory = store;
    try {
      options.storage?.setItem(LOCAL_CLOUD_KEY, JSON.stringify(store));
    } catch {
      // Storage full or off: the memory copy keeps this page working.
    }
  };
  const listeners = new Set<(user: CloudUser | null) => void>();
  const userOf = (u: StoredUser | undefined): CloudUser | null =>
    u ? { id: u.id, email: u.email } : null;
  const current = (store = read()) =>
    store.users.find((u) => u.id === store.session);
  const announce = () => {
    const user = userOf(current());
    for (const listener of [...listeners]) listener(user);
  };
  const owner = () => {
    const user = current();
    if (!user) throw new Error('Log in first');
    return user.id;
  };
  const normal = (email: string) => email.trim().toLowerCase();
  const summary = (p: StoredProject): CloudProjectSummary => ({
    id: p.id,
    name: p.name,
    schemaVersion: p.schemaVersion,
    revision: p.revision,
    updatedAt: p.updatedAt,
    thumbnail: p.thumbnail,
  });
  const fileKey = (ownerId: string, fingerprint: string) =>
    `${ownerId}/${fingerprint}`;

  return {
    async user() {
      return userOf(current());
    },
    onUserChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signUp(email, password) {
      const address = normal(email);
      if (!EMAIL.test(address)) throw new Error('Enter a valid email address');
      if (password.length < MIN_PASSWORD)
        throw new Error(
          `Use at least ${MIN_PASSWORD} characters for the password`,
        );
      const store = read();
      if (store.users.some((u) => u.email === address))
        throw new Error('An account with this email already exists');
      const salt = random();
      const user: StoredUser = {
        id: `local-${random()}`,
        email: address,
        salt,
        hash: await hashPassword(password, salt),
        createdAt: now(),
      };
      write({ ...store, users: [...store.users, user], session: user.id });
      announce();
      return userOf(user)!;
    },
    async signIn(email, password) {
      const store = read();
      const user = store.users.find((u) => u.email === normal(email));
      // The same answer for an unknown email and a wrong password.
      const hash = await hashPassword(password, user?.salt ?? 'none');
      if (!user || !same(hash, user.hash))
        throw new Error('The email or password is wrong');
      write({ ...store, session: user.id });
      announce();
      return userOf(user)!;
    },
    async signInWithProvider() {
      throw new Error('Google sign-in is not connected in this local mode');
    },
    async signOut() {
      write({ ...read(), session: null });
      announce();
    },
    async requestPasswordReset(email) {
      const store = read();
      const address = normal(email);
      if (!store.users.some((u) => u.email === address)) return;
      const code = String(
        parseInt(random().slice(0, 8), 16) % 1_000_000,
      ).padStart(6, '0');
      write({
        ...store,
        outbox: [
          ...store.outbox.filter((m) => m.email !== address),
          { email: address, code, at: now() },
        ],
      });
    },
    async confirmPasswordReset(email, code, password) {
      const store = read();
      const address = normal(email);
      const mail = store.outbox.find((m) => m.email === address);
      const user = store.users.find((u) => u.email === address);
      if (!mail || !user || mail.code !== code.trim())
        throw new Error('The code is wrong or has expired');
      if (password.length < MIN_PASSWORD)
        throw new Error(
          `Use at least ${MIN_PASSWORD} characters for the password`,
        );
      const salt = random();
      const hash = await hashPassword(password, salt);
      write({
        ...store,
        users: store.users.map((u) =>
          u.id === user.id ? { ...u, salt, hash } : u,
        ),
        outbox: store.outbox.filter((m) => m.email !== address),
        session: user.id,
      });
      announce();
      return userOf(user)!;
    },
    lastResetCode(email) {
      return read().outbox.find((m) => m.email === normal(email))?.code ?? null;
    },
    async listProjects() {
      const id = owner();
      return read()
        .projects.filter((p) => p.ownerId === id)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(summary);
    },
    async loadProject(projectId) {
      const id = owner();
      const p = read().projects.find(
        (x) => x.id === projectId && x.ownerId === id,
      );
      if (!p) throw new Error('This project is not in your cloud');
      return { summary: summary(p), document: p.document };
    },
    async createProject(input) {
      const ownerId = owner();
      const store = read();
      const p: StoredProject = {
        id: `project-${random()}`,
        ownerId,
        name: input.name,
        schemaVersion: input.schemaVersion,
        revision: 1,
        updatedAt: now(),
        thumbnail: input.thumbnail ?? null,
        document: input.document,
      };
      write({ ...store, projects: [...store.projects, p] });
      return summary(p);
    },
    async saveProject(projectId, revision, input) {
      const ownerId = owner();
      const store = read();
      const p = store.projects.find(
        (x) => x.id === projectId && x.ownerId === ownerId,
      );
      if (!p || p.revision !== revision) throw new CloudConflictError();
      const next: StoredProject = {
        ...p,
        name: input.name,
        schemaVersion: input.schemaVersion,
        document: input.document,
        thumbnail: input.thumbnail ?? p.thumbnail,
        revision: p.revision + 1,
        updatedAt: now(),
      };
      write({
        ...store,
        projects: store.projects.map((x) => (x === p ? next : x)),
      });
      return summary(next);
    },
    async renameProject(projectId, name) {
      const ownerId = owner();
      const store = read();
      write({
        ...store,
        projects: store.projects.map((x) =>
          x.id === projectId && x.ownerId === ownerId
            ? { ...x, name, revision: x.revision + 1, updatedAt: now() }
            : x,
        ),
      });
    },
    async deleteProject(projectId) {
      const ownerId = owner();
      const store = read();
      write({
        ...store,
        projects: store.projects.filter(
          (x) => !(x.id === projectId && x.ownerId === ownerId),
        ),
      });
    },
    async hasMedia(fingerprints) {
      const ownerId = owner();
      const have = new Set(
        read()
          .media.filter((m) => m.ownerId === ownerId)
          .map((m) => m.fingerprint),
      );
      return new Set(fingerprints.filter((f) => have.has(f)));
    },
    async uploadMedia(fingerprint, data, info) {
      const ownerId = owner();
      await blobs.set(fileKey(ownerId, fingerprint), data);
      const store = read();
      write({
        ...store,
        media: [
          ...store.media.filter(
            (m) => !(m.ownerId === ownerId && m.fingerprint === fingerprint),
          ),
          {
            ownerId,
            fingerprint,
            name: info.name,
            mimeType: info.mimeType,
            size: info.size,
            createdAt: now(),
          },
        ],
      });
    },
    async downloadMedia(fingerprint) {
      const blob = await blobs.get(fileKey(owner(), fingerprint));
      if (!blob) throw new Error('This file is not in your cloud');
      return blob;
    },
    async listMedia() {
      const ownerId = owner();
      return read()
        .media.filter((m) => m.ownerId === ownerId)
        .map(({ fingerprint, name, size, createdAt }) => ({
          fingerprint,
          name,
          size,
          createdAt,
        }));
    },
    async deleteMedia(fingerprint) {
      const ownerId = owner();
      await blobs.delete(fileKey(ownerId, fingerprint));
      const store = read();
      write({
        ...store,
        media: store.media.filter(
          (m) => !(m.ownerId === ownerId && m.fingerprint === fingerprint),
        ),
      });
    },
    async saveTrainingRecord(record) {
      const ownerId = owner();
      const store = read();
      write({
        ...store,
        training: [
          ...store.training.filter(
            (t) => !(t.ownerId === ownerId && t.projectId === record.projectId),
          ),
          { ...record, ownerId },
        ],
      });
    },
  };
}
