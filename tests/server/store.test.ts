// P2-R2 (P2B-03): the Store contract, run on every implementation. The
// Supabase one needs a real project (SUPABASE_TEST_URL and
// SUPABASE_TEST_SERVICE_ROLE_KEY) and is otherwise skipped with the reason.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/platform-config';
import {
  DuplicateKeyError,
  fileStore,
  memoryStore,
  type Store,
} from '../../server/store';
import { supabaseStore } from '../../server/supabase-store';

const dir = mkdtempSync(path.join(tmpdir(), 'aive-store-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const U = '11111111-1111-1111-1111-111111111111';
const V = '22222222-2222-2222-2222-222222222222';
const row = (id: string, key: string, delta: number) => ({
  id,
  at: '2026-11-01T10:00:00.000Z',
  type: 'grant' as const,
  delta,
  key,
  note: '',
});

function contract(name: string, make: () => Store, skip?: string) {
  describe.skipIf(!!skip)(
    `Store contract: ${name}${skip ? ` (skipped: ${skip})` : ''}`,
    () => {
      it(`[P3E-052] ${name}: secrets, suspension, flags, daily caps, operations and append-only audit`, async () => {
        const s = make();
        const id = '33333333-3333-3333-3333-333333333333';
        await s.saveProfile({
          id,
          email: 'p3@example.test',
          plan: 'free',
          locale: 'en',
          brandKit: {},
          createdAt: '2026-11-05T00:00:00.000Z',
        });
        expect((await s.profile(id))?.suspended ?? false).toBe(false);
        const secret = {
          ciphertext: 'opaque',
          iv: 'opaque',
          tag: 'opaque',
          last4: 'abcd',
          updatedAt: '2026-11-05T00:00:00.000Z',
        };
        await s.putSecret('TEST', secret);
        expect(await s.getSecret('TEST')).toEqual(secret);
        expect((await s.listSecrets()).TEST).toEqual(secret);
        await s.deleteSecret('TEST');
        expect(await s.getSecret('TEST')).toBeNull();
        const counts = await Promise.all(
          Array.from({ length: 10 }, () =>
            s.bumpDaily(id, 'chat', '2026-11-05', 2),
          ),
        );
        expect(counts.filter((n) => n > 0)).toHaveLength(2);
        expect(await s.dailyCount(id, 'chat', '2026-11-05')).toBe(2);
        const change = {
          key: 'admin-test',
          userId: id,
          suspended: true,
          flag: { name: 'beta', on: true },
          audit: {
            at: '2026-11-05T00:00:00.000Z',
            actor: 'admin',
            action: 'test',
            target: id,
            detail: { reason: 'test' },
          },
        };
        expect(await s.commitAdmin(change)).toBe(true);
        expect(await s.commitAdmin(change)).toBe(false);
        expect((await s.profile(id))?.suspended).toBe(true);
        expect(await s.flags(id)).toEqual(['beta']);
        const rows = await s.audit();
        expect(rows).toHaveLength(1);
        Object.assign(rows[0]!.detail, { changed: true });
        expect((await s.audit())[0]!.detail['changed']).toBeUndefined();
        await s.appendAudit({ ...change.audit, action: 'second' });
        expect((await s.audit())[1]!.seq).toBe(2);
      });
      it(`[P2R2-003] ${name}: profiles, ledger with unique keys, usage, exports, counters, config versions`, async () => {
        const s = make();
        expect(await s.profile(U)).toBeNull();
        await s.saveProfile({
          id: U,
          email: 'a@b.co',
          plan: 'free',
          locale: 'hi',
          brandKit: {},
          createdAt: '2026-11-01T00:00:00.000Z',
        });
        expect((await s.profile(U))?.locale).toBe('hi');
        await s.appendLedger(U, [row('g1', 'k1', 60), row('g2', 'k2', 10)]);
        await expect(
          s.appendLedger(U, [row('g3', 'k3', 1), row('g4', 'k1', 1)]),
        ).rejects.toBeInstanceOf(DuplicateKeyError);
        expect((await s.ledger(U)).map((r) => r.key)).toEqual(['k1', 'k2']);
        await s.appendLedger(V, [row('h1', 'k1', 5)]); // keys are per person
        expect((await s.ledger(V)).length).toBe(1);
        await s.appendUsage({
          id: 'u1',
          at: '2026-11-01T10:00:00.000Z',
          userId: U,
          modelId: 'm',
          role: 'write',
          credits: 3,
          ms: 10,
          outcome: 'ok',
        });
        expect((await s.usage(U, '2026-11-01T00:00:00.000Z')).length).toBe(1);
        expect((await s.usage(U, '2026-11-02T00:00:00.000Z')).length).toBe(0);
        expect(await s.addExport(U, '2026-11', 'video')).toBe(1);
        expect(await s.addExport(U, '2026-11', 'png')).toBe(2);
        expect(await s.exportsCount(U, '2026-12')).toBe(0);
        await s.setCounter(U, 'projects', 3);
        expect(await s.counter(U, 'projects')).toBe(3);
        expect(await s.counter(V, 'projects')).toBe(0);
        expect(await s.liveConfigVersion()).toBe(0);
        await s.saveConfigVersion({
          version: 1,
          savedAt: 'x',
          note: 'n',
          config: defaultConfig(),
        });
        await expect(
          s.saveConfigVersion({
            version: 1,
            savedAt: 'x',
            note: 'n',
            config: defaultConfig(),
          }),
        ).rejects.toBeInstanceOf(DuplicateKeyError);
        await s.setLiveConfig(1);
        expect(await s.liveConfigVersion()).toBe(1);
        expect((await s.configVersions())[0]!.config.brand.name).toBe(
          defaultConfig().brand.name,
        );
      });
    },
  );
}
contract('memory', memoryStore);
const file = path.join(dir, 'store.json');
let made = 0;
contract('file', () =>
  fileStore(made++ === 0 ? path.join(dir, 'p3.json') : file),
);
it('[P2R2-003] the file store keeps its data across a restart', async () => {
  const again = fileStore(file);
  expect((await again.ledger(U)).length).toBe(2);
});
const env = process.env;
contract(
  'supabase',
  () =>
    supabaseStore(env.SUPABASE_TEST_URL!, env.SUPABASE_TEST_SERVICE_ROLE_KEY!),
  env.SUPABASE_TEST_URL && env.SUPABASE_TEST_SERVICE_ROLE_KEY
    ? undefined
    : 'no SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY: needs a live Supabase project',
);
