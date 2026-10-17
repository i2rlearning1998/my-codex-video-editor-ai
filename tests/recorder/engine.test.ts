import { it, expect, vi } from 'vitest';
import {
  startRecording,
  listDevices,
  getPermissionStates,
  selectRecordingMime,
  toMediaItem,
  type RecorderDependencies,
  type RecorderPort,
} from '../../src/recorder';
class Track extends EventTarget {
  readyState = 'live';
  constructor(readonly kind: string) {
    super();
  }
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
  getSettings() {
    return this.kind === 'video'
      ? { width: 1280, height: 720, frameRate: 30 }
      : {};
  }
}
const stream = (tracks: Track[]) =>
  ({
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  }) as unknown as MediaStream;
class Port implements RecorderPort {
  onData: ((b: Blob) => void) | undefined;
  onStop: (() => void) | undefined;
  onError: (() => void) | undefined;
  constructor(readonly mimeType: string) {}
  start = vi.fn();
  pause = vi.fn();
  resume = vi.fn();
  stop = vi.fn(() => {
    this.onData?.(new Blob(['frame']));
    this.onStop?.();
  });
}
function setup() {
  let now = 0;
  const callbacks = new Set<() => void>(),
    tracks: Track[] = [],
    ports: Port[] = [];
  const meter = { read: () => ({ peak: 0.5, rms: 0.25 }), close: vi.fn() };
  const create = (audio: boolean, video: boolean) => {
    const list = [
      ...(audio ? [new Track('audio')] : []),
      ...(video ? [new Track('video')] : []),
    ];
    tracks.push(...list);
    return stream(list);
  };
  const deps: RecorderDependencies = {
    devices: {
      enumerateDevices: vi.fn(async () => []),
      getUserMedia: vi.fn(async (c) =>
        create(Boolean(c?.audio), Boolean(c?.video)),
      ),
      getDisplayMedia: vi.fn(async () => create(false, true)),
    },
    queryPermission: async () => 'prompt',
    isTypeSupported: (m) => m.includes('mp4'),
    createRecorder: (_s, m) => {
      const p = new Port(m);
      ports.push(p);
      return p;
    },
    createStream: (t) => stream(t as unknown as Track[]),
    createMeter: () => meter,
    now: () => now,
    schedule: (fn) => {
      callbacks.add(fn);
      return () => {
        callbacks.delete(fn);
      };
    },
    repairWebM: vi.fn(async (b) => b),
  };
  return {
    deps,
    tracks,
    ports,
    meter,
    tick(ms: number) {
      now += ms;
      callbacks.forEach((fn) => fn());
    },
    callbacks,
  };
}
it('prefers MP4 and falls back to WebM with a typed unsupported error', () => {
  expect(selectRecordingMime(true, (m) => m === 'video/mp4')).toBe('video/mp4');
  expect(
    selectRecordingMime(false, (m) => m === 'audio/webm;codecs=opus'),
  ).toContain('webm');
  expect(() => selectRecordingMime(true, () => false)).toThrow();
});
it('exposes permissions/device data without opening devices', async () => {
  const s = setup();
  expect(await listDevices(s.deps)).toEqual([]);
  expect(await getPermissionStates(s.deps)).toEqual({
    camera: 'prompt',
    microphone: 'prompt',
  });
  expect(s.deps.devices.getUserMedia).not.toHaveBeenCalled();
});
it('counts down 3-2-1 then records, emits level and releases resources', async () => {
  const s = setup(),
    r = await startRecording({ mode: 'camera' }, s.deps),
    updates = vi.fn();
  r.subscribe(updates);
  expect(r.snapshot().countdown).toBe(3);
  s.tick(1000);
  expect(r.snapshot().countdown).toBe(2);
  s.tick(1000);
  expect(r.snapshot().countdown).toBe(1);
  s.tick(1000);
  expect(s.ports[0]?.start).toHaveBeenCalledOnce();
  s.tick(1500);
  expect(r.snapshot().level).toEqual({ peak: 0.5, rms: 0.25 });
  const output = await r.stop();
  expect(output).toMatchObject({
    durationSec: 1.5,
    width: 1280,
    height: 720,
    fps: 30,
  });
  expect(s.tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
  expect(s.meter.close).toHaveBeenCalledOnce();
  expect(s.callbacks.size).toBe(0);
});
it('pause duration is excluded and resume/stop are coordinated', async () => {
  const s = setup(),
    r = await startRecording(
      { mode: 'microphone', countdownSeconds: 0 },
      s.deps,
    );
  s.tick(1000);
  r.pause();
  s.tick(4000);
  expect(r.snapshot().elapsedSec).toBe(1);
  r.resume();
  s.tick(2000);
  expect((await r.stop()).durationSec).toBe(3);
  expect(s.ports[0]?.pause).toHaveBeenCalledOnce();
  expect(s.ports[0]?.resume).toHaveBeenCalledOnce();
  expect(await r.stop()).toBe(await r.result);
});
it('records screen+camera separately with PIP data and shared pause/stop', async () => {
  const s = setup(),
    r = await startRecording(
      { mode: 'screen+camera', countdownSeconds: 0 },
      s.deps,
    );
  expect(s.ports).toHaveLength(2);
  r.pause();
  r.resume();
  s.tick(1000);
  const out = await r.stop();
  expect(out.camera).toMatchObject({
    width: 1280,
    height: 720,
    fps: 30,
    layout: { x: 0.72, y: 0.7 },
  });
  expect(s.ports.every((p) => p.stop.mock.calls.length === 1)).toBe(true);
});
it('screen+mic asks for display without system sound and a separate mic', async () => {
  const s = setup(),
    r = await startRecording(
      { mode: 'screen+mic', countdownSeconds: 0, microphoneId: 'mic' },
      s.deps,
    );
  expect(s.deps.devices.getDisplayMedia).toHaveBeenCalledWith({
    video: true,
    audio: false,
  });
  expect(s.deps.devices.getUserMedia).toHaveBeenCalledWith({
    audio: { deviceId: { exact: 'mic' } },
  });
  s.tick(1000);
  await r.stop();
});
it('auto stops at max duration and supports discard before countdown ends', async () => {
  const s = setup(),
    r = await startRecording(
      { mode: 'camera', countdownSeconds: 0, maxDurationSec: 1 },
      s.deps,
    );
  s.tick(1000);
  expect((await r.result).durationSec).toBe(1);
  const second = setup(),
    r2 = await startRecording({ mode: 'screen' }, second.deps);
  r2.discard();
  await expect(r2.result).rejects.toMatchObject({ code: 'ABORTED' });
  expect(second.ports[0]?.start).not.toHaveBeenCalled();
  expect(second.tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
});
it('permission failures stop previously acquired screen tracks', async () => {
  const s = setup();
  s.deps.devices.getUserMedia = async () => {
    throw new DOMException('private', 'NotAllowedError');
  };
  await expect(
    startRecording({ mode: 'screen+mic' }, s.deps),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  expect(s.tracks[0]?.stop).toHaveBeenCalledOnce();
});
it('cancels pending permission and stops late arriving tracks', async () => {
  const s = setup(),
    controller = new AbortController();
  let resolve!: (s: MediaStream) => void;
  s.deps.devices.getUserMedia = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = startRecording(
    { mode: 'camera', signal: controller.signal },
    s.deps,
  );
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  const t = new Track('video');
  resolve(stream([t]));
  await Promise.resolve();
  expect(t.stop).toHaveBeenCalledOnce();
});
it('abort and memory limit discard output, no browser/network involved', async () => {
  const s = setup(),
    controller = new AbortController(),
    r = await startRecording(
      { mode: 'microphone', countdownSeconds: 0, signal: controller.signal },
      s.deps,
    );
  controller.abort();
  await expect(r.result).rejects.toMatchObject({ code: 'ABORTED' });
  const s2 = setup(),
    r2 = await startRecording(
      { mode: 'microphone', countdownSeconds: 0, maxBytes: 1 },
      s2.deps,
    );
  s2.ports[0]?.onData?.(new Blob(['too big']));
  await expect(r2.result).rejects.toMatchObject({ code: 'STORAGE_LIMIT' });
});
it('screen sharing ended finalizes safely; failed recorder rejects', async () => {
  const s = setup(),
    r = await startRecording({ mode: 'screen', countdownSeconds: 0 }, s.deps);
  s.tick(1000);
  s.tracks[0]?.dispatchEvent(new Event('ended'));
  expect((await r.result).durationSec).toBe(1);
  const s2 = setup(),
    r2 = await startRecording({ mode: 'camera', countdownSeconds: 0 }, s2.deps);
  s2.ports[0]?.onError?.();
  await expect(r2.result).rejects.toMatchObject({ code: 'RECORDING_FAILED' });
  expect(s2.callbacks.size).toBe(0);
});
it('uses WebM repair and keeps external abort active during finalization', async () => {
  const s = setup(),
    controller = new AbortController();
  s.deps.isTypeSupported = (m) => m === 'video/webm';
  let release!: (b: Blob) => void;
  s.deps.repairWebM = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const r = await startRecording(
    { mode: 'camera', countdownSeconds: 0, signal: controller.signal },
    s.deps,
  );
  s.tick(1000);
  const out = r.stop();
  controller.abort();
  release(new Blob(['fixed']));
  await expect(out).rejects.toMatchObject({ code: 'ABORTED' });
  expect(s.meter.close).toHaveBeenCalledOnce();
});
it('creates media-store Asset references without writing into project state', async () => {
  const item = await toMediaItem(
    {
      blob: new Blob(['fixture'], { type: 'audio/mp4' }),
      mime: 'audio/mp4',
      durationSec: 2,
      width: 0,
      height: 0,
      fps: 0,
    },
    'Narration',
  );
  expect(item.asset).toMatchObject({
    type: 'audio',
    duration: 2,
    name: 'Narration',
    source: { kind: 'local', reference: item.storageKey },
  });
  expect(item.storageKey).toMatch(/^media\/[a-f0-9]{32}$/);
});
it('requests recorder stop before releasing capture tracks', async () => {
  const s = setup(),
    r = await startRecording({ mode: 'camera', countdownSeconds: 0 }, s.deps);
  const port = s.ports[0]!;
  port.stop.mockImplementation(() => {
    expect(s.tracks.every((t) => t.readyState === 'live')).toBe(true);
    port.onData?.(new Blob(['frame']));
    port.onStop?.();
  });
  s.tick(1000);
  await r.stop();
  expect(s.tracks.every((t) => t.readyState === 'ended')).toBe(true);
});
it('keeps video kind when device dimensions are unknown and preserves camera-specific metadata', async () => {
  const out = await toMediaItem({
    blob: new Blob(['screen'], { type: 'video/mp4' }),
    mime: 'video/mp4',
    durationSec: 1,
    width: 0,
    height: 0,
    fps: 30,
    camera: {
      blob: new Blob(['camera'], { type: 'video/mp4' }),
      mime: 'video/mp4',
      width: 640,
      height: 480,
      fps: 24,
      layout: { x: 0, y: 0, width: 0.25, height: 0.25 },
    },
  });
  expect(out.asset.type).toBe('video');
  expect(out.camera?.asset).toMatchObject({
    width: 640,
    height: 480,
    metadata: { recording: { fps: 24 } },
  });
});
