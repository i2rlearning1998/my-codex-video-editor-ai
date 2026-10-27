// Phase 1 library (P1-14): reads a .zip upload with node:zlib (stored and
// deflated entries; no new dependency). Folders and macOS metadata files
// are skipped; paths are kept to their file name.
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}
const MAX_ENTRIES = 2000;
const MAX_TOTAL = 1024 * 1024 * 1024;

export function readZip(data: Uint8Array): ZipEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65_557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('This is not a zip file.');
  const count = view.getUint16(end + 10, true);
  if (count > MAX_ENTRIES)
    throw new Error(`The zip has more than ${MAX_ENTRIES} files.`);
  let at = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50)
      throw new Error('The zip is damaged.');
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(
      data.subarray(at + 46, at + 46 + nameLength),
    );
    at += 46 + nameLength + extra + comment;
    if (
      name.endsWith('/') ||
      name.startsWith('__MACOSX/') ||
      /(^|\/)\./.test(name)
    )
      continue;
    total += size;
    if (total > MAX_TOTAL)
      throw new Error('The zip unpacks to more than 1 GB.');
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    const raw = data.subarray(start, start + compressed);
    let bytes: Uint8Array;
    if (method === 0) bytes = raw;
    else if (method === 8) bytes = inflateRawSync(raw);
    else
      throw new Error(`${name} uses a zip compression that is not supported.`);
    if (bytes.length !== size)
      throw new Error(`${name} in the zip is damaged.`);
    entries.push({
      name: name.split('/').pop()!,
      bytes: new Uint8Array(bytes),
    });
  }
  return entries;
}

/** Writes a stored (uncompressed) zip; used by the tests and fixtures. */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.bytes);
    const head = new Uint8Array(30 + name.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, entry.bytes.length, true);
    h.setUint32(22, entry.bytes.length, true);
    h.setUint16(26, name.length, true);
    head.set(name, 30);
    const dir = new Uint8Array(46 + name.length);
    const d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, entry.bytes.length, true);
    d.setUint32(24, entry.bytes.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    dir.set(name, 46);
    parts.push(head, entry.bytes);
    central.push(dir);
    offset += head.length + entry.bytes.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22);
  let at = 0;
  for (const part of [...parts, ...central, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
