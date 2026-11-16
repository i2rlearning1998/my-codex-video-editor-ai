// ROUND-C5 Part 6: rough use not covered by the other C5 tests. A video
// over the owner's limit is refused with both sizes; a PNG whose metadata
// holds a script is stored as a picture (it is never served or drawn as a
// page: its address ends in .png and it is only ever an <img>/poster).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startC4, type C4 } from '../round-c4/helpers';
import { c5 } from '../../src/platform-config';

let c: C4;
beforeAll(async () => {
  c = await startC4();
}, 60_000);
afterAll(() => c?.close());

describe('[RDC5-030] rough use of uploads', () => {
  it('[RDC5-030] a video over the limit gets the too-big sentence with both sizes; a PNG with a script in a text chunk is stored as .png only', async () => {
    const now = (await c.owner('GET', '/api/appearance')).body;
    await c.owner('POST', '/api/appearance', {
      body: {
        appearance: {
          slots: {},
          limits: { imageBytes: 2 * 1024 * 1024, videoBytes: 4096 },
        },
        baseVersion: now.version,
      },
    });
    const webm = Buffer.concat([
      Buffer.from('1a45dfa3', 'hex'),
      Buffer.alloc(10 * 1024),
    ]);
    const big = await c.owner('POST', '/api/appearance/upload?name=clip.webm', {
      raw: webm,
      name: 'clip.webm',
    });
    expect(big.status).toBe(413);
    expect(big.body.error).toBe(
      c5('upload-too-big', 'en', { size: '11 KB', limit: '4 KB' }),
    );
    const text = Buffer.from(
      'tEXtComment\u0000<script>alert(1)</script>',
      'latin1',
    );
    const png = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      text,
      Buffer.alloc(32),
    ]);
    const ok = await c.owner('POST', '/api/appearance/upload?name=pic.png', {
      raw: png,
      name: 'pic.png',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.kind).toBe('image');
    expect(ok.body.url).toMatch(/\.png$/);
  });
});
