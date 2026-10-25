import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkGlb,
  GlbError,
  glbToTierCSource,
  GLB_MAX_BYTES,
} from '../src/code-layer/glb-source';

const cube = new Uint8Array(readFileSync('tests/fixtures/models/cube.glb'));

describe('P13D glb source', () => {
  it('[P13D-001] turns a model into a self-contained Tier C module under the 1 MiB source limit', () => {
    const source = glbToTierCSource(cube, 'My Cube.glb');
    expect(source).toContain('"libs": [');
    expect(source).toContain('GLTFLoader');
    expect(source.length).toBeLessThan(1_048_576);
    expect(source).toContain('3D / My Cube');
  });
  it('[P13D-002] refuses non-models, cut-off files and oversized models with a sentence', () => {
    expect(() =>
      checkGlb(new TextEncoder().encode('{"not":"a model at all, sorry"}')),
    ).toThrow(GlbError);
    expect(() => checkGlb(cube.subarray(0, cube.length - 8))).toThrow(
      /cut off/,
    );
    const big = new Uint8Array(GLB_MAX_BYTES + 1);
    big.set(cube.subarray(0, 12));
    new DataView(big.buffer).setUint32(8, big.length, true);
    expect(() => checkGlb(big)).toThrow(/KB/);
  });
});
