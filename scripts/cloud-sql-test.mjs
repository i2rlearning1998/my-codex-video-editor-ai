// Phase 1: runs supabase/tests/policies.sql.
// - With SUPABASE_DB_URL (for example the local `supabase start` database,
//   postgresql://postgres:postgres@127.0.0.1:54322/postgres), the tests run
//   there; the migrations are already applied by the Supabase CLI.
// - Without it, a throwaway PostgreSQL cluster is made in a temporary folder,
//   given the stand-in Supabase schemas (supabase/tests/stub-supabase.sql) and
//   every migration, then the tests run and the cluster is removed.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
);
const tests = path.join(root, 'supabase/tests/policies.sql');
const run = (command, args, options = {}) => {
  if (process.env.DEBUG_SQL_TEST) console.error('>', command, args.join(' '));
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
  return result.stdout;
};
const psqlFile = (url, file, env = {}) =>
  run('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', '-f', file], {
    env: { ...process.env, ...env },
  });

if (process.env.SUPABASE_DB_URL) {
  process.stdout.write(psqlFile(process.env.SUPABASE_DB_URL, tests));
  process.exit(0);
}

const bin = [
  '/usr/lib/postgresql/17/bin',
  '/usr/lib/postgresql/16/bin',
  '/usr/lib/postgresql/15/bin',
].find((dir) => existsSync(path.join(dir, 'initdb')));
if (!bin) {
  console.error(
    'No PostgreSQL server found. Start Supabase (npm run cloud:start) and set SUPABASE_DB_URL, or install PostgreSQL 15 or newer.',
  );
  process.exit(1);
}
const folder = mkdtempSync(path.join(tmpdir(), 'aive-pg-'));
chmodSync(folder, 0o777);
const data = path.join(folder, 'data');
// initdb refuses to run as root; use the postgres account when we are root.
const asRoot = process.getuid?.() === 0;
const as = (command, args) =>
  asRoot
    ? run('runuser', ['-u', 'postgres', '--', command, ...args])
    : run(command, args);
const port = String(54300 + Math.floor(Math.random() * 90));
try {
  as(path.join(bin, 'initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust']);
  as(path.join(bin, 'pg_ctl'), [
    '-D',
    data,
    '-o',
    `-p ${port} -k ${folder} -c listen_addresses=''`,
    // A log file: the server must not hold our stdout open.
    '-l',
    path.join(folder, 'server.log'),
    '-w',
    'start',
  ]);
  const url = `postgresql://postgres@/postgres?host=${folder}&port=${port}`;
  psqlFile(url, path.join(root, 'supabase/tests/stub-supabase.sql'));
  const migrations =
    process.env.MIGRATIONS_DIR ?? path.join(root, 'supabase/migrations');
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    psqlFile(url, path.join(migrations, file));
  process.stdout.write(psqlFile(url, tests));
} finally {
  try {
    as(path.join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']);
  } catch {
    // Already stopped.
  }
  rmSync(folder, { recursive: true, force: true });
}
