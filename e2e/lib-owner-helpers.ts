// Phase 1 library: starts the owner app and its catalog server for an e2e
// test, in their own folders and ports, with a known owner account.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { base32Encode, totp } from '../owner/server/auth';

export const OWNER = {
  email: 'owner@example.com',
  password: 'correct horse battery',
};
const SECRET_BYTES = Buffer.from('e2e-owner-secret-bytes');
export const TOTP_SECRET = base32Encode(SECRET_BYTES);
export const ownerCode = () => totp(SECRET_BYTES, Date.now());

export interface OwnerStack {
  readonly ownerUrl: string;
  readonly catalogUrl: string;
  readonly root: string;
  readonly env: NodeJS.ProcessEnv;
  stop(): void;
}

export async function startOwnerStack(offset = 0): Promise<OwnerStack> {
  const root = mkdtempSync(path.join(tmpdir(), 'aive-owner-e2e-'));
  const ownerPort = 4301 + offset * 2;
  const catalogPort = 4302 + offset * 2;
  const env = {
    ...process.env,
    LIBRARY_DATA_DIR: path.join(root, 'data'),
    LIBRARY_CATALOG_DIR: path.join(root, 'catalog'),
    // The editor's dev key, so the editor under test trusts this catalog.
    LIBRARY_KEYS_DIR: path.resolve('owner/keys'),
    OWNER_PORT: String(ownerPort),
    CATALOG_PORT: String(catalogPort),
    OWNER_TOTP_SECRET: TOTP_SECRET,
    // A short re-authentication window, so the test sees the dialog.
    OWNER_REAUTH_SECONDS: '1',
  };
  const created = spawnSync(
    process.execPath,
    [
      'owner/run.mjs',
      '/owner/server/main.ts',
      'create-owner',
      '--email',
      OWNER.email,
      '--password',
      OWNER.password,
    ],
    { env, encoding: 'utf8' },
  );
  if (created.status !== 0) throw new Error(created.stderr || created.stdout);
  const child: ChildProcess = spawn(
    process.execPath,
    ['owner/run.mjs', '/owner/server/main.ts', 'serve'],
    {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout!.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr!.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const ownerUrl = `http://127.0.0.1:${ownerPort}/`;
  const catalogUrl = `http://127.0.0.1:${catalogPort}/`;
  const started = Date.now();
  for (;;) {
    if (output.includes('Library manager:')) break;
    if (child.exitCode !== null || Date.now() - started > 60_000)
      throw new Error(`The owner app did not start: ${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return {
    ownerUrl,
    catalogUrl,
    root,
    env,
    stop() {
      child.kill('SIGTERM');
      rmSync(root, { recursive: true, force: true });
    },
  };
}
