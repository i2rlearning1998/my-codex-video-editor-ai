import { describe, expect, it } from 'vitest';
import { isMotionSetting, motionReduced } from '../src/ui/motion';

describe('[QT-016] Settings › Animations resolution', () => {
  it('Auto follows the system, On never reduces, Off always reduces', () => {
    expect(motionReduced('auto', false)).toBe(false);
    expect(motionReduced('auto', true)).toBe(true);
    expect(motionReduced('on', true)).toBe(false);
    expect(motionReduced('on', false)).toBe(false);
    expect(motionReduced('off', false)).toBe(true);
    expect(motionReduced('off', true)).toBe(true);
  });
  it('accepts only the three settings', () => {
    expect(['auto', 'on', 'off'].every(isMotionSetting)).toBe(true);
    expect(isMotionSetting('reduce')).toBe(false);
    expect(isMotionSetting(null)).toBe(false);
  });
});
