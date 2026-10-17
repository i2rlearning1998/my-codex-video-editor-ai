import type { EncodedPacket, InputTrack } from 'mediabunny';
import { RecorderError } from './types';
/** Copy every encoded packet; use measured active recording time for a missing tail duration. */
export async function repairWebM(
  blob: Blob,
  durationSec: number,
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted) throw new RecorderError('ABORTED');
  if (!Number.isFinite(durationSec) || durationSec <= 0)
    throw new RecorderError('WEBM_REPAIR_FAILED');
  const {
    Input,
    BlobSource,
    ALL_FORMATS,
    Output,
    BufferTarget,
    WebMOutputFormat,
    EncodedPacketSink,
    EncodedAudioPacketSource,
    EncodedVideoPacketSource,
  } = await import('mediabunny');
  const input = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    }),
    target = new BufferTarget(),
    format = new WebMOutputFormat({ appendOnly: false }),
    output = new Output({ target, format });
  const abort = () => {
    input.dispose();
    void output.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  async function copy(
    track: InputTrack,
    add: (p: EncodedPacket) => Promise<void>,
  ) {
    const iterator = new EncodedPacketSink(track).packets();
    let current = await iterator.next();
    if (current.done) throw new RecorderError('WEBM_REPAIR_FAILED');
    while (!current.done) {
      if (signal?.aborted) throw new RecorderError('ABORTED');
      const next = await iterator.next(),
        packet = current.value;
      const duration =
        packet.duration > 0
          ? packet.duration
          : next.done
            ? durationSec - packet.timestamp
            : next.value.timestamp - packet.timestamp;
      if (!Number.isFinite(duration) || duration <= 0)
        throw new RecorderError('WEBM_REPAIR_FAILED');
      await add(packet.clone({ duration }));
      current = next;
    }
  }
  try {
    const jobs: (() => Promise<void>)[] = [];
    for (const track of await input.getTracks()) {
      if (track.isAudioTrack()) {
        const codec = await track.getCodec(),
          config = await track.getDecoderConfig();
        if (!codec || !config || !format.getSupportedCodecs().includes(codec))
          throw new RecorderError('WEBM_REPAIR_FAILED');
        const source = new EncodedAudioPacketSource(codec);
        output.addAudioTrack(source);
        jobs.push(() =>
          copy(track, (p) => source.add(p, { decoderConfig: config })),
        );
      } else if (track.isVideoTrack()) {
        const codec = await track.getCodec(),
          config = await track.getDecoderConfig();
        if (!codec || !config || !format.getSupportedCodecs().includes(codec))
          throw new RecorderError('WEBM_REPAIR_FAILED');
        const source = new EncodedVideoPacketSource(codec);
        output.addVideoTrack(source);
        jobs.push(() =>
          copy(track, (p) => source.add(p, { decoderConfig: config })),
        );
      } else throw new RecorderError('WEBM_REPAIR_FAILED');
    }
    if (!jobs.length) throw new RecorderError('WEBM_REPAIR_FAILED');
    if (signal?.aborted) throw new RecorderError('ABORTED');
    await output.start();
    await Promise.all(jobs.map((job) => job()));
    await output.finalize();
    if (signal?.aborted) throw new RecorderError('ABORTED');
    if (!target.buffer?.byteLength)
      throw new RecorderError('WEBM_REPAIR_FAILED');
    return new Blob([target.buffer], {
      type: blob.type.startsWith('audio/') ? 'audio/webm' : 'video/webm',
    });
  } catch (error) {
    await output.cancel().catch(() => {});
    if (signal?.aborted) throw new RecorderError('ABORTED');
    if (error instanceof RecorderError) throw error;
    throw new RecorderError('WEBM_REPAIR_FAILED');
  } finally {
    signal?.removeEventListener('abort', abort);
    input.dispose();
  }
}
