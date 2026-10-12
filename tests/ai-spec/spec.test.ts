import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  resolveSpec,
  validateSpec,
  formatIssues,
  canonicalJson,
  COMMAND_NAMES,
  compositionSpecSchema,
} from '../../src/ai-spec';
import { fxData } from '../../src/ai-spec/catalogs/data';
const fixtureDir = new URL('./fixtures/', import.meta.url);
const names = readdirSync(fixtureDir)
  .filter((n) => n.endsWith('.spec.json'))
  .sort();
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(name, fixtureDir), 'utf8'));
function base() {
  return {
    version: 1,
    id: 'test',
    title: 'Test',
    canvas: { width: 1280, height: 720, fps: 30 },
    scenes: [
      {
        id: 'scene',
        name: 'Scene',
        duration: 5,
        items: [
          {
            id: 'title',
            name: 'Title',
            kind: 'text',
            start: 0,
            duration: 5,
            width: 1000,
            height: 100,
            text: 'Hello',
          },
        ],
      },
    ],
  };
}
function invalid(value: unknown, pattern: RegExp) {
  const result = validateSpec(value);
  expect(result.ok).toBe(false);
  expect(formatIssues(result)).toMatch(pattern);
}
for (const name of names) {
  describe(name, () => {
    it('validates the complete worked example and matches its reviewed plan fixture', () => {
      const spec = read(name),
        validation = validateSpec(spec);
      expect(validation.ok, formatIssues(validation)).toBe(true);
      expect(resolveSpec(spec)).toEqual(
        read(name.replace('.spec.json', '.plan.json')),
      );
    });
    it('is deterministic and does not mutate input, use randomness, time or network', () => {
      const spec = read(name),
        before = JSON.stringify(spec);
      const random = vi.spyOn(Math, 'random').mockImplementation(() => {
        throw Error('Randomness used');
      });
      const now = vi.spyOn(Date, 'now').mockImplementation(() => {
        throw Error('Clock used');
      });
      const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        throw Error('Network used');
      });
      try {
        const first = resolveSpec(spec);
        expect(resolveSpec(JSON.stringify(spec))).toEqual(first);
        expect(JSON.stringify(spec)).toBe(before);
        expect(Object.isFrozen(first.operations)).toBe(true);
      } finally {
        random.mockRestore();
        now.mockRestore();
        network.mockRestore();
      }
    });
  });
}
it('ships exactly the six requested worked examples', () => {
  expect(names).toEqual([
    'data-explainer.spec.json',
    'kinetic-quote.spec.json',
    'lower-third.spec.json',
    'outro.spec.json',
    'product-ad.spec.json',
    'youtube-intro.spec.json',
  ]);
});
it('emits existing command names and marks future vocabulary as blocked', () => {
  const source = readFileSync(
    new URL('../../src/core/commands.ts', import.meta.url),
    'utf8',
  );
  const live = new Set(
    [...source.matchAll(/type: z.literal\('([A-Z_]+)'\)/g)].map((m) => m[1]),
  );
  for (const name of names) {
    const plan = resolveSpec(read(name));
    expect(plan.executable).toBe(false);
    for (const op of plan.operations) {
      expect(COMMAND_NAMES).toContain(op.command.type);
      if (op.status === 'mapped') expect(live.has(op.command.type)).toBe(true);
      if (!live.has(op.command.type)) {
        expect(op.status).toBe('blocked');
        expect(op.reason).toBeTruthy();
      }
    }
  }
});
it('orders native layer/property/track/clip dependencies with explicit timing and valid ids', () => {
  const plan = resolveSpec(base());
  const ops = plan.operations;
  expect(ops[0]!.command.type).toBe('CREATE_COMPOSITION');
  expect(plan.duration).toBe(5);
  const create = ops.findIndex(
    (o) =>
      o.command.type === 'CREATE_LAYER' &&
      (o.command.layer as { name: string }).name === 'Title',
  );
  const property = ops.findIndex(
    (o) =>
      o.command.type === 'SET_PROPERTY' &&
      (o.command.target as { key: string }).key === 'text',
  );
  const track = ops.findIndex((o) => o.command.type === 'CREATE_TRACK'),
    clip = ops.findIndex((o) => o.command.type === 'CREATE_CLIP');
  expect(create).toBeLessThan(property);
  expect(property).toBeLessThan(track);
  expect(track).toBeLessThan(clip);
  expect(ops[clip]!.command.clip).toMatchObject({
    startTime: 0,
    duration: 5,
    sourceIn: 0,
    sourceOut: 5,
  });
  expect(ops.map((o) => o.sequence)).toEqual(ops.map((_, i) => i));
  expect(new Set(plan.itemMap.map((i) => i.layerId)).size).toBe(
    plan.itemMap.length,
  );
  for (const item of plan.itemMap)
    expect(item.layerId).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
});
it('preserves uploaded asset references, camera data and image requests without claiming execution', () => {
  const product = resolveSpec(read('product-ad.spec.json'));
  expect(product.assets).toContainEqual(
    expect.objectContaining({ assetId: 'uploaded_product_photo' }),
  );
  expect(product.operations.some((o) => o.status === 'needs-asset')).toBe(true);
  expect(
    product.operations
      .filter((o) => o.command.type === 'ADD_EFFECT')
      .every((o) => o.status === 'blocked'),
  ).toBe(true);
  expect(
    product.operations.some(
      (o) =>
        o.command.type === 'SET_PROPERTY' &&
        (o.command.target as { key: string }).key === 'camera_zoom' &&
        o.status === 'blocked',
    ),
  ).toBe(true);
  expect(
    JSON.stringify(resolveSpec(read('outro.spec.json')).requirements),
  ).toContain('Ask the owner for a square channel portrait');
});
it('resolves editable defaults/overrides and separates semantic cache identities', () => {
  const spec = read('lower-third.spec.json'),
    a = validateSpec(spec),
    b = validateSpec(spec, { speaker: 'Taylor' });
  expect(a.ok && b.ok).toBe(true);
  if (!a.ok || !b.ok) return;
  expect(a.cacheKey).not.toBe(b.cacheKey);
  expect(a.bindings).toContainEqual({
    path: '/scenes/0/items/1/text',
    param: 'speaker',
  });
  expect(JSON.stringify(resolveSpec(spec, { speaker: 'Taylor' }))).toContain(
    'Taylor',
  );
  const reverse = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(reverse)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .reverse()
              .map(([k, x]) => [k, reverse(x)]),
          )
        : v;
  const c = validateSpec(reverse(spec));
  expect(c.ok && c.cacheKey).toBe(a.cacheKey);
  expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  invalid(
    {
      ...spec,
      parameters: [
        {
          name: 'speaker',
          label: 'Speaker',
          type: 'number',
          min: 0,
          max: 10,
          step: 1,
          default: 5,
        },
      ],
    },
    /text/,
  );
  expect(validateSpec(spec, { speaker: 123 }).ok).toBe(false);
  expect(validateSpec(spec, { unknown: 'x' }).ok).toBe(false);
});
it.each([
  [
    'version',
    (s: ReturnType<typeof base>) => ({ ...s, version: 2 }),
    /version/,
  ],
  [
    'unsafe id',
    (s: ReturnType<typeof base>) => ({ ...s, id: '__proto__' }),
    /id/,
  ],
  [
    'bad fps',
    (s: ReturnType<typeof base>) => ({ ...s, canvas: { ...s.canvas, fps: 0 } }),
    /fps/,
  ],
  [
    'oversized canvas',
    (s: ReturnType<typeof base>) => ({
      ...s,
      canvas: { ...s.canvas, width: 4096, height: 4096 },
    }),
    /pixels/,
  ],
  [
    'unknown fields',
    (s: ReturnType<typeof base>) => ({ ...s, script: 'eval(1)' }),
    /Unrecognized/,
  ],
  [
    'duplicate scenes',
    (s: ReturnType<typeof base>) => ({
      ...s,
      scenes: [s.scenes[0], structuredClone(s.scenes[0])],
    }),
    /Duplicate/,
  ],
  [
    'too many scenes',
    (s: ReturnType<typeof base>) => ({
      ...s,
      scenes: Array.from({ length: 13 }, (_, i) => ({
        ...s.scenes[0],
        id: 's' + i,
      })),
    }),
    /12/,
  ],
  [
    'NaN',
    (s: ReturnType<typeof base>) => ({
      ...s,
      canvas: { ...s.canvas, width: NaN },
    }),
    /finite/,
  ],
])('rejects %s with a repairable error', (_name, modify, pattern) =>
  invalid(modify(base()), pattern),
);
it('rejects negative, reversed/outside timing and total duration overflow', () => {
  const s = base();
  s.scenes[0]!.items[0]!.start = -1;
  invalid(s, /start/);
  s.scenes[0]!.items[0]!.start = 1;
  invalid(s, /exceeds scene/);
  s.scenes[0]!.items[0]!.start = 0;
  s.scenes[0]!.items[0]!.duration = 0;
  invalid(s, /duration/);
  const long = read('lower-third.spec.json');
  long.scenes = Array.from({ length: 12 }, (_, i) => ({
    ...structuredClone(long.scenes[0]),
    id: 's' + i,
    duration: 20,
  }));
  invalid(long, /180/);
});
it('checks total items across otherwise valid scenes', () => {
  const s = base();
  s.scenes = Array.from({ length: 3 }, (_, i) => ({
    ...structuredClone(s.scenes[0]!),
    id: 'scene' + i,
    items: Array.from({ length: 50 }, (_, j) => ({
      ...s.scenes[0]!.items[0]!,
      id: 'item' + j,
    })),
  }));
  invalid(s, /128/);
});
it('rejects duplicate item ids, unknown/incorrect asset slots and external URLs', () => {
  const s = read('outro.spec.json');
  s.scenes[0].items.push(structuredClone(s.scenes[0].items[0]));
  invalid(s, /Duplicate/);
  s.scenes[0].items.pop();
  s.assets = [];
  invalid(s, /Unknown asset slot/);
  s.assets = [{ id: 'avatar-photo', kind: 'audio', description: 'Wrong' }];
  invalid(s, /incompatible/);
  s.assets[0].kind = 'image';
  s.assets[0].assetId = 'https://example.com/image.png';
  invalid(s, /assetId/);
});
it('validates all 80 pinned FX ids and rejects unknown ids/params/ranges/seeds', () => {
  expect(fxData).toHaveLength(80);
  for (const fx of fxData) {
    const s = base();
    Object.assign(s.scenes[0]!.items[0]!, {
      fx: [{ id: fx.id, params: {}, seed: 1 }],
    });
    const result = validateSpec(s);
    expect(result.ok, formatIssues(result)).toBe(true);
  }
  const s = base();
  Object.assign(s.scenes[0]!.items[0]!, {
    fx: [{ id: 'effect.not-real', params: {}, seed: 1 }],
  });
  invalid(s, /Unknown FX/);
  Object.assign(s.scenes[0]!.items[0]!, {
    fx: [{ id: 'effect.blur', params: { intensity: 2 }, seed: 1 }],
  });
  invalid(s, /Invalid FX/);
  Object.assign(s.scenes[0]!.items[0]!, {
    fx: [{ id: 'effect.blur', params: { unknown: 1 }, seed: 1 }],
  });
  invalid(s, /Unknown FX parameter/);
  Object.assign(s.scenes[0]!.items[0]!, {
    fx: [{ id: 'effect.blur', params: {} }],
  });
  invalid(s, /seed/);
});
it('rejects invalid block references, versions, params and unsigned seeds', () => {
  const s = read('data-explainer.spec.json');
  s.scenes[0].items[0].blockId = 'absent';
  invalid(s, /Unknown block/);
  s.scenes[0].items[0].blockId = 'counter';
  s.scenes[0].items[0].blockVersion = '9.0.0';
  invalid(s, /version/);
  s.scenes[0].items[0].blockVersion = '1.0.0';
  s.scenes[0].items[0].params.seconds = -1;
  invalid(s, /parameter: seconds/);
  delete s.scenes[0].items[0].params.seconds;
  s.scenes[0].items[0].seed = -1;
  invalid(s, /seed/);
});
it.each([
  'fetch("x");',
  'eval("1");',
  'globalThis.x=1;',
  'const f=ctx.constructor;',
  'import("x");',
])('rejects source through the actual compileBlock policy: %s', (body) => {
  const s = read('kinetic-quote.spec.json');
  s.blocks[0].source = `({id:'quote-dot',version:'1.0.0',name:'X',category:'X',defaultDuration:6,params:[],render(ctx,t,size,params,seed){${body}}})`;
  invalid(s, /source/);
});
it('rejects block id collisions, source identity mismatch and unknown editable references', () => {
  const s = read('kinetic-quote.spec.json');
  s.blocks[0].id = 'counter';
  invalid(s, /collides/);
  s.blocks[0].id = 'other';
  invalid(s, /compiled metadata/);
  s.blocks[0].id = 'quote-dot';
  s.scenes[0].items[0].params.text = { $param: 'missing' };
  invalid(s, /Unknown editable/);
});
it('rejects camera overlap, seed animation, invalid zoom and final/oversized transitions', () => {
  const s = read('product-ad.spec.json');
  s.scenes[0].cameraMoves[0].to.zoom = 0;
  invalid(s, /zoom/);
  s.scenes[0].cameraMoves[0].to.zoom = 1.1;
  s.scenes[0].cameraMoves[0].to.shake.seed = 18;
  invalid(s, /seed/);
  s.scenes[0].cameraMoves[0].to.shake.seed = 17;
  s.scenes[0].cameraMoves.push({
    ...structuredClone(s.scenes[0].cameraMoves[0]),
    id: 'overlap',
  });
  invalid(s, /non-overlapping/);
  const intro = read('youtube-intro.spec.json');
  intro.scenes[1].transition = { id: 'crossfade', duration: 0.5 };
  invalid(intro, /Final scene/);
  delete intro.scenes[1].transition;
  intro.scenes[0].transition.duration = 2;
  invalid(intro, /half/);
});
it('never evaluates getters/functions and bounds non-JSON, nested and oversized input', () => {
  let called = false;
  const object = {
    get id() {
      called = true;
      return 'x';
    },
  };
  invalid(object, /Accessors/);
  expect(called).toBe(false);
  invalid({ fn: () => 1 }, /JSON/);
  invalid({ date: new Date() }, /plain JSON/);
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  invalid(cyclic, /Cyclic/);
  let nested: unknown = 0;
  for (let i = 0; i < 30; i++) nested = { nested };
  invalid(nested, /depth/);
  invalid(' '.repeat(1_048_577), /1 MiB/);
  invalid('{oops', /JSON|property|Unexpected/i);
  invalid(JSON.parse('{"__proto__":{}}'), /Reserved/);
});
it('validates defaults as well as authored parameter bindings', () => {
  const s = read('lower-third.spec.json');
  s.parameters[0].maxLength = 2;
  invalid(s, /speaker/);
  s.parameters[0].maxLength = 60;
  s.parameters.push(structuredClone(s.parameters[0]));
  invalid(s, /duplicate/);
});

it('the public Zod schema enforces semantic checks, not just JSON shape', () => {
  const spec = base();
  expect(compositionSpecSchema.safeParse(spec).success).toBe(true);
  spec.scenes[0]!.items[0]!.duration = 6;
  const result = compositionSpecSchema.safeParse(spec);
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues[0]!.message).toMatch(/exceeds scene/);
});
