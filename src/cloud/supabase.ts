// Phase 1: CloudBackend on Supabase (Auth, Postgres with row-level
// security, Storage). The library is loaded on first use, so the editor
// starts as before when the cloud is never opened.
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  CloudConflictError,
  type CloudBackend,
  type CloudConfig,
  type CloudLibraryRow,
  type CloudMediaInfo,
  type CloudMediaRow,
  type CloudProjectInput,
  type CloudProjectSummary,
  type CloudUser,
} from './backend';
import type { LoginGuard } from '../contracts/p3';
import {
  LoginRefusedError,
  MIN_PASSWORD,
  passwordProblem,
  SIGN_IN_FAILED,
} from './login-guard';

const BUCKET = 'media';
const SUMMARY =
  'id, name, schema_version, revision, updated_at, thumbnail' as const;
interface ProjectRow {
  id: string;
  name: string;
  schema_version: number;
  revision: number;
  updated_at: string;
  thumbnail: string | null;
}
const summaryOf = (row: ProjectRow): CloudProjectSummary => ({
  id: row.id,
  name: row.name,
  schemaVersion: row.schema_version,
  revision: row.revision,
  updatedAt: row.updated_at,
  thumbnail: row.thumbnail,
});
const userOf = (user: User | null | undefined): CloudUser | null =>
  user ? { id: user.id, email: user.email ?? null } : null;
/** Supabase answers with `{ error }`; turn it into a thrown Error. */
function check<R extends { error: { message: string } | null }>(
  result: R,
): R extends { data: infer D } ? D : void {
  if (result.error) throw new Error(result.error.message);
  return (result as { data?: unknown }).data as R extends { data: infer D }
    ? D
    : void;
}

/**
 * P3-WIRING (W8): Supabase Auth checks passwords and rate-limits sign-ins on
 * its own server; this guard is an extra, per-browser lock in front of it,
 * and the password rule is checked before Supabase is asked (set the same
 * minimum length in the Supabase project's Auth settings).
 */
export interface SupabaseAuthOptions {
  readonly guard?: LoginGuard;
  readonly ip?: () => string;
  readonly minPassword?: () => number;
}
export function createSupabaseBackend(
  config: CloudConfig,
  auth: SupabaseAuthOptions = {},
): CloudBackend {
  let client: Promise<SupabaseClient> | null = null;
  const supabase = () =>
    (client ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // OAuth (Google now, the Claude connector later) returns here.
          detectSessionInUrl: true,
          flowType: 'pkce',
          storageKey: 'aive.cloud.session',
        },
      }),
    ));
  const userId = async () => {
    const id = userOf((await (await supabase()).auth.getUser()).data.user)?.id;
    if (!id) throw new Error('Log in first');
    return id;
  };
  const path = async (fingerprint: string) => {
    if (!/^[0-9a-f]{32}$/.test(fingerprint))
      throw new Error(`Invalid media fingerprint ${fingerprint}`);
    return `${await userId()}/${fingerprint}`;
  };
  return {
    async user() {
      const { data } = await (await supabase()).auth.getSession();
      return userOf(data.session?.user);
    },
    async accessToken() {
      // getSession refreshes an expired session first (autoRefreshToken).
      const { data } = await (await supabase()).auth.getSession();
      return data.session?.access_token ?? null;
    },
    onUserChange(listener) {
      let stop: (() => void) | null = null;
      let stopped = false;
      void supabase().then((sb) => {
        if (stopped) return;
        const { data } = sb.auth.onAuthStateChange((_event, session) =>
          listener(userOf(session?.user)),
        );
        stop = () => data.subscription.unsubscribe();
      });
      return () => {
        stopped = true;
        stop?.();
      };
    },
    async signUp(email, password) {
      const weak = passwordProblem(
        password,
        auth.minPassword?.() ?? MIN_PASSWORD,
        email,
      );
      if (weak) throw new Error(weak);
      const data = check(
        await (
          await supabase()
        ).auth.signUp({
          email,
          password,
          // The confirmation email brings the person back to the log-in page.
          options: { emailRedirectTo: `${location.origin}/site/#/login` },
        }),
      );
      const user = userOf(data.user);
      if (!user) throw new Error('Sign up failed');
      // With email confirmation on, there is a user but no session yet.
      if (!data.session)
        throw new Error('Check your email to confirm the account, then log in');
      return user;
    },
    async signIn(email, password) {
      const address = email.trim().toLowerCase();
      const ip = auth.ip?.() ?? 'browser';
      if (auth.guard) {
        const r = await auth.guard.beforeAttempt(address, ip);
        if (!r.ok) throw new LoginRefusedError(r.failure);
      }
      const res = await (
        await supabase()
      ).auth.signInWithPassword({ email, password });
      if (res.error) {
        await auth.guard?.afterFailure(address, ip);
        // One sentence for every wrong email or password.
        if (res.error.status === 400 || res.error.status === 401)
          throw new LoginRefusedError(SIGN_IN_FAILED);
        throw new Error(res.error.message);
      }
      const user = userOf(res.data.user);
      if (!user) throw new Error('Log in failed');
      await auth.guard?.afterSuccess(address, ip);
      return user;
    },
    async signInWithProvider(provider) {
      check(
        await (
          await supabase()
        ).auth.signInWithOAuth({
          provider,
          options: { redirectTo: location.href },
        }),
      );
    },
    async requestPasswordReset(email) {
      check(await (await supabase()).auth.resetPasswordForEmail(email));
    },
    async confirmPasswordReset(email, code, password) {
      const sb = await supabase();
      let verified: { user: User | null; session: unknown } | null = null;
      try {
        verified = check(
          await sb.auth.verifyOtp({ email, token: code, type: 'recovery' }),
        ) as { user: User | null; session: unknown };
      } catch {
        verified = null;
      }
      // A wrong or old code: say so before touching the password.
      const user = userOf(verified?.user);
      if (!user || !verified?.session)
        throw new Error('The code is wrong or has expired');
      const weak = passwordProblem(
        password,
        auth.minPassword?.() ?? MIN_PASSWORD,
        email,
      );
      if (weak) throw new Error(weak);
      check(await sb.auth.updateUser({ password }));
      // A changed password ends every other session of this person.
      check(await sb.auth.signOut({ scope: 'others' }));
      return user;
    },
    async signOut() {
      check(await (await supabase()).auth.signOut());
    },
    async listProjects() {
      const rows = check(
        await (
          await supabase()
        )
          .from('projects')
          .select(SUMMARY)
          .order('updated_at', { ascending: false }),
      ) as ProjectRow[];
      return rows.map(summaryOf);
    },
    async loadProject(id) {
      const row = check(
        await (
          await supabase()
        )
          .from('projects')
          .select(`${SUMMARY}, document`)
          .eq('id', id)
          .single(),
      ) as ProjectRow & { document: string };
      return { summary: summaryOf(row), document: row.document };
    },
    async createProject(input: CloudProjectInput) {
      const row = check(
        await (
          await supabase()
        )
          .from('projects')
          .insert({
            name: input.name,
            schema_version: input.schemaVersion,
            document: input.document,
            thumbnail: input.thumbnail ?? null,
          })
          .select(SUMMARY)
          .single(),
      ) as ProjectRow;
      return summaryOf(row);
    },
    async saveProject(id, revision, input) {
      const rows = check(
        await (
          await supabase()
        )
          .from('projects')
          .update({
            name: input.name,
            schema_version: input.schemaVersion,
            document: input.document,
            thumbnail: input.thumbnail ?? null,
          })
          .eq('id', id)
          .eq('revision', revision)
          .select(SUMMARY),
      ) as ProjectRow[];
      // No row matched: the revision moved on (or the project is gone).
      if (!rows.length) throw new CloudConflictError();
      return summaryOf(rows[0]!);
    },
    async renameProject(id, name) {
      check(
        await (await supabase()).from('projects').update({ name }).eq('id', id),
      );
    },
    async deleteProject(id) {
      check(await (await supabase()).from('projects').delete().eq('id', id));
    },
    async hasMedia(fingerprints) {
      if (!fingerprints.length) return new Set();
      const rows = check(
        await (
          await supabase()
        )
          .from('media')
          .select('fingerprint')
          .in('fingerprint', [...fingerprints]),
      ) as { fingerprint: string }[];
      return new Set(rows.map((row) => row.fingerprint));
    },
    async uploadMedia(fingerprint, data, info: CloudMediaInfo) {
      const sb = await supabase();
      check(
        await sb.storage.from(BUCKET).upload(await path(fingerprint), data, {
          contentType: info.mimeType || 'application/octet-stream',
          upsert: true,
        }),
      );
      check(
        await sb.from('media').upsert({
          fingerprint,
          name: info.name.slice(0, 300) || fingerprint,
          mime_type: (info.mimeType || 'application/octet-stream').slice(
            0,
            120,
          ),
          size: info.size,
        }),
      );
    },
    async downloadMedia(fingerprint) {
      return check(
        await (
          await supabase()
        ).storage
          .from(BUCKET)
          .download(await path(fingerprint)),
      ) as Blob;
    },
    async listMedia() {
      const rows = check(
        await (
          await supabase()
        )
          .from('media')
          .select('fingerprint, name, size, created_at')
          .order('created_at', { ascending: false }),
      ) as {
        fingerprint: string;
        name: string;
        size: number;
        created_at: string;
      }[];
      return rows.map((row): CloudMediaRow => ({
        fingerprint: row.fingerprint,
        name: row.name,
        size: Number(row.size),
        createdAt: row.created_at,
      }));
    },
    async deleteMedia(fingerprint) {
      const sb = await supabase();
      check(await sb.storage.from(BUCKET).remove([await path(fingerprint)]));
      check(await sb.from('media').delete().eq('fingerprint', fingerprint));
    },
    async listLibrary() {
      const rows = check(
        await (
          await supabase()
        )
          .from('library_items')
          .select(
            'id, project_id, kind, name, document, thumbnail, bytes, updated_at',
          )
          .order('updated_at', { ascending: false }),
      ) as {
        id: string;
        project_id: string | null;
        kind: 'ai' | 'templates';
        name: string;
        document: string;
        thumbnail: string | null;
        bytes: number;
        updated_at: string;
      }[];
      return rows.map((row): CloudLibraryRow => ({
        id: row.id,
        projectId: row.project_id,
        kind: row.kind,
        name: row.name,
        document: row.document,
        thumbnail: row.thumbnail,
        bytes: Number(row.bytes),
        updatedAt: row.updated_at,
      }));
    },
    async saveLibraryItem(input) {
      check(
        await (await supabase()).from('library_items').upsert(
          {
            id: input.id,
            project_id: input.projectId,
            kind: input.kind,
            name: input.name,
            document: input.document,
            thumbnail: input.thumbnail ?? null,
          },
          { onConflict: 'owner_id,id' },
        ),
      );
    },
    async deleteLibraryItem(id) {
      check(
        await (await supabase()).from('library_items').delete().eq('id', id),
      );
    },
    async usage() {
      const rows = check(await (await supabase()).rpc('my_usage')) as {
        bytes: number;
        projects: number;
        media: number;
        library: number;
      }[];
      const row = rows[0] ?? { bytes: 0, projects: 0, media: 0, library: 0 };
      return {
        bytes: Number(row.bytes),
        projects: Number(row.projects),
        media: Number(row.media),
        library: Number(row.library),
      };
    },
    async saveTrainingRecord(record) {
      check(
        await (await supabase()).from('training_records').upsert(
          {
            project_id: record.projectId,
            brief: record.brief,
            plan: record.plan,
            edits: record.edits,
          },
          { onConflict: 'owner_id,project_id' },
        ),
      );
    },
  };
}
