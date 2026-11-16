// ROUND-C3 Part 2 (RDC3-020 to RDC3-024): the assets step for Claude.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startC2, type C2 } from '../round-c2/helpers';
import { approved, newVideo, person, plan } from './helpers';

let s: C2;
beforeAll(async () => {
  s = await startC2();
});
afterAll(() => s.close());

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const mediaPlan = () => {
  const p = plan('Deltas');
  p.scenes[0]!.layers.push({
    id: 'delta',
    kind: 'media',
    mediaIntent: { query: 'river delta', type: 'photo' },
  } as never);
  return p;
};
async function ready(name: string) {
  const { client, token } = await person(s, name);
  const { videoId } = await newVideo(s, client);
  await approved(s, client, videoId, mediaPlan());
  return { client, token, videoId };
}
const credits = async (token: string) =>
  (await s.api('/v1/balance', { token })).body.balance as number;

describe('[RDC3-020] the files the video needs', () => {
  it('[RDC3-020] get_asset_needs lists each file by its exact name, kind and use, the voice-over, which files fill it, and every way: give it, a Studio (fields and cost), a prompt, the library, later, or Claude and other tools', async () => {
    const { client, videoId } = await ready('c3-needs');
    const r = await s.call(client, 'get_asset_needs', { video_id: videoId });
    expect(r.text).toMatch(/^2 files for this video:/);
    expect(r.text).toContain(
      '"river delta" (image), for scene 1 "Opening": river delta.',
    );
    expect(r.text).toContain('"narration" (audio, voice-over)');
    expect(r.text).toContain('Not filled yet.');
    expect(r.text).toMatch(
      /\(a\) the person gives it: upload it in the panel's Project Media named "river delta"/,
    );
    expect(r.text).toMatch(
      /\(b\) make it here: studio [a-z-]+ \(.*fields: .*; about \d+ to \d+ credits\)/,
    );
    expect(r.text).toMatch(
      /\(c\) prompt to make it anywhere: "A picture of river delta/,
    );
    expect(r.text).toContain('(d) pick it from the library');
    expect(r.text).toContain('(e) later');
    expect(r.text).toContain(
      "(f) you or the person's other tools make it, then add_media",
    );
    expect(r.text).not.toMatch(/[{[]\s*"/);
    await s.call(client, 'add_media', {
      video_id: videoId,
      name: 'river delta',
      kind: 'image',
      data_base64: PNG,
      source: 'Claude',
    });
    const after = await s.call(client, 'get_asset_needs', {
      video_id: videoId,
    });
    expect(after.text).toContain(
      `Already filled by the person's file "river delta.png".`,
    );
    // No plan yet: one sentence.
    const { videoId: empty } = await newVideo(s, client);
    expect(
      (await s.call(client, 'get_asset_needs', { video_id: empty })).text,
    ).toBe('There is no plan yet. Call submit_plan first.');
  });
});

describe("[RDC3-021] the person's choice", () => {
  it('[RDC3-021] set_asset_choice records make, upload, prompt, library, later or own in the Video sheet; an unknown file is refused', async () => {
    const { client, videoId } = await ready('c3-choice');
    for (const choice of [
      'make',
      'upload',
      'prompt',
      'library',
      'later',
      'own',
    ])
      expect(
        (
          await s.call(client, 'set_asset_choice', {
            video_id: videoId,
            slot: 'river delta',
            choice,
          })
        ).text,
      ).toBe(`"river delta" will be: ${choice}.`);
    const bad = await s.call(client, 'set_asset_choice', {
      video_id: videoId,
      slot: 'moon',
      choice: 'later',
    });
    expect(bad.isError).toBe(true);
    expect(bad.text).toBe(
      'This video has no file named "moon". Call get_asset_needs for the names.',
    );
    const mem = await s.call(client, 'read_memory', { video_id: videoId });
    expect(mem.text).toContain('Asset "river delta": own.');
    const needs = await s.call(client, 'get_asset_needs', {
      video_id: videoId,
    });
    expect(needs.text).toContain('Chosen: own.');
  });
});

describe('[RDC3-022] making a file with a Studio', () => {
  it('[RDC3-022] make_asset needs get_asset_cost first (the plan rule); then it runs the Studio through /v1/run, saves the file under the slot name, spends the credits, and a second run keeps the first file', async () => {
    const { client, token, videoId } = await ready('c3-make');
    const needs = (
      await s.call(client, 'get_asset_needs', { video_id: videoId })
    ).text;
    const studio = /make it here: studio ([a-z0-9-]+)/.exec(needs)![1]!;
    const early = await s.call(client, 'make_asset', {
      video_id: videoId,
      slot: 'river delta',
      studio_id: studio,
    });
    expect(early.text).toBe(
      'Call get_asset_cost with the same studio and answers, tell the person the cost, and wait for a clear yes first. Nothing was charged.',
    );
    const cost = await s.call(client, 'get_asset_cost', {
      video_id: videoId,
      slot: 'river delta',
      studio_id: studio,
      answers: { prompt: 'A river delta from above' },
    });
    expect(cost.text).toMatch(
      /^Making "river delta" with .* costs up to \d+ credits/,
    );
    // The free plan does not include image Studios: the gateway's own
    // limit refuses, nothing is charged.
    const before = await credits(token);
    const locked = await s.call(client, 'make_asset', {
      video_id: videoId,
      slot: 'river delta',
      studio_id: studio,
      answers: { prompt: 'A river delta from above' },
    });
    expect(locked.text).toBe(
      'The Studio stopped: Your plan does not include that tool. Nothing was charged.',
    );
    expect(await credits(token)).toBe(before);
    // On a plan that includes it (set as the payment webhook would).
    const prof = (await s.store.profile('c3-make'))!;
    await s.store.saveProfile({ ...prof, plan: 'pro' });
    await s.call(client, 'get_credits');
    const onPro = await credits(token);
    const made = await s.call(client, 'make_asset', {
      video_id: videoId,
      slot: 'river delta',
      studio_id: studio,
      answers: { prompt: 'A river delta from above' },
    });
    expect(made.text).toMatch(
      /^"river delta\.png" was made \(\d+ credits\) and saved in the video's media/,
    );
    expect(await credits(token)).toBeLessThanOrEqual(onPro);
    // Made again: the first file is kept beside the new one.
    await s.call(client, 'get_asset_cost', {
      video_id: videoId,
      slot: 'river delta',
      studio_id: studio,
      answers: { prompt: 'A wider river delta' },
    });
    const again = await s.call(client, 'make_asset', {
      video_id: videoId,
      slot: 'river delta',
      studio_id: studio,
      answers: { prompt: 'A wider river delta' },
    });
    expect(again.text).toMatch(/; the earlier file for it is kept\./);
    const blank = await s.call(client, 'check_video', { video_id: videoId });
    expect(blank.text).toMatch(/^Every file the plan needs is there\./);
    // An unknown Studio is refused, nothing charged.
    const no = await s.call(client, 'get_asset_cost', {
      video_id: videoId,
      slot: 'river delta',
      studio_id: 'not-a-studio',
    });
    expect(no.text).toMatch(/^No Studio "not-a-studio" can make a image/);
  });
});

describe('[RDC3-023] outside files', () => {
  it('[RDC3-023] add_media takes a small file as base64 or an https link through the network guard, checks type and size with the limit in one sentence, refuses private links, and never charges', async () => {
    const { client, token, videoId } = await ready('c3-outside');
    const before = await credits(token);
    const ok = await s.call(client, 'add_media', {
      video_id: videoId,
      name: 'my logo',
      kind: 'image',
      data_base64: PNG,
      source: 'Canva',
      licence: 'The person made it',
    });
    expect(ok.text).toBe(
      '"my logo.png" is in the video\'s media (from Canva; nothing was charged).',
    );
    expect(await credits(token)).toBe(before);
    const wrong = await s.call(client, 'add_media', {
      video_id: videoId,
      name: 'song',
      kind: 'audio',
      data_base64: PNG,
      source: 'Claude',
    });
    expect(wrong.text).toMatch(
      /^That file is not a audio \(it reads as image\/png\)/,
    );
    await s.publish((c) => {
      c.mcp.addMediaMaxMb = 0.1;
    });
    const big = await s.call(client, 'add_media', {
      video_id: videoId,
      name: 'huge',
      kind: 'image',
      data_base64: Buffer.alloc(200 * 1024, 1).toString('base64'),
      source: 'Claude',
    });
    expect(big.text).toMatch(
      /files sent inside the chat may be up to 0\.1 MB\./,
    );
    await s.publish((c) => {
      c.mcp.addMediaMaxMb = 8;
    });
    const priv = await s.call(client, 'add_media', {
      video_id: videoId,
      name: 'inside',
      kind: 'image',
      url: 'https://127.0.0.1/secret.png',
      source: 'Claude',
    });
    expect(priv.isError).toBe(true);
    expect(priv.text).toMatch(
      /^The file could not be fetched: .* Links may be up to 200 MB and must be public\.$/,
    );
    const http = await s.call(client, 'add_media', {
      video_id: videoId,
      name: 'x',
      kind: 'image',
      url: 'http://example.com/x.png',
      source: 'Claude',
    });
    expect(http.text).toBe('Send an https link.');
    expect(await credits(token)).toBe(before);
  });
});

describe('[RDC3-024] what is still blank', () => {
  it('[RDC3-024] check_video names the files still blank, and stops naming one once a file for it arrives', async () => {
    const { client, videoId } = await ready('c3-blank');
    expect(
      (await s.call(client, 'check_video', { video_id: videoId })).text,
    ).toMatch(
      /^Still blank: "river delta" \(get_asset_needs lists the ways to fill them\)\./,
    );
    await s.call(client, 'add_media', {
      video_id: videoId,
      name: 'river delta',
      kind: 'image',
      data_base64: PNG,
      source: 'Claude',
    });
    expect(
      (await s.call(client, 'check_video', { video_id: videoId })).text,
    ).toMatch(/^Every file the plan needs is there\./);
  });
});
