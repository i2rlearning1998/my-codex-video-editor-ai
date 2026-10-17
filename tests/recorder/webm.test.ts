import { it, expect } from 'vitest';
import {
  Output,
  WebMOutputFormat,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  Input,
  BlobSource,
  ALL_FORMATS,
  EncodedPacketSink,
} from 'mediabunny';
import { repairWebM } from '../../src/recorder';
it('remuxes an append-only Opus fixture with finite duration and cue index', async () => {
  const target = new BufferTarget(),
    output = new Output({
      target,
      format: new WebMOutputFormat({ appendOnly: true }),
    }),
    source = new EncodedAudioPacketSource('opus');
  output.addAudioTrack(source);
  await output.start();
  const data = new Uint8Array([0xf8, 0xff, 0xfe]);
  await source.add(new EncodedPacket(data, 'key', 0, 0.02), {
    decoderConfig: {
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 1,
      description: new Uint8Array([
        79, 112, 117, 115, 72, 101, 97, 100, 1, 1, 0, 0, 128, 187, 0, 0, 0, 0,
        0,
      ]),
    },
  });
  await source.add(new EncodedPacket(data, 'key', 0.02, 0.02));
  await output.finalize();
  const original = new Input({
    source: new BlobSource(new Blob([target.buffer!])),
    formats: ALL_FORMATS,
  });
  expect(await original.getDurationFromMetadata()).toBeNull();
  original.dispose();
  const repaired = await repairWebM(
    new Blob([target.buffer!], { type: 'audio/webm' }),
    0.04,
  );
  const input = new Input({
    source: new BlobSource(repaired),
    formats: ALL_FORMATS,
  });
  // MediaRecorder's missing container duration is the browser seekability defect.
  // computeDuration scans SimpleBlocks and this library omits the last Opus packet's
  // implicit duration; inspect the actual repaired Segment duration instead.
  expect(await input.getDurationFromMetadata()).toBeCloseTo(0.04, 3);
  const track = await input.getPrimaryAudioTrack();
  expect(track).not.toBeNull();
  const sink = new EncodedPacketSink(track!);
  const packet = await sink.getPacket(0.02);
  expect(packet?.data).toEqual(data);
  expect(packet?.timestamp).toBeCloseTo(0.02, 3);
  const bytes = new Uint8Array(await repaired.arrayBuffer());
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  expect(hex).toContain('1c53bb6b');
  expect(hex).toContain('4489');
  input.dispose();
});
it('rejects invalid WebM and already aborted repair with typed errors', async () => {
  await expect(repairWebM(new Blob(['bad']), 1)).rejects.toMatchObject({
    code: 'WEBM_REPAIR_FAILED',
  });
  const c = new AbortController();
  c.abort();
  await expect(repairWebM(new Blob(), 1, c.signal)).rejects.toMatchObject({
    code: 'ABORTED',
  });
});
