import { clipAudioDetached, clipTimeEffects } from '../core';
import { locateLayer } from '../render/adapter';
import { assetFingerprint, mediaKey } from './import';
import type { PreviewAsset } from './previews';
import type { MediaStore } from './store';

/** Largest file decoded for playback and waveforms (it is decoded whole). */
export const MAX_DECODE_BYTES = 512 * 1024 * 1024;
export const WAVE_RATE = 100;
const DECODE_RATE = 48_000;
const RESYNC_SECONDS = 0.05;
const SNIPPET_SECONDS = 0.08;

/** A clip the engine may play, flattened from the canonical composition. */
export interface AudibleClip {
  readonly clipId: string;
  readonly trackId: string;
  /** The asset whose bytes hold the sound (a video for detached audio). */
  readonly sourceAssetId: string;
  readonly startTime: number;
  readonly duration: number;
  readonly sourceIn: number;
  readonly sourceOut: number;
  readonly speed: number;
  readonly reversed: boolean;
}

/**
 * Pure scheduling maths (unit-tested): for transport `time`, where in the buffer a
 * clip starts, how long it plays and how far in the future it begins.
 */
export function clipSchedule(
  clip: AudibleClip,
  time: number,
  bufferDuration: number,
): { delay: number; offset: number; length: number } | null {
  const end = clip.startTime + clip.duration;
  if (time >= end) return null;
  const local = Math.max(0, time - clip.startTime);
  const delay = Math.max(0, clip.startTime - time);
  const sourceStart = clip.reversed
    ? clip.sourceOut - local * clip.speed
    : clip.sourceIn + local * clip.speed;
  const length = (clip.duration - local) * clip.speed;
  // Reversed clips read a reversed copy: source s sits at bufferDuration - s.
  const offset = clip.reversed ? bufferDuration - sourceStart : sourceStart;
  if (length <= 1e-6 || offset < 0 || offset >= bufferDuration) return null;
  return { delay, offset, length: Math.min(length, bufferDuration - offset) };
}

/** A reversed copy, for reversed clips (read with `clipSchedule` offsets). */
export function reverseAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const reversed = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let channel = 0; channel < buffer.numberOfChannels; channel++)
    reversed.copyToChannel(
      buffer.getChannelData(channel).slice().reverse(),
      channel,
    );
  return reversed;
}

/** Peak bytes (0..255) at WAVE_RATE per second, the max over all channels. */
export function waveformPeaks(buffer: {
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}): Uint8Array {
  const count = Math.max(1, Math.ceil(buffer.duration * WAVE_RATE));
  const peaks = new Uint8Array(count);
  const step = buffer.sampleRate / WAVE_RATE;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < count; index++) {
      let peak = 0;
      const end = Math.min(data.length, Math.floor((index + 1) * step));
      for (let sample = Math.floor(index * step); sample < end; sample++)
        peak = Math.max(peak, Math.abs(data[sample]!));
      peaks[index] = Math.max(
        peaks[index]!,
        Math.min(255, Math.round(peak * 255)),
      );
    }
  }
  return peaks;
}

type Decoded = AudioBuffer | 'silent' | 'too-large' | 'missing';

/** Decodes each audio-bearing asset once (no user gesture needed). */
export class AudioDecoder {
  readonly #decoded = new Map<string, Promise<Decoded>>();
  constructor(
    private readonly store: Promise<MediaStore | null>,
    private readonly assets: () => readonly PreviewAsset[],
  ) {}
  decode(assetId: string): Promise<Decoded> {
    let known = this.#decoded.get(assetId);
    if (!known) {
      known = this.#load(assetId);
      this.#decoded.set(assetId, known);
      // Bytes may arrive later (an import restores them): do not cache their absence.
      void known.then((result) => {
        if (result === 'missing') this.#decoded.delete(assetId);
      });
    }
    return known;
  }
  async #load(assetId: string): Promise<Decoded> {
    const asset = this.assets().find((item) => item.id === assetId);
    const fingerprint = asset && assetFingerprint(asset);
    const store = await this.store;
    const blob =
      fingerprint && store ? await store.read(mediaKey(fingerprint)) : null;
    if (!blob) return 'missing';
    if (blob.size > MAX_DECODE_BYTES) return 'too-large';
    try {
      const context = new OfflineAudioContext(1, 1, DECODE_RATE);
      return await context.decodeAudioData(await blob.arrayBuffer());
    } catch {
      return 'silent'; // No audio track, or a codec this browser lacks.
    }
  }
}

/** The source asset behind an audio asset: detached audio reads its video's bytes. */
export function soundSource(
  asset: PreviewAsset,
  assets: readonly PreviewAsset[],
): PreviewAsset | undefined {
  const derived = /^audio-of:(.+)$/.exec(asset.source.reference);
  return asset.source.kind === 'generated' && derived
    ? assets.find((item) => item.id === derived[1])
    : asset;
}

export type Waveform =
  | { readonly state: 'loading' | 'none' }
  | {
      readonly state: 'ready';
      readonly peaks: Uint8Array;
      /** Loudest peak, so drawings can be normalised to the file. */
      readonly max: number;
    };
export const waveKey = (fingerprint: string) => `waves/${fingerprint}`;

/** MED-019: waveform peaks made in the background and cached in the media store. */
export class WaveformCache {
  readonly #entries = new Map<string, Waveform>();
  readonly #listeners = new Set<() => void>();
  #queue = Promise.resolve();
  #disposed = false;
  constructor(
    private readonly store: Promise<MediaStore | null>,
    private readonly decoder: AudioDecoder,
    private readonly assets: () => readonly PreviewAsset[],
  ) {}
  waveform(asset: PreviewAsset): Waveform {
    const source = soundSource(asset, this.assets());
    const fingerprint = source && assetFingerprint(source);
    if (!source || !fingerprint) return { state: 'none' };
    const known = this.#entries.get(fingerprint);
    if (known) return known;
    this.#entries.set(fingerprint, { state: 'loading' });
    this.#queue = this.#queue.then(async () => {
      let result: Waveform = { state: 'none' };
      try {
        const store = await this.store;
        const cached = store ? await store.read(waveKey(fingerprint)) : null;
        let peaks = cached ? new Uint8Array(await cached.arrayBuffer()) : null;
        if (!peaks) {
          const decoded = await this.decoder.decode(source.id);
          if (decoded instanceof AudioBuffer) {
            peaks = waveformPeaks(decoded);
            await store?.write(
              waveKey(fingerprint),
              new Blob([peaks], { type: 'application/octet-stream' }),
            );
          }
        }
        if (peaks)
          result = {
            state: 'ready',
            peaks,
            max: peaks.reduce((max, value) => Math.max(max, value), 1),
          };
      } catch {
        // A waveform is optional.
      }
      if (this.#disposed) return;
      this.#entries.set(fingerprint, result);
      for (const listener of this.#listeners) listener();
    });
    return { state: 'loading' };
  }
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  retry(): void {
    for (const [key, entry] of this.#entries)
      if (entry.state === 'none') this.#entries.delete(key);
    for (const listener of this.#listeners) listener();
  }
  dispose(): void {
    this.#disposed = true;
    this.#listeners.clear();
  }
}

export interface AudioDebug {
  state: string;
  /** Transport time now audible (latency-compensated), or null when silent. */
  position: number | null;
  sources: { clipId: string; trackId: string; rate: number }[];
  level: number;
  snippets: number;
  lastSnippet: { time: number; clipIds: string[] } | null;
  /** Buffers decoded and ready to play. */
  decoded: number;
}

interface Playing {
  node: AudioBufferSourceNode;
  clip: AudibleClip;
}

/**
 * Web Audio playback (AUD-005, PB-010, PB-011). Every audible clip is scheduled
 * from the transport's continuous clock; any change reschedules everything.
 */
export class AudioEngine {
  #context: AudioContext | null = null;
  #master: GainNode | null = null;
  #analyser: AnalyserNode | null = null;
  readonly #reversed = new WeakMap<AudioBuffer, AudioBuffer>();
  readonly #ready = new Map<string, AudioBuffer | null>();
  #playing: Playing[] = [];
  /** Transport `clock` was scheduled at context time `context`; heard `latency` later. */
  #anchor: { clock: number; context: number; latency: number } | null = null;
  #signature = '';
  #snippets = 0;
  #lastSnippet: AudioDebug['lastSnippet'] = null;
  #lastSnippetAt = -Infinity;
  #trailing: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;

  constructor(
    private readonly decoder: AudioDecoder,
    private readonly changed: () => void,
  ) {}

  /** Call on every transport or project change with the current audible clips. */
  sync(playing: boolean, clock: number, clips: readonly AudibleClip[]): void {
    if (this.#disposed) return;
    if (!playing) {
      this.#stopAll();
      // Once audio has been used, decode ahead so scrub snippets can sound.
      if (this.#context)
        for (const clip of clips) this.#buffer(clip.sourceAssetId);
      return;
    }
    const context = this.#ensureContext();
    const buffers = clips.map((clip) => this.#buffer(clip.sourceAssetId));
    const signature = JSON.stringify([clips, buffers.map(Boolean)]);
    const scheduled = this.#anchor
      ? this.#anchor.clock + (context.currentTime - this.#anchor.context)
      : null;
    if (
      signature === this.#signature &&
      scheduled !== null &&
      Math.abs(scheduled - clock) <= RESYNC_SECONDS
    )
      return;
    this.#stopAll();
    this.#signature = signature;
    // Latency compensation: what starts now is heard `latency` seconds later.
    const latency = context.baseLatency + (context.outputLatency || 0);
    const start = context.currentTime;
    this.#anchor = { clock, context: start, latency };
    clips.forEach((clip, index) => {
      const buffer = buffers[index];
      if (!buffer) return;
      const source = clip.reversed ? this.#reverse(buffer) : buffer;
      const plan = clipSchedule(clip, clock, source.duration);
      if (!plan) return;
      const node = context.createBufferSource();
      node.buffer = source;
      node.playbackRate.value = clip.speed;
      node.connect(this.#master!);
      // Starting `latency` early in the clip makes the heard sound match the clock.
      const early = plan.delay > latency ? 0 : latency - plan.delay;
      node.start(
        start + Math.max(0, plan.delay - latency),
        plan.offset + early * clip.speed,
        Math.max(0, plan.length - early * clip.speed),
      );
      this.#playing.push({ node, clip });
      node.onended = () => {
        this.#playing = this.#playing.filter((item) => item.node !== node);
      };
    });
  }

  /** PB-011: a short snippet of every audible clip under a paused playhead. */
  scrub(time: number, clips: readonly AudibleClip[]): void {
    if (this.#disposed) return;
    const now = performance.now();
    const wait = SNIPPET_SECONDS * 1000 - (now - this.#lastSnippetAt);
    if (wait > 0) {
      // Throttled: play the latest position once the current snippet ends.
      clearTimeout(this.#trailing);
      this.#trailing = setTimeout(() => this.scrub(time, clips), wait);
      return;
    }
    const under = clips.filter(
      (clip) => time >= clip.startTime && time < clip.startTime + clip.duration,
    );
    if (!under.length) return;
    this.#lastSnippetAt = now;
    const context = this.#ensureContext();
    const clipIds: string[] = [];
    for (const clip of under) {
      const buffer = this.#buffer(clip.sourceAssetId);
      if (!buffer) continue;
      const source = clip.reversed ? this.#reverse(buffer) : buffer;
      const plan = clipSchedule(clip, time, source.duration);
      if (!plan) continue;
      const node = context.createBufferSource();
      node.buffer = source;
      node.playbackRate.value = clip.speed;
      node.connect(this.#master!);
      node.start(
        context.currentTime,
        plan.offset,
        Math.min(plan.length, SNIPPET_SECONDS * clip.speed),
      );
      clipIds.push(clip.clipId);
    }
    if (clipIds.length) {
      this.#snippets++;
      this.#lastSnippet = { time, clipIds };
    }
  }

  get debug(): AudioDebug {
    let level = 0;
    if (this.#analyser) {
      const data = new Float32Array(this.#analyser.fftSize);
      this.#analyser.getFloatTimeDomainData(data);
      level = Math.sqrt(
        data.reduce((sum, value) => sum + value * value, 0) / data.length,
      );
    }
    return {
      state: this.#context?.state ?? 'none',
      position: this.#position(),
      sources: this.#playing.map(({ clip }) => ({
        clipId: clip.clipId,
        trackId: clip.trackId,
        rate: clip.speed,
      })),
      level,
      snippets: this.#snippets,
      lastSnippet: this.#lastSnippet,
      decoded: [...this.#ready.values()].filter(Boolean).length,
    };
  }

  dispose(): void {
    this.#disposed = true;
    clearTimeout(this.#trailing);
    this.#stopAll();
    void this.#context?.close().catch(() => undefined);
  }

  #position(): number | null {
    if (!this.#anchor || !this.#context || !this.#playing.length) return null;
    // Offsets were advanced by the output latency, so what is heard now is the clock.
    return (
      this.#anchor.clock + (this.#context.currentTime - this.#anchor.context)
    );
  }

  #ensureContext(): AudioContext {
    if (!this.#context) {
      this.#context = new AudioContext({ latencyHint: 'interactive' });
      this.#master = this.#context.createGain();
      this.#analyser = this.#context.createAnalyser();
      this.#master.connect(this.#analyser);
      this.#analyser.connect(this.#context.destination);
    }
    if (this.#context.state === 'suspended')
      void this.#context.resume().catch(() => undefined);
    return this.#context;
  }

  #buffer(assetId: string): AudioBuffer | null {
    if (this.#ready.has(assetId)) return this.#ready.get(assetId) ?? null;
    this.#ready.set(assetId, null); // Pending until decoded.
    void this.decoder.decode(assetId).then((decoded) => {
      if (this.#disposed) return;
      if (decoded === 'missing') this.#ready.delete(assetId);
      else
        this.#ready.set(
          assetId,
          decoded instanceof AudioBuffer ? decoded : null,
        );
      if (decoded instanceof AudioBuffer) this.changed();
    });
    return null;
  }

  #reverse(buffer: AudioBuffer): AudioBuffer {
    let reversed = this.#reversed.get(buffer);
    if (!reversed) {
      reversed = reverseAudioBuffer(buffer);
      this.#reversed.set(buffer, reversed);
    }
    return reversed;
  }

  #stopAll(): void {
    for (const { node } of this.#playing) {
      node.onended = null;
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
      node.disconnect();
    }
    this.#playing = [];
    this.#anchor = null;
    this.#signature = '';
  }
}

/** The composition fields `listAudibleClips` reads (structural: shallow types). */
interface AudibleComposition {
  readonly layers: readonly unknown[];
  readonly tracks: readonly {
    readonly id: string;
    readonly muted: boolean;
    readonly clips: readonly {
      readonly id: string;
      readonly layerId: string;
      readonly assetId: string | null;
      readonly enabled: boolean;
      readonly startTime: number;
      readonly duration: number;
      readonly sourceIn: number;
      readonly sourceOut: number;
      readonly speed: number;
      readonly metadata: object;
    }[];
  }[];
}

/**
 * Every clip that can sound (D-061), for playback and for the export mixdown:
 * audio-track clips and video clips whose audio is not detached, enabled, on
 * unmuted tracks (and soloed ones when any track is soloed). Frozen clips are silent.
 */
export function listAudibleClips(
  composition: unknown,
  assets: readonly PreviewAsset[],
  soloTrackIds: readonly string[] = [],
): AudibleClip[] {
  const view = composition as AudibleComposition;
  const layers = view.layers as Parameters<typeof locateLayer>[0];
  const clips: AudibleClip[] = [];
  for (const track of view.tracks) {
    if (
      track.muted ||
      (soloTrackIds.length && !soloTrackIds.includes(track.id))
    )
      continue;
    for (const clip of track.clips) {
      const layer = locateLayer(layers, clip.layerId)?.layer;
      const asset = assets.find((item) => item.id === clip.assetId);
      const effects = clipTimeEffects(clip);
      if (
        !clip.enabled ||
        !layer ||
        !asset ||
        effects.freezeFrame !== null ||
        !(
          layer.type === 'audio' ||
          (layer.type === 'video' && !clipAudioDetached(clip))
        )
      )
        continue;
      const source = soundSource(asset, assets);
      if (!source) continue;
      clips.push({
        clipId: clip.id,
        trackId: track.id,
        sourceAssetId: source.id,
        startTime: clip.startTime,
        duration: clip.duration,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
        speed: clip.speed,
        reversed: effects.reversed,
      });
    }
  }
  return clips;
}
