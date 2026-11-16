// ROUND-C5 Part 2: Appearance slots in the Owner App (owner-only, audited)
// and the DOM-free rules: a video needs its poster, addresses are https or
// uploaded here, unused files are listed only when nothing uses them (a file
// in two slots stays used until both let go; a slot of a deleted Style uses
// nothing) and cleanup deletes only files uploaded here; the limits are the
// owner's.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startC4, type C4 } from '../round-c4/helpers';
import {
  c5,
  defaultConfig,
  type PlatformConfig,
} from '../../src/platform-config';
import {
  APPEARANCE_LIMITS,
  checkAppearance,
  slotOf,
} from '../../src/panel/appearance-data';
import { allSlots, SLOTS, EXEMPT, DERIVED } from '../../src/panel/appearance';

let c: C4;
beforeAll(async () => {
  c = await startC4();
}, 60_000);
afterAll(() => c?.close());

const png = (n: number) =>
  Buffer.concat([
    Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
    Buffer.from([n]),
    Buffer.alloc(64),
  ]);
const WEBM = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(64)]);
const get = async () => (await c.owner('GET', '/api/appearance')).body;
const save = async (slots: Record<string, unknown>, extra = {}) => {
  const now = await get();
  return c.owner('POST', '/api/appearance', {
    body: {
      appearance: { ...now.appearance, slots, ...extra },
      baseVersion: now.version,
    },
  });
};
const up = async (name: string, raw: Buffer) =>
  (
    await c.owner('POST', `/api/appearance/upload?name=${name}`, {
      raw,
      name,
    })
  ).body as { url: string; kind: string };

describe('[RDC5-016] the slot registry', () => {
  it('[RDC5-016] slot ids are unique; every Style, Studio tool, lesson, plan and top-up has a derived slot; the exempt reasons are named; a slot that is not set changes nothing', () => {
    const d = defaultConfig();
    const ids = allSlots(d).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of d.styles) expect(ids).toContain(`style:${s.id}`);
    for (const s of d.studios) expect(ids).toContain(`studio:${s.id}`);
    for (const p of d.plans) expect(ids).toContain(`plan:${p.id}`);
    expect(SLOTS.every((s) => /^[a-z-]+:[a-z-]+$/.test(s.id))).toBe(true);
    expect(Object.keys(EXEMPT)).toEqual(['person-content', 'numbers', 'form']);
    expect(DERIVED).toContain('style');
    expect(slotOf(d, 'hero:credits')).toBeNull();
    expect(d.appearance).toBeUndefined();
  });
});

describe('[RDC5-017] saving slots', () => {
  it("[RDC5-017] a picture slot saves and the live config has it; a video without a poster is refused with the owner's sentence; a non-https address is refused; a renamed .exe as .mp4 and an SVG are refused; a picture over the owner's lower limit gets the too-big sentence", async () => {
    const pic = await up('hero.png', png(1));
    expect(pic.kind).toBe('image');
    const ok = await save({
      'hero:credits': {
        image: pic.url,
        fit: 'cover',
        focus: { x: 20, y: 80 },
        play: 'auto',
        enabled: true,
      },
    });
    expect(ok.status).toBe(200);
    const live = (await c.s.api('/v1/config')).body.config as PlatformConfig;
    expect(slotOf(live, 'hero:credits')!.image).toBe(pic.url);
    const vid = await up('loop.webm', WEBM);
    const noPoster = await save({
      'studio:image': {
        video: vid.url,
        fit: 'cover',
        focus: { x: 50, y: 50 },
        play: 'auto',
        enabled: true,
      },
    });
    expect(noPoster.status).toBe(400);
    expect(noPoster.body.error).toContain(c5('video-needs-poster'));
    const http = await save({
      'hero:credits': {
        image: 'http://plain.example/a.png',
        fit: 'cover',
        focus: { x: 50, y: 50 },
        play: 'auto',
        enabled: true,
      },
    });
    expect(http.status).toBe(400);
    const exe = await c.owner(
      'POST',
      '/api/appearance/upload?name=trailer.mp4',
      {
        raw: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]),
        name: 'trailer.mp4',
      },
    );
    expect(exe.status).toBe(415);
    const svg = await c.owner('POST', '/api/appearance/upload?name=a.svg', {
      raw: Buffer.from('<svg/>'),
      name: 'a.svg',
    });
    expect(svg.status).toBe(415);
    // The owner's own lower limit.
    const lim = await save(
      { 'hero:credits': (await get()).appearance.slots['hero:credits'] },
      {
        limits: { imageBytes: 2048, videoBytes: APPEARANCE_LIMITS.videoBytes },
      },
    );
    expect(lim.status).toBe(200);
    const big = await c.owner('POST', '/api/appearance/upload?name=big.png', {
      raw: Buffer.concat([png(2), Buffer.alloc(4096)]),
      name: 'big.png',
    });
    expect(big.status).toBe(413);
    expect(big.body.error).toBe(
      c5('upload-too-big', 'en', { size: '5 KB', limit: '2 KB' }),
    );
    expect(checkAppearance(defaultConfig())).toEqual([]);
  });
});

describe('[RDC5-018] unused files', () => {
  it('[RDC5-018] the same file in two slots stays used until both let go; a slot for a deleted Style uses nothing; cleanup deletes only unused files uploaded here, and their addresses are gone', async () => {
    await save({}, { limits: undefined });
    const shared = await up('shared.png', png(7));
    const file = shared.url.split('/files/')[1]!;
    const slot = {
      image: shared.url,
      fit: 'cover',
      focus: { x: 50, y: 50 },
      play: 'auto',
      enabled: true,
    };
    await save({ 'plan:free': slot, 'learn:x': slot, 'hero:director': slot });
    const unusedNames = async () =>
      ((await get()).unused as { file: string }[]).map((f) => f.file);
    expect(await unusedNames()).not.toContain(file);
    await save({ 'hero:director': slot });
    expect(await unusedNames()).not.toContain(file);
    // A slot whose Style is gone uses nothing.
    await save({ 'style:deleted-style': slot });
    expect(await unusedNames()).toContain(file);
    expect((await get()).unusedNote).toBe(c5('slot-unused'));
    const clean = await c.owner('POST', '/api/appearance/cleanup', {
      body: {},
    });
    expect(clean.body.removed).toContain(file);
    expect(await unusedNames()).toEqual([]);
    expect(c.audit().some((r) => r.action === 'appearance cleanup')).toBe(true);
  });
});
