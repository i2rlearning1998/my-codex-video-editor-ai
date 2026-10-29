import { describe, expect, it } from 'vitest';
import {
  sceneCounts,
  sceneParts,
  swapPartAsset,
  swappable,
} from '../src/ui/scene-parts';
import type { MyTemplate } from '../src/ui/my-templates';

const prop = (value: unknown) => ({ type: 'string', value, animated: false });
const layer = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  type: 'shape',
  startTime: 0,
  duration: 5,
  transform: {},
  properties: {},
  effects: [],
  assetId: null,
  children: [],
  ...extra,
});
const asset = (id: string, type: string, duration = 10) =>
  ({ id, name: `${id}.x`, type, duration }) as never;
const template = {
  id: 't',
  name: 'T',
  category: 'my',
  createdAt: '',
  width: 1080,
  height: 1920,
  background: '#000',
  mediaIncluded: true,
  assets: [asset('a1', 'video')],
  scene: {
    layers: [
      layer('own'),
      layer('txt', { type: 'text' }),
      layer('ai', { type: 'text', properties: { planRef: prop('title') } }),
      layer('code', { type: 'video', code: { tier: 'a', source: '' } }),
      layer('vid', { type: 'video', assetId: 'a1' }),
    ],
    tracks: [
      {
        id: 'tr',
        clips: [
          {
            id: 'c',
            layerId: 'vid',
            assetId: 'a1',
            startTime: 0,
            duration: 5,
            sourceIn: 0,
            sourceOut: 5,
            metadata: {},
          },
        ],
      },
    ],
  },
} as unknown as MyTemplate;

describe('[FIX7-005] scene parts', () => {
  it('sorts parts into AI-made, code, media and editor items', () => {
    const parts = sceneParts(template);
    expect(sceneCounts(parts)).toEqual({ ai: 1, code: 1, media: 1, own: 2 });
    expect(swappable(parts).map((p) => p.layer.id)).toEqual(['vid']);
  });
  it('a swap keeps the place, repoints clips and never overruns the file', () => {
    const next = swapPartAsset(template, 'vid', asset('a2', 'video', 3))!;
    const clip = next.scene.tracks[0]!.clips[0]!;
    expect(clip.assetId).toBe('a2');
    expect(clip.sourceOut).toBe(3);
    expect(clip.duration).toBe(3);
    expect(next.assets.map((a) => a.id)).toEqual(['a2']);
    expect(swapPartAsset(template, 'vid', asset('p', 'image'))).toBeNull();
  });
});
