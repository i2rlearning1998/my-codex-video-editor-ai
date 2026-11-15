// ROUND-C2 Part 7 (RDC2-050): the Claude skill and plugin bundle.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundleFiles, zip } from '../../scripts/mcp-bundle.mjs';
import { readZip } from '../../owner/catalog/zip';
import { startC2 } from './helpers';

const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('[RDC2-050] skill and plugin bundle', () => {
  it('[RDC2-050] the zips hold the TEXTS skills with the platform name, a plugin manifest, the rules and the connector address; the server serves them for Door 4', async () => {
    const files = bundleFiles('https://videos.example.test');
    const skill = readZip(zip(files['video-director.zip']!));
    // The reader drops the one shared top folder (video-director/).
    expect(skill.map((e) => e.name)).toEqual(['SKILL.md']);
    const md = text(skill[0]!.bytes);
    expect(md).toMatch(
      /^---\nname: video-director\ndescription: Use only when the user asks to make, edit, improve or export a video with the AI-Native connector/,
    );
    expect(md).toContain('1. Call `start_here` first.');
    expect(md).not.toContain('[platform]');
    // The zip opens; the file contents are read from what it was made of.
    expect(
      readZip(zip(files['video-director-plugin.zip']!)).length,
    ).toBeGreaterThan(0);
    const byName = Object.fromEntries(files['video-director-plugin.zip']!);
    expect(Object.keys(byName)).toEqual([
      '.claude-plugin/plugin.json',
      'skills/video-director/SKILL.md',
      'skills/setup/SKILL.md',
      'skills/talking-to-people/SKILL.md',
      'RULES.md',
      '.mcp.json',
    ]);
    const manifest = JSON.parse(byName['.claude-plugin/plugin.json']!);
    expect(manifest.name).toBe('ai-native-video-director');
    expect(manifest.name).not.toMatch(/^(claude|anthropic)/);
    expect(manifest).toMatchObject({
      version: '1.0.0',
      author: { name: 'AI-Native' },
    });
    expect(JSON.parse(byName['.mcp.json']!)).toEqual({
      mcpServers: {
        'ai-native': { type: 'http', url: 'https://videos.example.test/mcp' },
      },
    });
    expect(byName['RULES.md']).toMatch(
      /If you cannot do something, say it plainly and offer the nearest thing you can do\.\n$/,
    );
    expect(byName['skills/talking-to-people/SKILL.md']).toMatch(
      /^---\nname: talking-to-people\n/,
    );
    expect(byName['skills/setup/SKILL.md']).toMatch(/^---\nname: setup\n/);
    // Door 4 downloads them from the server.
    const dir = mkdtempSync(path.join(tmpdir(), 'bundle-'));
    writeFileSync(path.join(dir, 'setup.zip'), zip(files['setup.zip']!));
    const s = await startC2({ MCP_BUNDLE_DIR: dir });
    const r = await fetch(`${s.url}/mcp/bundle/setup.zip`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/zip');
    expect(readZip(new Uint8Array(await r.arrayBuffer()))[0]!.name).toBe(
      'SKILL.md',
    );
    expect((await fetch(`${s.url}/mcp/bundle/missing.zip`)).status).toBe(404);
    await s.close();
  });
});
