// Phase 1 library (P1-06): the catalog signing key. Ed25519 with
// node:crypto; the private key is written only to the git-ignored
// `owner/keys/` folder, the public key (32 raw bytes, base64) is what the
// editor build carries as a constant.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_KEYS_DIR = path.resolve('owner/keys');
const PRIVATE = 'catalog-private.pem';
const PUBLIC = 'catalog-public.txt';

export interface CatalogKeys {
  readonly privateKey: KeyObject;
  /** The raw 32-byte public key, base64. */
  readonly publicKey: string;
  readonly keyId: string;
}

export const sha256Hex = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');
/** The first 16 hex characters of the public key's SHA-256. */
export const keyIdOf = (publicKey: string) =>
  sha256Hex(Buffer.from(publicKey, 'base64')).slice(0, 16);

const rawPublic = (key: KeyObject) =>
  key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');

/** Writes a new keypair; refuses to overwrite one unless `force`. */
export function generateKeys(
  dir = DEFAULT_KEYS_DIR,
  force = false,
): CatalogKeys {
  if (!force && existsSync(path.join(dir, PRIVATE)))
    throw new Error(`A catalog key already exists in ${dir}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(
    path.join(dir, PRIVATE),
    privateKey.export({ format: 'pem', type: 'pkcs8' }),
    { mode: 0o600 },
  );
  const raw = rawPublic(publicKey);
  writeFileSync(path.join(dir, PUBLIC), `${raw}\n`);
  return { privateKey, publicKey: raw, keyId: keyIdOf(raw) };
}

export function loadKeys(dir = DEFAULT_KEYS_DIR): CatalogKeys {
  const file = path.join(dir, PRIVATE);
  if (!existsSync(file))
    throw new Error(`No catalog key in ${dir}. Run: npm run library:keys`);
  const privateKey = createPrivateKey(readFileSync(file));
  const raw = rawPublic(createPublicKey(privateKey));
  return { privateKey, publicKey: raw, keyId: keyIdOf(raw) };
}

/** Loads the keypair, making one first when the folder has none. */
export function ensureKeys(dir = DEFAULT_KEYS_DIR): CatalogKeys {
  return existsSync(path.join(dir, PRIVATE))
    ? loadKeys(dir)
    : generateKeys(dir);
}

/** The public key only (what the editor build needs). */
export function readPublicKey(dir = DEFAULT_KEYS_DIR): string | null {
  const file = path.join(dir, PUBLIC);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
}

export const signBytes = (keys: CatalogKeys, data: string) =>
  sign(null, Buffer.from(data, 'utf8'), keys.privateKey).toString('base64');

/** Node-side verification (tests and the catalog server's self-check). */
export function verifyBytes(
  publicKey: string,
  data: string,
  signature: string,
): boolean {
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  const key = createPublicKey({
    key: Buffer.concat([spkiPrefix, Buffer.from(publicKey, 'base64')]),
    format: 'der',
    type: 'spki',
  });
  return verify(
    null,
    Buffer.from(data, 'utf8'),
    key,
    Buffer.from(signature, 'base64'),
  );
}
