// ROUND-C4 Part 0.5 (RDC4-005): a scene that reuses media the person already
// has is charged only for what is new, by one rule shared by the Director's
// Plan card and the connector's plan cost.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/platform-config';
import {
  fileMatches,
  planTotals,
  sceneMethodCredits,
  sceneReusesMedia,
} from '../../src/director/plan-costs';
import { startC2, type C2 } from '../round-c2/helpers';
import { newVideo, person, plan } from '../round-c3/helpers';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const stockScene = {
  notes: 'method:stock',
  layers: [
    { kind: 'media', mediaIntent: { query: 'river delta', type: 'photo' } },
  ],
};

describe('[RDC4-005] reused media', () => {
  it('[RDC4-005] the shared rule: a stock scene costs its method, and nothing when every file it names is owned; icons and scenes without media never count as reuse', () => {
    const c = defaultConfig();
    expect(sceneMethodCredits(c, stockScene)).toBeGreaterThan(0);
    const owns = (q: string) => fileMatches(q, 'River delta.png');
    expect(sceneReusesMedia(stockScene, owns)).toBe(true);
    expect(sceneMethodCredits(c, stockScene, owns)).toBe(0);
    expect(
      sceneMethodCredits(c, stockScene, (q) => fileMatches(q, 'river.png')),
    ).toBeGreaterThan(0);
    expect(
      sceneReusesMedia({ notes: 'method:library', layers: [] }, () => true),
    ).toBe(false);
    // The Director's totals: without reuse they are exactly as before.
    const base = { max: 20, scenes: [{ max: 8 }, { max: 12 }] };
    expect(planTotals(base, 2, 3, 4)).toEqual({
      max: 27,
      sceneCosts: [8, 12],
    });
    // With the second scene reused, its cost goes down to 0 (never up).
    expect(planTotals(base, 2, 3, 4, [false, true])).toEqual({
      max: 15,
      sceneCosts: [8, 0],
    });
  });

  let s: C2;
  beforeAll(async () => {
    s = await startC2();
  });
  afterAll(() => s.close());
  it('[RDC4-005] get_plan_cost: the stock scene drops to 0 credits once the person adds the file it names; the total goes down by that scene only', async () => {
    const { client } = await person(s, 'c4-reuse');
    const { videoId } = await newVideo(s, client);
    const p = plan('Deltas');
    p.scenes[1] = { ...p.scenes[1]!, notes: 'method:stock' };
    p.scenes[1]!.layers.push({
      id: 'delta',
      kind: 'media',
      mediaIntent: { query: 'river delta', type: 'photo' },
    } as never);
    await s.call(client, 'submit_plan', { video_id: videoId, plan: p });
    const before = await s.call(client, 'get_plan_cost', {
      video_id: videoId,
    });
    const line = (t: string) => /^2\. .*; (\d+) credits\.$/m.exec(t)![1]!;
    const total = (t: string) => Number(/Total: up to (\d+)/.exec(t)![1]!);
    expect(Number(line(before.text))).toBeGreaterThan(0);
    await s.call(client, 'add_media', {
      video_id: videoId,
      name: 'river delta',
      kind: 'image',
      data_base64: PNG,
      source: 'Claude',
    });
    const after = await s.call(client, 'get_plan_cost', { video_id: videoId });
    expect(line(after.text)).toBe('0');
    expect(total(after.text)).toBe(
      total(before.text) - Number(line(before.text)),
    );
  });
});
