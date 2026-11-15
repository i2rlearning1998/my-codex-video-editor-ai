// RDC1-042: posters, covers and the stage after a build use the first moment
// with content, never the blank frame of a fade-in from 0:00.
import { describe, expect, it } from 'vitest';
import { firstContentTime } from '../../src/render/first-content';
import { buildVideoFromPlan } from '../../src/video-plan';
import { v4Deps } from './v4-fixtures';

describe('[RDC1-042] first moment with content', () => {
  it('[RDC1-042] a built scene whose layers fade in from 0:00 gets a time after the fade, inside the scene', async () => {
    const r = await buildVideoFromPlan(
      {
        format: 'video-plan',
        version: 4,
        meta: { title: 'T' },
        captions: { enabled: false },
        scenes: [
          {
            id: 's',
            durationHint: 4,
            layers: [{ id: 't', kind: 'title', text: 'Hello', enter: 'fade' }],
          },
        ],
      },
      v4Deps(),
    );
    const scene = r.project!.compositions[0]!;
    const t = firstContentTime(scene as never);
    expect(t).toBeGreaterThan(0.3);
    expect(t).toBeLessThan(scene.duration);
  });
  it('[RDC1-042] an empty scene stays at 0 and a layer without an In animation counts at its start', () => {
    expect(firstContentTime({ duration: 5, tracks: [], layers: [] })).toBe(0);
    const scene = {
      duration: 5,
      layers: [{ id: 'a', type: 'shape', name: 'Box', children: [] }],
      tracks: [
        {
          type: 'object',
          clips: [
            {
              layerId: 'a',
              startTime: 1,
              duration: 2,
              enabled: true,
              metadata: {},
            },
          ],
        },
      ],
    };
    expect(firstContentTime(scene)).toBeCloseTo(1.05, 5);
  });
});
