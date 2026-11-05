import { expect, it } from 'vitest';
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  chmodSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
it('[P3E-055] migration declares append-only audit, owner-scoped payments and private secrets (static inspection only)', () => {
  const sql = readFileSync(
    'supabase/migrations/20261105000000_p3_engine.sql',
    'utf8',
  );
  expect(sql).toContain('audit_append_only before update or delete');
  expect(sql).toContain('auth.uid()=user_id');
  expect(sql).toContain(
    'alter table public.secrets enable row level security;',
  );
  expect(sql).not.toMatch(/grant.*secrets.*to authenticated/);
  expect(sql).toContain('from public,anon,authenticated');
});
const bin = ['17', '16', '15']
  .map((v) => `/usr/lib/postgresql/${v}/bin`)
  .find((p) => existsSync(p + '/initdb'));
it.skipIf(!bin)(
  '[P3E-056] SQL policies on isolated local PostgreSQL (skipped without PostgreSQL server binaries)',
  () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'p3-sql-'));
    chmodSync(folder, 0o777);
    const data = path.join(folder, 'data');
    const run = (name: string, args: string[]) => {
      const command = path.join(bin!, name);
      return process.getuid?.() === 0
        ? execFileSync('runuser', ['-u', 'postgres', '--', command, ...args], {
            encoding: 'utf8',
          })
        : execFileSync(command, args, { encoding: 'utf8' });
    };
    let started = false;
    try {
      run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust']);
      run('pg_ctl', [
        '-D',
        data,
        '-o',
        `-p 54379 -k ${folder} -c listen_addresses=''`,
        '-l',
        path.join(folder, 'server.log'),
        '-w',
        'start',
      ]);
      started = true;
      const apply = (file: string) =>
        run('psql', [
          '-h',
          folder,
          '-p',
          '54379',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
          '-q',
          '-f',
          path.resolve(file),
        ]);
      apply('supabase/tests/stub-supabase.sql');
      for (const f of readdirSync('supabase/migrations')
        .filter((f) => f.endsWith('.sql'))
        .sort())
        apply('supabase/migrations/' + f);
      apply('tests/p3-engine/policies.sql');
    } finally {
      if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
      rmSync(folder, { recursive: true, force: true });
    }
  },
  30000,
);
