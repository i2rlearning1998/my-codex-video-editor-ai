// RDC1-060: rough use of the v4 build and the tools: "use only my files"
// with nothing uploaded, every provider disabled, a stock pick whose licence
// is not allowed, footage shorter than the scene, a plan with 40 scenes and
// 400 layers, cancel during the build and during a download, the same plan
// built twice, a 1:1 and a 16:9 project, a def with the id of a built-in.
import { describe, expect, it } from 'vitest';
import { buildVideoFromPlan, validatePlan } from '../../src/video-plan';
import { STOCK, v4Deps, v4Plan } from './v4-fixtures';

const media = (
  query: string,
  type = 'photo',
  extra: Record<string, unknown> = {},
) => ({
  id: 'm',
  kind: 'media',
  size: 'full',
  mediaIntent: { query, type },
  ...extra,
});
const one = (layers: unknown[], meta: Record<string, unknown> = {}) => ({
  format: 'video-plan',
  version: 4,
  meta: { title: 'R', ...meta },
  captions: { enabled: false },
  scenes: [{ id: 's', durationHint: 5, layers }],
});

describe('[RDC1-060] rough use', () => {
  it('[RDC1-060] "use only my files" with nothing uploaded: no stock is searched, the slot is flagged with a plain reason', async () => {
    let searched = 0;
    const r = await buildVideoFromPlan(
      one([media('fort')], { assets: { onlyMine: true } }),
      v4Deps({
        resolve: { local: () => [], stock: async () => (searched++, STOCK) },
      }),
    );
    expect(searched).toBe(0);
    expect(r.flags[0]).toMatchObject({ key: 's/m', name: 'fort' });
    expect(r.flags[0]!.reason).toMatch(
      /Nothing usable for "fort"\. Add a file with this name to Media\./,
    );
  });
  it('[RDC1-060] every provider failing or disabled: the build still finishes, the layer offers rewording or a code graphic', async () => {
    const r = await buildVideoFromPlan(
      one([media('fort')]),
      v4Deps({
        resolve: {
          local: () => [],
          stock: async () => {
            throw new Error('No provider of this kind is enabled.');
          },
        },
      }),
    );
    expect(r.project).not.toBeNull();
    expect(r.flags[0]!.reason).toMatch(
      /Reword the search or make a code graphic\. \(No provider of this kind is enabled\.\)/,
    );
  });
  it('[RDC1-060] a pick whose licence is not allowed, and footage shorter than the layer, are passed over', async () => {
    const lic = await buildVideoFromPlan(one([media('fort gate')]), v4Deps());
    expect(lic.resolved['s/m']).toBe('fakestock:fort-1');
    const short = await buildVideoFromPlan(
      one([media('river', 'video', { queries: ['river short'], duration: 5 })]),
      v4Deps(),
    );
    expect(short.resolved['s/m']).toBe('fakestock:river-1');
    const tooShort = await buildVideoFromPlan(
      one([media('river short', 'video', { duration: 30 })]),
      v4Deps(),
    );
    expect(tooShort.flags[0]?.key).toBe('s/m');
  });
  it('[RDC1-060] several queries are tried in order; one picture is not used by two layers', async () => {
    const r = await buildVideoFromPlan(
      one([
        { ...media('zebra', 'photo', { queries: ['zebra', 'fort'] }), id: 'a' },
        { ...media('fort'), id: 'b' },
      ]),
      v4Deps(),
    );
    expect(r.resolved['s/a']).toBe('fakestock:fort-1');
    expect(r.resolved['s/b']).not.toBe('fakestock:fort-1');
  });
  it('[RDC1-060] 40 scenes and 400 layers validate and build', async () => {
    const scenes = Array.from({ length: 40 }, (_, i) => ({
      id: `s${i}`,
      durationHint: 2,
      layers: Array.from({ length: 10 }, (_, k) => ({
        id: `t${k}`,
        kind: 'text',
        text: `Line ${k}`,
        at: { x: 50, y: 10 + k * 8 },
        fontSize: 30,
      })),
    }));
    const plan = {
      format: 'video-plan',
      version: 4,
      meta: { title: 'Big', build: 'timeline' },
      captions: { enabled: false },
      scenes,
    };
    expect(validatePlan(plan).ok).toBe(true);
    const r = await buildVideoFromPlan(plan, v4Deps());
    expect(r.errors).toEqual([]);
    expect(r.project!.compositions[0]!.layers.length).toBeGreaterThanOrEqual(
      400,
    );
  }, 360_000);
  it('[RDC1-060] cancel during the build or during a download stops with nothing returned', async () => {
    const controller = new AbortController();
    const slow = v4Deps({
      importCandidate: async (_c, signal) => {
        controller.abort();
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        throw new Error('not cancelled');
      },
    });
    await expect(
      buildVideoFromPlan(
        one([media('fort')]),
        slow,
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow(/Cancelled/);
  });
  it('[RDC1-060] the same v4 plan built twice is the same project; 1:1 and 16:9 both build', async () => {
    for (const aspect of ['1:1', '16:9']) {
      const p = { ...v4Plan(), meta: { ...(v4Plan().meta as object), aspect } };
      const a = await buildVideoFromPlan(p, v4Deps());
      const b = await buildVideoFromPlan(p, v4Deps());
      expect(a.errors).toEqual([]);
      expect(JSON.stringify(a.project)).toBe(JSON.stringify(b.project));
      expect(
        a.project!.compositions[0]!.width / a.project!.compositions[0]!.height,
      ).toBeCloseTo(aspect === '1:1' ? 1 : 16 / 9, 2);
    }
  });
  it('[RDC1-060] a new graphic with a built-in id, or a layer naming a missing graphic, is a plain error', async () => {
    const plan = v4Plan() as any;
    plan.defs.blocks[0].id = 'counter';
    expect(validatePlan(plan).errors.join(' ')).toMatch(
      /"counter" is a built-in block; give the new graphic its own id/,
    );
    const missing = v4Plan() as any;
    missing.scenes[0].layers[1].block = 'bar-rize';
    expect(validatePlan(missing).errors.join(' ')).toMatch(
      /there is no graphics block "bar-rize"/,
    );
  });
});
