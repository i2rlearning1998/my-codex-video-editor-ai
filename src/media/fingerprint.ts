const SAMPLE = 1024 * 1024;

/**
 * Content fingerprint (D-052): SHA-256 of the byte size and three 1 MiB samples
 * (start, middle, end), as 32 hex characters. The file name and MIME type are not
 * part of it, so the same bytes always get the same fingerprint. Only those samples are read,
 * so multi-GB files are never loaded whole into memory.
 */
export async function mediaFingerprint(blob: Blob): Promise<string> {
  const middle = Math.max(0, Math.floor(blob.size / 2 - SAMPLE / 2));
  const parts: BlobPart[] = [
    `${blob.size}|`,
    blob.slice(0, SAMPLE),
    blob.slice(middle, middle + SAMPLE),
    blob.slice(Math.max(0, blob.size - SAMPLE)),
  ];
  const bytes = await new Blob(parts).arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest.slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
