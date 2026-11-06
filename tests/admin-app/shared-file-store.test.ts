// P4 Part 3: in local mode the gateway server and the Owner App's admin API
// share one data file. A change made by one is seen by the other at once, and
// neither one writes the other's changes away.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fileStore } from '../../server/store';

const root = mkdtempSync(path.join(tmpdir(), 'aive-shared-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('[P4A-006] one data file, two processes', () => {
  it("[P4A-006] sees the other process's change and keeps its own", async () => {
    const file = path.join(root, 'store.json');
    const gateway = fileStore(file);
    const admin = fileStore(file);
    await gateway.saveProfile({
      id: 'u1',
      email: 'u1@example.com',
      plan: 'free',
      createdAt: '2026-11-07T00:00:00.000Z',
      lastSeenAt: null,
      suspended: false,
    } as never);
    // The admin side opens later and reads the person.
    expect((await admin.profile('u1'))?.email).toBe('u1@example.com');
    // The admin side suspends the person; the gateway side must see it.
    await admin.saveProfile({
      ...(await admin.profile('u1'))!,
      suspended: true,
    });
    expect((await gateway.profile('u1'))?.suspended).toBe(true);
    // The gateway side writes next: it must not undo the admin's change.
    await gateway.setCounter('u1', 'voiceClones' as never, 2);
    expect((await admin.profile('u1'))?.suspended).toBe(true);
    expect(await admin.counter('u1', 'voiceClones' as never)).toBe(2);
  });
});
