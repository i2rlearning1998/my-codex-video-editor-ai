// [P3I-004] The P3 SQL functions, run for real on an isolated PostgreSQL
// (skipped when the server binaries are not installed).
import { expect, it } from 'vitest';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const bin = ['17', '16', '15']
  .map((v) => `/usr/lib/postgresql/${v}/bin`)
  .find((p) => existsSync(p + '/initdb'));
it.skipIf(!bin)(
  '[P3I-004] payment commit, proportional refunds, balance guard, daily cap and admin change behave on PostgreSQL',
  () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'p3-fn-'));
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
    // The server's own user must be able to read the files, wherever the repo is.
    const copies: string[] = [];
    const copy = (file: string) => {
      const target = path.join(
        folder,
        `${copies.length}-${path.basename(file)}`,
      );
      copyFileSync(file, target);
      chmodSync(target, 0o644);
      copies.push(target);
      return target;
    };
    let started = false;
    try {
      run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust']);
      run('pg_ctl', [
        '-D',
        data,
        '-o',
        `-p 54381 -k ${folder} -c listen_addresses=''`,
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
          '54381',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
          '-q',
          '-f',
          copy(file),
        ]);
      apply('supabase/tests/stub-supabase.sql');
      for (const f of readdirSync('supabase/migrations')
        .filter((f) => f.endsWith('.sql'))
        .sort())
        apply('supabase/migrations/' + f);
      expect(() => apply('tests/p3-integration/functions.sql')).not.toThrow();
    } finally {
      if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
      rmSync(folder, { recursive: true, force: true });
    }
  },
  60000,
);
