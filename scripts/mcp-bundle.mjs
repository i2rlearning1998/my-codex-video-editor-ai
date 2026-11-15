// ROUND-C2 Part 7: `npm run mcp:bundle` builds dist/claude-bundle/:
// - video-director.zip: the skill (SKILL.md from the TEXTS, T5),
// - setup.zip: the setup skill (T6),
// - video-director-plugin.zip: a Claude plugin (code.claude.com/docs/en/
//   plugins-reference, read 15 Nov 2026): .claude-plugin/plugin.json, the two
//   skills, the rules (T7) as a skill (a CLAUDE.md at a plugin root is not
//   loaded, the docs say) and as RULES.md, and .mcp.json naming the connector.
// "[platform]" is filled from src/brand/brand.ts. The skills are thin: they
// send Claude to start_here, so Admin edits bind without a new upload.
// No dependency: a small store-only zip writer.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const literal = (file) => {
  const src = readFileSync(file, 'utf8');
  const m = /=\s*((['"`])(?:\\.|(?!\2)[^\\])*\2)\s*as const;/s.exec(src);
  if (!m) throw new Error(`No text in ${file}`);
  return new Function(`return ${m[1]};`)();
};
const brand = /name:\s*'([^']+)'/.exec(
  readFileSync('src/brand/brand.ts', 'utf8'),
)[1];
const fill = (t) => t.replaceAll('[platform]', brand);
const slug = brand
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** A zip with stored (uncompressed) files; fixed time, so builds are equal. */
export function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text, 'utf8');
    const n = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(0, 8);
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(0x5b21, 12); // 2025-10-01
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(n.length, 26);
    parts.push(head, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(0x5b21, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

export function bundleFiles(connector = process.env.MCP_PUBLIC_URL) {
  const address = `${(connector ?? 'http://127.0.0.1:4400').replace(/\/$/, '')}/mcp`;
  const director = fill(
    literal('src/platform-config/texts/skill-video-director.ts'),
  );
  const setup = fill(literal('src/platform-config/texts/skill-setup.ts'));
  const rules = fill(literal('src/platform-config/texts/plugin-rules.ts'));
  const rulesSkill = `---\nname: talking-to-people\ndescription: Use whenever you speak to the person while making, editing or exporting a video with the ${brand} connector: what you may and may not say.\n---\n\n# What you may say to people (${brand})\n\n${rules}`;
  const plugin = {
    name: `${slug}-video-director`,
    displayName: `${brand} video director`,
    version: '1.0.0',
    description: `Make, edit and export videos with ${brand} from your own Claude.`,
    author: { name: brand },
    keywords: ['video', 'director'],
  };
  const mcp = { mcpServers: { [slug]: { type: 'http', url: address } } };
  return {
    'video-director.zip': [['video-director/SKILL.md', director]],
    'setup.zip': [['setup/SKILL.md', setup]],
    'video-director-plugin.zip': [
      ['.claude-plugin/plugin.json', `${JSON.stringify(plugin, null, 2)}\n`],
      ['skills/video-director/SKILL.md', director],
      ['skills/setup/SKILL.md', setup],
      ['skills/talking-to-people/SKILL.md', rulesSkill],
      ['RULES.md', rules],
      ['.mcp.json', `${JSON.stringify(mcp, null, 2)}\n`],
    ],
  };
}

if (process.argv[1]?.endsWith('mcp-bundle.mjs')) {
  mkdirSync('dist/claude-bundle', { recursive: true });
  for (const [name, files] of Object.entries(bundleFiles()))
    writeFileSync(`dist/claude-bundle/${name}`, zip(files));
  console.log(
    'dist/claude-bundle: video-director.zip, setup.zip, video-director-plugin.zip',
  );
}
