import { expect, test } from 'vitest';
import {
  validateNewProject,
  presetSize,
  aspects,
  resolutions,
  frameRates,
  createProjectFromSettings,
} from '../src/project/new-project';
import { EditorEngine, createProject } from '../src/core';
import { EditorSession } from '../src/ui/session';
test('New project validation covers every preset, custom bounds, frame rates and the load boundary', () => {
  const input = {
    name: '  Lesson  ',
    aspect: '16:9',
    resolution: '1080p',
    fps: 30,
    background: '#ABCDEF',
  };
  for (const aspect of aspects.filter((value) => value !== 'custom'))
    for (const resolution of Object.keys(
      resolutions,
    ) as (keyof typeof resolutions)[]) {
      const result = validateNewProject({ ...input, aspect, resolution });
      expect(result.ok, `${aspect} ${resolution}`).toBe(true);
      if (result.ok) {
        const [x, y] = aspect.split(':').map(Number) as [number, number];
        expect(Math.min(result.settings.width, result.settings.height)).toBe(
          resolutions[resolution],
        );
        expect(result.settings.width % 2).toBe(0);
        expect(result.settings.height % 2).toBe(0);
        expect(result.settings.width / result.settings.height).toBeCloseTo(
          x / y,
          2,
        );
        expect(result.settings.name).toBe('Lesson');
        expect(result.settings.background).toBe('#abcdef');
      }
    }
  expect(presetSize('9:16', '1080p')).toEqual({ width: 1080, height: 1920 });
  for (const fps of frameRates)
    expect(validateNewProject({ ...input, fps }).ok).toBe(true);
  for (const fps of [0, 23.976, 29.97, 120, NaN, '', null])
    expect(validateNewProject({ ...input, fps }).ok).toBe(false);
  for (const width of [15, 17, 7681, 7682, 100.5, NaN, Infinity, '', null])
    expect(
      validateNewProject({ ...input, aspect: 'custom', width, height: 1080 })
        .ok,
    ).toBe(false);
  for (const height of [15, 17, 7681, 7682, 100.5, NaN, Infinity])
    expect(
      validateNewProject({ ...input, aspect: 'custom', width: 1080, height })
        .ok,
    ).toBe(false);
  for (const width of [16, 7680])
    expect(
      validateNewProject({ ...input, aspect: 'custom', width, height: width })
        .ok,
    ).toBe(true);
  for (const invalid of [
    { name: '' },
    { name: 'a'.repeat(257) },
    { aspect: '5:7' },
    { resolution: '8K' },
    { background: 'transparent' },
    { background: '#fff' },
  ])
    expect(validateNewProject({ ...input, ...invalid }).ok).toBe(false);
  const result = validateNewProject(input);
  if (!result.ok) throw new Error('Invalid test setup');
  const engine = new EditorEngine(createProject());
  const session = new EditorSession(engine);
  session.setCurrentTime(3);
  session.setPlaying(true);
  createProjectFromSettings(result.settings, engine);
  expect(engine.state.settings.backgroundColor).toBe('#abcdef');
  expect(engine.canUndo).toBe(false);
  expect(session.currentTime).toBe(0);
  expect(session.playing).toBe(false);
  expect(session.selectedIds).toEqual([]);
  const before = engine.state;
  expect(() =>
    createProjectFromSettings({ ...result.settings, width: 17 }, engine),
  ).toThrow();
  expect(engine.state).toBe(before);
  session.dispose();
});
