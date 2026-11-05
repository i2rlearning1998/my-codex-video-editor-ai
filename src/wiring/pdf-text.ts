// P3-WIRING (W4): a small, dependency-free PDF text reader for attachments.
// It reads the text operators (Tj, TJ, ', ") of uncompressed and
// Flate-compressed content streams, with literal and hex strings. It does
// NOT handle custom font encodings (CID / Identity-H, common in non-Latin
// PDFs), encryption or scanned pages: those come back with no text, and the
// attachment is refused with a plain sentence.

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000)
    s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
};

async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([data as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** Decodes a PDF literal string body (without the outer parentheses). */
function literal(s: string): string {
  return s.replace(
    /\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g,
    (_, e: string) =>
      (
        ({
          n: '\n',
          r: '\r',
          t: '\t',
          b: '\b',
          f: '\f',
          '(': '(',
          ')': ')',
          '\\': '\\',
        }) as Record<string, string>
      )[e] ?? (/^[0-7]+$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : ''),
  );
}
const hex = (h: string) => {
  const clean = h.replace(/\s+/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 2)
    out += String.fromCharCode(
      parseInt(clean.slice(i, i + 2).padEnd(2, '0'), 16),
    );
  return out;
};

/** Text shown by one content stream, one line per text block / line move. */
export function streamText(content: string): string {
  const out: string[] = [];
  let line = '';
  const flush = () => {
    if (line.trim()) out.push(line.trim());
    line = '';
  };
  // Strings, arrays of strings, and the operators that move or show text.
  const re =
    /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>|\[|\]|T[Jj*dD]|'|"|ET|BT|-?\d+(?:\.\d+)?/g;
  let pending: string[] = [];
  let inArray = false;
  for (const m of content.matchAll(re)) {
    const t = m[0];
    if (t.startsWith('(')) pending.push(literal(t.slice(1, -1)));
    else if (t.startsWith('<')) pending.push(hex(t.slice(1, -1)));
    else if (t === '[') {
      inArray = true;
      pending = [];
    } else if (t === ']') inArray = false;
    else if (t === 'Tj' || t === 'TJ') {
      line += pending.join('');
      pending = [];
    } else if (t === "'" || t === '"') {
      flush();
      line += pending.join('');
      pending = [];
    } else if (t === 'T*' || t === 'Td' || t === 'TD' || t === 'ET') {
      if (!inArray) flush();
    } else if (/^-?\d/.test(t) && inArray && Number(t) < -200) {
      pending.push(' ');
    }
  }
  flush();
  return out.join('\n');
}

/** All readable text of a PDF (empty when none could be read). */
export async function pdfText(
  bytes: Uint8Array,
  maxChars: number,
): Promise<string> {
  const raw = latin1(bytes);
  if (!raw.startsWith('%PDF-')) return '';
  if (/\/Encrypt\b/.test(raw)) return '';
  const parts: string[] = [];
  const re = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const dict = m[1]!;
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    let body = bytes.subarray(start, end);
    // Drop the end-of-line before "endstream".
    while (body.length && (body.at(-1) === 0x0a || body.at(-1) === 0x0d))
      body = body.subarray(0, -1);
    if (
      /\/Subtype\s*\/Image|\/Type\s*\/XObject|\/Length1|\/FontFile/.test(dict)
    )
      continue;
    let content: Uint8Array | null = body;
    if (/\/FlateDecode/.test(dict)) content = await inflate(body);
    else if (/\/Filter/.test(dict)) content = null; // other filters: not read
    if (!content) continue;
    const text = streamText(latin1(content));
    if (text) parts.push(text);
    if (parts.join('\n').length >= maxChars) break;
    re.lastIndex = end;
  }
  return parts.join('\n').slice(0, maxChars);
}
