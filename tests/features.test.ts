// Phase 1 library brief, P1-30: feature keys for later plans.
import { describe, expect, it } from 'vitest';
import {
  FEATURE_KEYS,
  featureState,
  isEnabled,
} from '../src/features/registry';

describe('feature registry', () => {
  it('[LIB-030] keys are unique and well formed, and every feature is on (no billing yet)', () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
    for (const key of FEATURE_KEYS) {
      expect(key).toMatch(/^[a-z0-9]+(\.[a-z0-9-]+)*$/);
      expect(isEnabled(key)).toBe(true);
      expect(featureState(key)).toBe('on');
    }
    for (const key of [
      'export.mp4',
      'ai.autocut',
      'fx.chroma-key',
      'camera',
      'cloud.save',
      'mcp.access',
    ])
      expect(FEATURE_KEYS).toContain(key);
  });
});
