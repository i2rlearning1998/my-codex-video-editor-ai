import { it, expect } from 'vitest';
import {
  findRelinkCandidates,
  detectMissingMedia,
  relink,
  batchRelink,
  prepareRelink,
  type RelinkFile,
} from '../../src/media-probe/relink';
import { EditorEngine, type Asset } from '../../src/core';
import { MemoryMediaStore } from '../../src/media/store';
import fixture from '../fixtures/projects/av-sync.json';
const file: RelinkFile = {
  name: 'phone.mp4',
  size: 1000,
  mime: 'video/mp4',
  fingerprint: 'a'.repeat(32),
  details: {
    kind: 'video',
    container: 'video/mp4',
    videoCodec: 'avc',
    audioCodec: null,
    width: 1080,
    height: 1920,
    rotation: 90,
    fps: 30,
    isVariableFrameRate: true,
    durationSec: 5,
    audioChannels: null,
    sampleRate: null,
    bitrate: 1600,
    hasAudio: false,
    sizeBytes: 1000,
  },
};
const asset: Asset = {
  id: 'media-old',
  name: 'My title',
  type: 'video',
  source: { kind: 'local', reference: 'media/' + 'b'.repeat(32) },
  metadata: { fileName: 'phone.mp4', size: 1000, removed: true },
  width: 1080,
  height: 1920,
  duration: 5,
};
it('finds missing bytes on load without marking remote media missing', () => {
  expect(detectMissingMedia([asset], new Set())).toHaveLength(1);
  expect(
    detectMissingMedia([asset], new Set([asset.source.reference])),
  ).toEqual([]);
});
it('ranks name/size/duration/resolution, rejects incompatible kind, flags ties', () => {
  const missing = {
    id: asset.id,
    name: 'phone.mp4',
    size: 1000,
    duration: 5,
    width: 1080,
    height: 1920,
    kind: 'video',
  };
  expect(findRelinkCandidates(missing, [file])[0]?.score).toBe(12);
  expect(findRelinkCandidates({ ...missing, kind: 'audio' }, [file])).toEqual(
    [],
  );
  expect(
    batchRelink([asset], [file, { ...file, fingerprint: 'c'.repeat(32) }])
      .unresolved,
  ).toEqual([{ id: asset.id, reason: 'AMBIGUOUS' }]);
  expect(batchRelink([asset], [file]).replacements[0]?.id).toBe(asset.id);
});
it('relink preserves identity/custom metadata; old project scenes, clips and keys stay exact', () => {
  const updated = relink(asset, file);
  expect(updated.id).toBe(asset.id);
  expect(updated.name).toBe('My title');
  expect(updated.source.reference).toBe('media/' + file.fingerprint);
  expect(updated.metadata.removed).toBe(false);
  expect(asset.metadata.removed).toBe(true);
  const e = new EditorEngine(fixture),
    before = JSON.stringify(e.state.compositions);
  const target = e.state.assets.find((a) => a.type === 'video')!;
  const replacement = relink(JSON.parse(JSON.stringify(target)) as Asset, file);
  e.commands.execute({
    type: 'REPLACE_ASSET',
    assetId: target.id,
    asset: replacement,
  });
  expect(JSON.stringify(e.state.compositions)).toBe(before);
  e.undo();
  expect(JSON.parse(JSON.stringify(e.state.compositions))).toEqual(
    fixture.compositions,
  );
});
it('prepares bytes under a new key before relink, without overwriting the old key', async () => {
  const store = new MemoryMediaStore();
  await store.write(asset.source.reference, new Blob(['old']));
  const picked = new File(['new'], 'phone.mp4', { type: 'video/mp4' });
  const prepared = await prepareRelink(picked, store, {
    probe: async () => ({ ...file.details, sizeBytes: 3 }),
  });
  expect(await store.has('media/' + prepared.fingerprint)).toBe(true);
  expect(await (await store.read(asset.source.reference))!.text()).toBe('old');
});
