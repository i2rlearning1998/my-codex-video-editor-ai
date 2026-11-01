// P2-R1 (P2-03): the local account backend has the CloudBackend interface
// and the same owner rule as the Supabase tables.
import { describe, expect, it } from 'vitest';
import { CloudConflictError } from '../../src/cloud/backend';
import { localAccountBackend, memoryBlobStore } from '../../src/cloud/local';

const storage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};
let n = 0;
const make = (kv = storage()) =>
  localAccountBackend({
    storage: kv,
    blobs: memoryBlobStore(),
    random: () => (++n).toString(16).padStart(8, '0'),
    now: () => `2026-11-01T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
  });

describe('local account backend', () => {
  it('[P2R1-003] signs up, logs in and out, refuses wrong details with one sentence, and resets a password with the emailed code', async () => {
    const kv = storage();
    const cloud = make(kv);
    const seen: (string | null)[] = [];
    cloud.onUserChange((u) => seen.push(u?.email ?? null));
    await expect(cloud.signUp('bad', 'long enough')).rejects.toThrow(
      'valid email',
    );
    await expect(cloud.signUp('a@b.co', 'short')).rejects.toThrow('at least 8');
    const user = await cloud.signUp('Asha@Example.com', 'correct horse');
    expect(user.email).toBe('asha@example.com');
    await expect(
      cloud.signUp('asha@example.com', 'another one'),
    ).rejects.toThrow('already exists');
    await cloud.signOut();
    expect(await cloud.user()).toBeNull();
    await expect(
      cloud.signIn('asha@example.com', 'wrong pass'),
    ).rejects.toThrow('The email or password is wrong');
    await expect(
      cloud.signIn('nobody@example.com', 'wrong pass'),
    ).rejects.toThrow('The email or password is wrong');
    await cloud.signIn('asha@example.com', 'correct horse');
    expect((await cloud.user())?.id).toBe(user.id);
    // A second page (same browser) sees the same session.
    expect((await make(kv).user())?.id).toBe(user.id);
    // Reset: a code goes to the outbox; a wrong code is refused.
    await cloud.signOut();
    await cloud.requestPasswordReset('nobody@example.com'); // says nothing
    await cloud.requestPasswordReset('asha@example.com');
    const code = cloud.lastResetCode('asha@example.com')!;
    expect(code).toMatch(/^\d{6}$/);
    await expect(
      cloud.confirmPasswordReset('asha@example.com', '000000x', 'new password'),
    ).rejects.toThrow('wrong or has expired');
    await cloud.confirmPasswordReset('asha@example.com', code, 'new password');
    await cloud.signOut();
    await expect(
      cloud.signIn('asha@example.com', 'correct horse'),
    ).rejects.toThrow();
    await cloud.signIn('asha@example.com', 'new password');
    expect(seen).toContain('asha@example.com');
    expect(seen).toContain(null);
  });

  it('[P2R1-003] projects and media belong to their owner; a stale save is a conflict', async () => {
    const kv = storage();
    const cloud = make(kv);
    await cloud.signUp('ravi@example.com', 'password one');
    const p = await cloud.createProject({
      name: 'Lesson',
      schemaVersion: 9,
      document: '{}',
    });
    const saved = await cloud.saveProject(p.id, 1, {
      name: 'Lesson',
      schemaVersion: 9,
      document: '{"v":2}',
    });
    expect(saved.revision).toBe(2);
    await expect(
      cloud.saveProject(p.id, 1, {
        name: 'x',
        schemaVersion: 9,
        document: '{}',
      }),
    ).rejects.toBeInstanceOf(CloudConflictError);
    await cloud.uploadMedia('a'.repeat(32), new Blob(['bytes']), {
      name: 'a.png',
      mimeType: 'image/png',
      size: 5,
    });
    expect([
      ...(await cloud.hasMedia(['a'.repeat(32), 'b'.repeat(32)])),
    ]).toEqual(['a'.repeat(32)]);
    expect(await (await cloud.downloadMedia('a'.repeat(32))).text()).toBe(
      'bytes',
    );
    await cloud.saveTrainingRecord({
      projectId: p.id,
      brief: 'b',
      plan: {},
      edits: [],
    });
    // Another person sees none of it.
    await cloud.signOut();
    await cloud.signUp('asha@example.com', 'password two');
    expect(await cloud.listProjects()).toEqual([]);
    expect(await cloud.listMedia()).toEqual([]);
    await expect(cloud.loadProject(p.id)).rejects.toThrow('not in your cloud');
    await cloud.signOut();
    await expect(cloud.listProjects()).rejects.toThrow('Log in first');
  });
});
