// Phase 1 library (P1-06): the editor checks the catalog's Ed25519
// signature with WebCrypto before it uses anything in it. A missing or
// wrong signature, or a key it does not know, rejects the catalog (the
// cache stays as it was).
import {
  catalogManifestSchema,
  signedManifestSchema,
  type CatalogManifest,
} from './format';

const bytes = (b64: string) =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export async function sha256(data: BufferSource | string): Promise<string> {
  const input =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', input));
}
export const keyIdOf = async (publicKey: string) =>
  (await sha256(bytes(publicKey))).slice(0, 16);

export class CatalogRejected extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'CatalogRejected';
  }
}

/** Verifies manifest.json's text; returns the manifest or throws. */
export async function verifyManifest(
  text: string,
  publicKey: string,
): Promise<CatalogManifest> {
  if (!publicKey) throw new CatalogRejected('This editor has no catalog key.');
  let wrapper: unknown;
  try {
    wrapper = JSON.parse(text);
  } catch {
    throw new CatalogRejected('The catalog manifest is not JSON.');
  }
  const signed = signedManifestSchema.safeParse(wrapper);
  if (!signed.success)
    throw new CatalogRejected('The catalog manifest has no valid signature.');
  if (signed.data.keyId !== (await keyIdOf(publicKey)))
    throw new CatalogRejected(
      'The catalog is signed with a key this editor does not know.',
    );
  const key = await crypto.subtle.importKey(
    'raw',
    bytes(publicKey),
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    bytes(signed.data.signature),
    new TextEncoder().encode(signed.data.signed),
  );
  if (!ok) throw new CatalogRejected('The catalog signature is wrong.');
  const manifest = catalogManifestSchema.safeParse(
    JSON.parse(signed.data.signed),
  );
  if (!manifest.success)
    throw new CatalogRejected(
      'The signed catalog manifest is not in the expected format.',
    );
  return manifest.data;
}
