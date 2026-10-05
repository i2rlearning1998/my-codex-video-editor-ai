import { describe, expect, it } from 'vitest';
import {
  drawOrder,
  laneAccepts,
  laneGroupOfLayer,
  laneInsertIndex,
  nearestFreeStart,
  sortedLanes,
} from '../src/core/lanes';

const string = (value: string) => ({ type: 'string', value });
const lane = (
  id: string,
  type: 'text' | 'object' | 'video' | 'audio',
  order: number,
  layers: string[] = [],
) =>
  ({
    id,
    type,
    order,
    clips: layers.map((layerId) => ({ layerId })),
  }) as const;

describe('[TL-061] lane groups (J7)', () => {
  it('puts each kind of layer in its group', () => {
    expect(laneGroupOfLayer({ type: 'video' })).toBe('visual');
    expect(laneGroupOfLayer({ type: 'image' })).toBe('visual');
    expect(laneGroupOfLayer({ type: 'audio' })).toBe('audio');
    expect(laneGroupOfLayer({ type: 'text' })).toBe('text');
    expect(laneGroupOfLayer({ type: 'shape' })).toBe('text');
    // Drawings (annotations) are text and shapes; backgrounds are visuals.
    expect(
      laneGroupOfLayer({
        type: 'shape',
        properties: { path: string('0 0 1 1') },
      }),
    ).toBe('text');
    expect(
      laneGroupOfLayer({
        type: 'shape',
        properties: { role: string('background') },
      }),
    ).toBe('visual');
    expect(
      laneGroupOfLayer({
        type: 'group',
        properties: { role: string('background') },
        children: [{ type: 'shape' }],
      }),
    ).toBe('visual');
    // A group is text and shapes only when everything in it is.
    expect(
      laneGroupOfLayer({
        type: 'group',
        children: [{ type: 'text' }, { type: 'shape' }],
      }),
    ).toBe('text');
    expect(
      laneGroupOfLayer({
        type: 'group',
        children: [{ type: 'text' }, { type: 'image' }],
      }),
    ).toBe('visual');
    expect(laneAccepts('object', { type: 'text' })).toBe(true);
    expect(laneAccepts('text', { type: 'shape' })).toBe(true);
    expect(laneAccepts('video', { type: 'text' })).toBe(false);
    expect(laneAccepts('audio', { type: 'video' })).toBe(false);
  });
  // U1 (D-176): lanes keep their own order in any group order; a new lane
  // opens above its group's top lane (with none yet: at the top, audio at
  // the bottom).
  it('[TL-084] keeps lanes in their own order and inserts a new lane at the top of its group', () => {
    const tracks = [
      lane('a', 'audio', 0),
      lane('v', 'video', 1),
      lane('t', 'text', 2),
      lane('o', 'object', 3),
    ];
    expect(sortedLanes(tracks).map((track) => track.id)).toEqual([
      'a',
      'v',
      't',
      'o',
    ]);
    expect(laneInsertIndex(tracks, 'text')).toBe(2);
    expect(laneInsertIndex(tracks, 'visual')).toBe(1);
    expect(laneInsertIndex(tracks, 'visual', 'bottom')).toBe(2);
    expect(laneInsertIndex(tracks, 'audio')).toBe(0);
    expect(laneInsertIndex([lane('v', 'video', 0)], 'audio')).toBe(1);
    expect(laneInsertIndex([lane('a', 'audio', 0)], 'text')).toBe(0);
  });
  it('draws top-level layers by lane: the top lane in front', () => {
    const composition = {
      layers: [
        { id: 'title' },
        { id: 'photo' },
        { id: 'loose' },
        { id: 'logo' },
      ],
      tracks: [
        lane('t1', 'text', 0, ['title']),
        lane('t2', 'object', 1, ['logo']),
        lane('v1', 'video', 2, ['photo']),
      ],
    };
    expect(drawOrder(composition).map((layer) => layer.id)).toEqual([
      'loose',
      'photo',
      'logo',
      'title',
    ]);
  });
  it('places an audio clip at the nearest free time on the one audio lane', () => {
    const clips = [
      { startTime: 0, duration: 4 },
      { startTime: 6, duration: 4 },
    ];
    expect(nearestFreeStart(clips, 12, 2)).toBe(12);
    // 3 s at 1 s overlaps; the nearest free start is 10 (after the second).
    expect(nearestFreeStart(clips, 1, 3)).toBe(10);
    // 2 s at 3.5 fits exactly in the 4..6 gap.
    expect(nearestFreeStart(clips, 3.5, 2)).toBe(4);
  });
});
