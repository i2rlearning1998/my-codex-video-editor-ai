import { expect, test } from 'vitest';
import fixture from './fixtures/projects/av-sync.json';
import { EditorEngine, serializeProject } from '../src/core';
import {
  clipGainAt,
  defaultAudioSettings,
  readAudioSettings,
  setClipAudio,
  volumeDbAt,
} from '../src/audio/settings';

test('[AUD-002][AUD-009] validated audio commands preserve schema, unrelated metadata, undo and locks', () => {
  const engine = new EditorEngine(fixture);
  const state = () => engine.state.compositions[0]!.tracks[1]!.clips[0]!;
  const before = serializeProject(engine.state);
  const settings = {
    ...defaultAudioSettings(),
    gainDb: -6,
    pan: 0.5,
    volumeKeys: [
      { time: 0, db: -12 },
      { time: 2, db: 0 },
    ],
  };
  setClipAudio(engine, 'av-main', 'clip-tone', settings, 'Audio');
  expect(readAudioSettings(state())).toEqual(settings);
  expect(engine.state.schemaVersion).toBe(5);
  expect(engine.history.undo).toHaveLength(1);
  engine.undo();
  expect(serializeProject(engine.state)).toBe(before);
  engine.redo();
  expect(readAudioSettings(state()).gainDb).toBe(-6);
  expect(() =>
    setClipAudio(
      engine,
      'av-main',
      'clip-tone',
      { ...settings, pan: 2 },
      'Audio',
    ),
  ).toThrow();
  expect(() =>
    setClipAudio(
      engine,
      'av-main',
      'clip-tone',
      { ...settings, gainDb: NaN },
      'Audio',
    ),
  ).toThrow();
  expect(() =>
    setClipAudio(
      engine,
      'av-main',
      'clip-tone',
      {
        ...settings,
        volumeKeys: [
          { time: 1, db: 0 },
          { time: 0, db: -2 },
        ],
      },
      'Audio',
    ),
  ).toThrow();
  engine.commands.execute(
    {
      type: 'SET_TRACK_STATE',
      compositionId: 'av-main',
      trackId: 'audio-1',
      enabled: true,
      muted: false,
      locked: true,
    },
    'Lock',
  );
  expect(() =>
    setClipAudio(engine, 'av-main', 'clip-tone', settings, 'Audio'),
  ).toThrow('locked');
});
test('[AUD-003][AUD-002] fades scale to clip length and keyframe dB interpolate at seeks', () => {
  const settings = { ...defaultAudioSettings(), fadeIn: 2, fadeOut: 2 };
  expect(clipGainAt(settings, 0, 2)).toBe(0);
  expect(clipGainAt(settings, 1, 2)).toBe(1);
  expect(clipGainAt(settings, 2, 2)).toBe(0);
  const keys = {
    ...settings,
    volumeKeys: [
      { time: 0, db: -12 },
      { time: 2, db: 0 },
    ],
  };
  expect(volumeDbAt(keys, 1)).toBe(-6);
  expect(volumeDbAt(keys, 4)).toBe(0);
  expect(readAudioSettings({ metadata: { audio: { pan: Infinity } } })).toEqual(
    defaultAudioSettings(),
  );
});

// Absolute calibration independent of the implementation: 997 Hz mono at -20 dBFS
// peak has -23.01 LKFS; two identical full-level channels add 3.01 dB.
