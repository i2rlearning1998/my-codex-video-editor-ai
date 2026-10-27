// Phase 1 library manager: the owner's server commands (run through
// owner/run.mjs).
//   owner:create  --email you@example.com [--password ...]  the one account
//   owner         the library manager (127.0.0.1:4300) and the catalog
//                 server (127.0.0.1:4310) together
// Ports: OWNER_PORT, CATALOG_PORT. Folders: as owner/cli.ts.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dirs } from '../cli';
import { ensureKeys } from '../catalog/keys';
import { openGateBrowser } from '../catalog/browser';
import { seedCatalog } from '../catalog/seed';
import { defaultSeedSources } from '../catalog/sources';
import { startCatalogServer } from '../catalog/serve';
import { Accounts, newTotpSecret } from './auth';
import { AuditLog } from './audit';
import { createOwnerApp, listen } from './app';

const flag = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

export async function main(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  const { dataDir, outDir, keysDir } = dirs();
  if (command === 'create-owner') {
    const email = flag(rest, '--email');
    if (!email) {
      console.log(
        'Usage: npm run owner:create -- --email you@example.com [--replace]   (password: set OWNER_PASSWORD, or one is made)',
      );
      return 2;
    }
    // A password on the command line shows in the process list and the shell
    // history: prefer OWNER_PASSWORD, or let a random one be made and shown.
    const fromFlag = flag(rest, '--password');
    if (fromFlag)
      console.log(
        'Note: --password is visible in the process list. Prefer the OWNER_PASSWORD environment variable, or leave it out for a random one.',
      );
    const password =
      fromFlag ??
      process.env.OWNER_PASSWORD ??
      randomBytes(15).toString('base64url');
    const secret = process.env.OWNER_TOTP_SECRET ?? newTotpSecret();
    const accounts = new Accounts(dataDir);
    accounts.create(email, password, secret, rest.includes('--replace'));
    new AuditLog(dataDir).append({
      actor: 'command line',
      action: 'create-owner',
      target: email,
    });
    console.log(`The owner account ${email} is ready.`);
    if (!fromFlag && !process.env.OWNER_PASSWORD)
      console.log(`Password: ${password}`);
    console.log(`2-step secret (add it to an authenticator app): ${secret}`);
    console.log(
      `Or scan: otpauth://totp/AI-Native%20Library:${encodeURIComponent(email)}?secret=${secret}&issuer=AI-Native%20Library`,
    );
    return 0;
  }
  if (command === 'serve') {
    const ownerPort = Number(process.env.OWNER_PORT ?? 4300);
    const catalogPort = Number(process.env.CATALOG_PORT ?? 4310);
    ensureKeys(keysDir);
    if (!existsSync(path.join(outDir, 'manifest.json'))) {
      const seeded = seedCatalog(defaultSeedSources(), {
        dataDir,
        outDir,
        keys: ensureKeys(keysDir),
      });
      console.log(`Seeded catalog version ${seeded.catalogVersion}.`);
    }
    const catalogUrl = `http://127.0.0.1:${catalogPort}/`;
    const catalog = await startCatalogServer(outDir, catalogPort);
    const { server, accounts } = createOwnerApp({
      dataDir,
      outDir,
      keysDir,
      port: ownerPort,
      catalogUrl,
      openBrowser: openGateBrowser,
      secureCookie: process.env.OWNER_SECURE_COOKIE === '1',
    });
    await listen(server, ownerPort);
    console.log(`Library manager: http://127.0.0.1:${ownerPort}/`);
    console.log(`Catalog (the CDN stand-in, read only): ${catalogUrl}`);
    console.log('Editor: set VITE_LIBRARY_CATALOG_URL to the catalog address.');
    if (!accounts.exists)
      console.log(
        'No owner account yet: npm run owner:create -- --email you@example.com',
      );
    await new Promise<void>((resolve) => {
      const stop = () => {
        server.close();
        catalog.close();
        resolve();
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
    return 0;
  }
  console.log('Commands: serve, create-owner');
  return 2;
}
