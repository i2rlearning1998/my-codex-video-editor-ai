// P2-R1 (owner rule 5, no guest mode): the editor opens only for a signed-in
// person. It reads the account store the panel and website sign in to
// (src/cloud/local.ts); it imports nothing, so the editor bundle stays as it
// was. A Supabase session (P2-C) will be read here the same way.
export const ACCOUNT_STORE_KEY = 'aive.localCloud';
type Read = { getItem(key: string): string | null };

/** The signed-in person's id, or null. */
export function signedInUserId(storage: Read | null): string | null {
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
