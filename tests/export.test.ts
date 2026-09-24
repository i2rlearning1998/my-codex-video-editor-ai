import { describe, expect, it } from 'vitest';
import {
  EXPORT_PRESETS,
  defaultSettings,
  evenSize,
  fitMatrix,
  frameTimes,
  remainingSeconds,
  safeFileName,
  usedAssetIds,
  validateSettings,
} from '../src/export/settings';

describe('[EXP-001][EXP-006] export settings', () => {
  it('keeps sizes even and inside bounds, and names file-system safe', () => {
    expect([
      evenSize(1921),
      evenSize(3),
      evenSize(99999),
      evenSize(NaN),
    ]).toEqual([1920, 16, 7680, 16]);
    expect(safeFileName(' My: film/cut?.mp4 ')).toBe('My film cut');
    expect(safeFileName('   ')).toBe('export');
  });
  it('defaults to the composition size, rate and length', () => {
    expect(
      defaultSettings(
        { width: 1280, height: 720, fps: 30, duration: 4 },
        'Demo',
      ),
    ).toEqual({
      width: 1280,
      height: 720,
      fps: 30,
      quality: 'high',
      start: 0,
      end: 4,
      fileName: 'Demo',
    });
  });
  it('has the ledger presets with even sizes', () => {
    expect(EXPORT_PRESETS.map((p) => [p.id, p.width, p.height])).toEqual([
      ['youtube-1080', 1920, 1080],
      ['youtube-4k', 3840, 2160],
      ['vertical', 1080, 1920],
      ['square', 1080, 1080],
      ['portrait', 1080, 1350],
      ['whatsapp', 854, 480],
    ]);
    for (const preset of EXPORT_PRESETS) {
      expect(evenSize(preset.width)).toBe(preset.width);
      expect(evenSize(preset.height)).toBe(preset.height);
    }
  });
  it('refuses odd sizes, bad rates and ranges outside the composition', () => {
    const base = defaultSettings(
      { width: 1280, height: 720, fps: 30, duration: 4 },
      'x',
    );
    expect(() => validateSettings({ ...base, width: 1281 }, 4)).toThrow(/even/);
    expect(() => validateSettings({ ...base, fps: 0 }, 4)).toThrow(
      /Frame rate/,
    );
    expect(() => validateSettings({ ...base, end: 5 }, 4)).toThrow(/range/);
    expect(() => validateSettings({ ...base, start: 2, end: 2 }, 4)).toThrow(
      /range/,
    );
    expect(validateSettings(base, 4)).toEqual(base);
  });
});

describe('[EXP-003][EXP-002] frame plan, fit and ETA', () => {
  it('plans one frame per 1/fps across the range', () => {
    const times = frameTimes({ fps: 30, start: 1, end: 2 });
    expect(times).toHaveLength(30);
    expect(times[0]).toBe(1);
    expect(times[29]).toBeCloseTo(1 + 29 / 30, 12);
  });
  it('letterboxes a 16:9 composition into a 9:16 frame', () => {
    const [zoom, , , , x, y] = fitMatrix(
      { width: 1280, height: 720 },
      1080,
      1920,
    );
    expect(zoom).toBeCloseTo(1080 / 1280, 12);
    expect(x).toBe(0);
    expect(y).toBeCloseTo((1920 - 720 * zoom) / 2, 9);
  });
  it('estimates the time left from the average frame time', () => {
    expect(remainingSeconds(0, 100, 1000)).toBeNull();
    expect(remainingSeconds(25, 100, 5000)).toBe(15);
  });
});

describe('[EXP-008] pre-flight', () => {
  it('lists the assets of enabled clips overlapping the range', () => {
    const composition = {
      tracks: [
        {
          clips: [
            { assetId: 'a', startTime: 0, duration: 2, enabled: true },
            { assetId: 'b', startTime: 2, duration: 2, enabled: true },
            { assetId: 'c', startTime: 0, duration: 4, enabled: false },
            { assetId: null, startTime: 0, duration: 4, enabled: true },
          ],
        },
      ],
    };
    expect(usedAssetIds(composition, 0, 4)).toEqual(['a', 'b']);
    expect(usedAssetIds(composition, 2, 4)).toEqual(['b']);
  });
});
