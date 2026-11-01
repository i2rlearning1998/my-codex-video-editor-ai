// P2-R1 (owner rule 5, no guest mode): the editor opens only for a signed-in
// person. It reads the account store the panel and website sign in to
// (src/cloud/local.ts); it imports nothing, so the editor bundle stays as it
// was. A Supabase session (P2-C) will be read here the same way.
export const ACCOUNT_STORE_KEY = 'aive.localCloud';
type Read = { getItem(key: string): string | null };

/** The Supabase session the panel and website keep (supabase-js storageKey). */
export const SUPABASE_SESSION_KEY = 'aive.cloud.session';

/** The signed-in person's id, or null (local accounts or a Supabase session). */
export function signedInUserId(storage: Read | null): string | null {
  try {
    const sb = JSON.parse(storage?.getItem(SUPABASE_SESSION_KEY) ?? 'null') as {
      user?: { id?: unknown };
      refresh_token?: unknown;
    } | null;
    if (
      typeof sb?.user?.id === 'string' &&
      typeof sb.refresh_token === 'string'
    )
      return sb.user.id;
  } catch {
    /* not a Supabase session */
  }
  try {
    const store = JSON.parse(storage?.getItem(ACCOUNT_STORE_KEY) ?? 'null') as {
      session?: unknown;
      users?: { id?: unknown }[];
    } | null;
    const id = store?.session;
    return typeof id === 'string' &&
      Array.isArray(store?.users) &&
      store.users.some((user) => user?.id === id)
      ? id
      : null;
  } catch {
    return null;
  }
}
/** Where a logged-out visitor goes: the website's log-in page. */
export const loginUrl = (back: string) =>
  `/site/#/login?next=${encodeURIComponent(back)}`;

/** What the panel asked the editor to do when it opened it. */
export type Handoff =
  | { kind: 'open'; projectId: string }
  | { kind: 'new'; name: string; aspect: string }
  | { kind: 'plan'; id: string };
export function readHandoff(search: string): Handoff | null {
  const q = new URLSearchParams(search);
  const open = q.get('open');
  if (open) return { kind: 'open', projectId: open };
  const plan = q.get('handoff');
  if (plan && /^[a-z0-9-]{1,64}$/i.test(plan))
    return { kind: 'plan', id: plan };
  if (q.has('new'))
    return {
      kind: 'new',
      name: (q.get('new') || 'Untitled').slice(0, 80),
      aspect: q.get('aspect') ?? '16:9',
    };
  return null;
}
export const HANDOFF_KEY = (id: string) => `aive.handoff.${id}`;
export const ASPECT_SIZES: Record<string, [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
};

/**
 * P2-R2 (P2B-13): the local data made before people had accounts (the
 * single autosave slot, projects without an owner) belongs to the first
 * person who signs in on this browser. Returns whether `userId` is that person.
 */
export const LOCAL_OWNER_KEY = 'aive.localOwner';
export function claimLocalData(
  storage: {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
  } | null,
  userId: string,
): boolean {
  try {
    const owner = storage?.getItem(LOCAL_OWNER_KEY);
    if (owner) return owner === userId;
    storage?.setItem(LOCAL_OWNER_KEY, userId);
    return true;
  } catch {
    return true;
  }
}
/** The editor's autosave slot for this person (the first one keeps the old slot). */
export const autosaveKey = (base: string, userId: string, legacy: boolean) =>
  legacy ? base : `${base}:${userId}`;
