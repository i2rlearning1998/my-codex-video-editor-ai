import { browserRecorderDependencies } from './browser';
import {
  RecorderError,
  type RecorderDependencies,
  type RecorderPort,
  type RecordingOptions,
  type RecordingOutput,
  type RecordingSession,
  type RecordingState,
} from './types';
export function selectRecordingMime(
  video: boolean,
  supported: (mime: string) => boolean,
): string {
  const candidates = video
    ? [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ]
    : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  const mime = candidates.find(supported);
  if (!mime) throw new RecorderError('UNSUPPORTED');
  return mime;
}
export async function listDevices(deps = browserRecorderDependencies()) {
  try {
    return (await deps.devices.enumerateDevices())
      .filter((d) => d.kind === 'audioinput' || d.kind === 'videoinput')
      .map((d) => ({
        id: d.deviceId,
        kind: d.kind,
        label: d.label,
        groupId: d.groupId,
      }));
  } catch {
    throw new RecorderError('DEVICE_NOT_FOUND');
  }
}
export async function getPermissionStates(
  deps = browserRecorderDependencies(),
) {
  const [camera, microphone] = await Promise.all([
    deps.queryPermission('camera'),
    deps.queryPermission('microphone'),
  ]);
  return { camera, microphone };
}
function failure(error: unknown): RecorderError {
  if (error instanceof RecorderError) return error;
  const name = error instanceof Error ? error.name : '';
  return new RecorderError(
    name === 'NotAllowedError'
      ? 'PERMISSION_DENIED'
      : name === 'NotFoundError'
        ? 'DEVICE_NOT_FOUND'
        : name === 'NotReadableError'
          ? 'DEVICE_BUSY'
          : 'RECORDING_FAILED',
  );
}
export async function startRecording(
  options: RecordingOptions,
  deps: RecorderDependencies = browserRecorderDependencies(),
): Promise<RecordingSession> {
  const max = options.maxDurationSec ?? 3600,
    limit = options.maxBytes ?? 200 * 1024 * 1024,
    countdown = options.countdownSeconds ?? 3,
    pip = options.pip ?? { x: 0.72, y: 0.7, width: 0.25, height: 0.25 };
  if (
    !['camera', 'screen', 'microphone', 'screen+mic', 'screen+camera'].includes(
      options.mode,
    ) ||
    !Number.isFinite(max) ||
    max <= 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    ![0, 3].includes(countdown) ||
    ![pip.x, pip.y, pip.width, pip.height].every(Number.isFinite) ||
    pip.x < 0 ||
    pip.y < 0 ||
    pip.width <= 0 ||
    pip.height <= 0 ||
    pip.x + pip.width > 1 ||
    pip.y + pip.height > 1
  )
    throw new RecorderError('INVALID_OPTIONS');
  if (options.signal?.aborted) throw new RecorderError('ABORTED');
  const owned: MediaStream[] = [];
  const release = () => {
    for (const stream of owned)
      for (const track of stream.getTracks()) track.stop();
  };
  async function acquire(promise: Promise<MediaStream>) {
    return new Promise<MediaStream>((resolve, reject) => {
      const abort = () => reject(new RecorderError('ABORTED'));
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      void promise
        .then((stream) => {
          if (options.signal?.aborted) {
            stream.getTracks().forEach((t) => t.stop());
            reject(new RecorderError('ABORTED'));
          } else {
            owned.push(stream);
            resolve(stream);
          }
        }, reject)
        .finally(() => options.signal?.removeEventListener('abort', abort));
    });
  }
  let main: MediaStream, camera: MediaStream | undefined;
  try {
    const audio = options.microphoneId
        ? { deviceId: { exact: options.microphoneId } }
        : true,
      video = options.cameraId
        ? { deviceId: { exact: options.cameraId } }
        : true;
    if (options.mode.startsWith('screen')) {
      const screen = await acquire(
        deps.devices.getDisplayMedia({ video: true, audio: false }),
      );
      const tracks: MediaStreamTrack[] = [...screen.getVideoTracks()];
      if (options.mode === 'screen+mic') {
        const mic = await acquire(deps.devices.getUserMedia({ audio }));
        tracks.push(...mic.getAudioTracks());
      }
      if (options.mode === 'screen+camera') {
        const cam = await acquire(
          deps.devices.getUserMedia({
            video,
            audio: options.includeAudio !== false ? audio : false,
          }),
        );
        camera = deps.createStream(cam.getVideoTracks());
        tracks.push(...cam.getAudioTracks());
      }
      main = deps.createStream(tracks);
    } else
      main = await acquire(
        deps.devices.getUserMedia({
          audio:
            options.mode === 'microphone' || options.includeAudio !== false
              ? audio
              : false,
          video: options.mode === 'camera' ? video : false,
        }),
      );
    if (
      !main.getTracks().length ||
      main.getTracks().some((t) => t.readyState === 'ended')
    )
      throw new RecorderError('DEVICE_NOT_FOUND');
  } catch (error) {
    release();
    throw failure(error);
  }
  let ports: RecorderPort[];
  let meter: ReturnType<RecorderDependencies['createMeter']>;
  try {
    ports = [
      deps.createRecorder(
        main,
        selectRecordingMime(
          main.getVideoTracks().length > 0,
          deps.isTypeSupported,
        ),
      ),
    ];
    if (camera)
      ports.push(
        deps.createRecorder(
          camera,
          selectRecordingMime(true, deps.isTypeSupported),
        ),
      );
    meter = deps.createMeter(main);
  } catch (error) {
    release();
    throw failure(error);
  }
  const settings = main.getVideoTracks()[0]?.getSettings() ?? {};
  const cameraSettings = camera?.getVideoTracks()[0]?.getSettings() ?? {};
  let cleaned = false;
  const listeners = new Set<(s: RecordingState) => void>();
  let state: RecordingState = {
    status: 'countdown',
    countdown,
    elapsedSec: 0,
    level: { peak: 0, rms: 0 },
  };
  let activeAt = 0,
    accumulated = 0,
    bytes = 0,
    started = false,
    finished = 0;
  const chunks: Blob[][] = ports.map(() => []);
  let cancelTimer = () => {};
  const repairController = new AbortController();
  let resolveResult!: (r: RecordingOutput) => void,
    rejectResult!: (e: RecorderError) => void;
  const result = new Promise<RecordingOutput>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  void result.catch(() => {});
  const snapshot = () => ({ ...state, level: { ...state.level } });
  const emit = () => {
    for (const listener of listeners) {
      try {
        listener(snapshot());
      } catch {
        /* A subscriber cannot break cleanup. */
      }
    }
  };
  const elapsed = () =>
    accumulated +
    (state.status === 'recording'
      ? Math.max(0, deps.now() - activeAt) / 1000
      : 0);
  const onEnded = () => {
    if (state.status === 'recording' || state.status === 'paused')
      void stop().catch(() => {});
    else if (state.status === 'countdown') discard();
  };
  const cleanup = () => {
    cancelTimer();
    if (['stopped', 'discarded', 'error'].includes(state.status))
      options.signal?.removeEventListener('abort', discard);
    if (cleaned) return;
    cleaned = true;
    for (const stream of owned)
      for (const track of stream.getTracks())
        track.removeEventListener('ended', onEnded);
    release();
    meter.close();
  };
  function fail(error: RecorderError) {
    if (['stopped', 'discarded', 'error'].includes(state.status)) return;
    state = {
      ...state,
      status: error.code === 'ABORTED' ? 'discarded' : 'error',
      error: error.code,
    };
    repairController.abort();
    cleanup();
    for (const p of ports) {
      try {
        if (started) p.stop();
      } catch {
        /* Already stopped. */
      }
    }
    chunks.forEach((c) => c.splice(0));
    rejectResult(error);
    emit();
  }
  function discard() {
    fail(new RecorderError('ABORTED'));
  }
  async function finalize() {
    try {
      const blobs: Blob[] = [];
      for (const [i, p] of ports.entries()) {
        const blob = new Blob(chunks[i], { type: p.mimeType });
        if (!blob.size) throw new RecorderError('RECORDING_FAILED');
        blobs.push(
          p.mimeType.includes('webm')
            ? await deps.repairWebM(
                blob,
                state.elapsedSec,
                repairController.signal,
              )
            : blob,
        );
      }
      if (repairController.signal.aborted) return;
      const output: RecordingOutput = {
        blob: blobs[0]!,
        mime: blobs[0]!.type,
        durationSec: state.elapsedSec,
        width: settings.width ?? 0,
        height: settings.height ?? 0,
        fps: settings.frameRate ?? 0,
        ...(blobs[1]
          ? {
              camera: {
                blob: blobs[1],
                mime: blobs[1].type,
                width: cameraSettings.width ?? 0,
                height: cameraSettings.height ?? 0,
                fps: cameraSettings.frameRate ?? 0,
                layout: { ...pip },
              },
            }
          : {}),
      };
      state = { ...state, status: 'stopped' };
      options.signal?.removeEventListener('abort', discard);
      chunks.forEach((c) => c.splice(0));
      resolveResult(output);
      emit();
    } catch (error) {
      fail(failure(error));
    }
  }
  ports.forEach((p, i) => {
    p.onData = (blob) => {
      if (['discarded', 'error', 'stopped'].includes(state.status)) return;
      bytes += blob.size;
      if (bytes > limit) {
        fail(new RecorderError('STORAGE_LIMIT'));
        return;
      }
      chunks[i]!.push(blob);
    };
    p.onError = () => fail(new RecorderError('RECORDING_FAILED'));
    p.onStop = () => {
      if (['error', 'discarded', 'stopped'].includes(state.status)) return;
      if (state.status !== 'stopping') {
        accumulated = elapsed();
        state = { ...state, status: 'stopping', elapsedSec: accumulated };
        cancelTimer();
        ports.forEach((other) => {
          if (other !== p)
            try {
              other.stop();
            } catch {}
        });
        cleanup();
      }
      if (++finished === ports.length) void finalize();
    };
  });
  function begin() {
    if (state.status !== 'countdown') return;
    try {
      ports.forEach((p) => p.start());
      started = true;
      activeAt = deps.now();
      state = { ...state, status: 'recording', countdown: 0 };
      emit();
    } catch (error) {
      started = true;
      fail(failure(error));
    }
  }
  function stop(): Promise<RecordingOutput> {
    if (['stopping', 'stopped', 'error', 'discarded'].includes(state.status))
      return result;
    if (state.status === 'countdown') {
      discard();
      return result;
    }
    accumulated = elapsed();
    state = { ...state, status: 'stopping', elapsedSec: accumulated };
    cancelTimer();
    try {
      ports.forEach((p) => p.stop());
      cleanup();
    } catch (error) {
      fail(failure(error));
    }
    emit();
    return result;
  }
  const countdownAt = deps.now();
  cancelTimer = deps.schedule(() => {
    if (state.status === 'countdown') {
      state.countdown = Math.max(
        0,
        countdown - Math.floor((deps.now() - countdownAt) / 1000),
      );
      if (!state.countdown) begin();
      else emit();
    } else if (state.status === 'recording') {
      state.elapsedSec = elapsed();
      try {
        state.level = meter.read();
      } catch {
        state.level = { peak: 0, rms: 0 };
      }
      emit();
      if (state.elapsedSec >= max) void stop().catch(() => {});
    }
  }, 100);
  options.signal?.addEventListener('abort', discard, { once: true });
  for (const stream of owned)
    for (const track of stream.getTracks())
      track.addEventListener('ended', onEnded, { once: true });
  if (options.signal?.aborted) discard();
  else if (!countdown) begin();
  return {
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    result,
    stop,
    discard,
    pause() {
      if (state.status !== 'recording')
        throw new RecorderError('INVALID_STATE');
      try {
        ports.forEach((p) => p.pause());
        accumulated = elapsed();
        state = {
          ...state,
          status: 'paused',
          elapsedSec: accumulated,
          level: { peak: 0, rms: 0 },
        };
        emit();
      } catch (error) {
        fail(failure(error));
      }
    },
    resume() {
      if (state.status !== 'paused') throw new RecorderError('INVALID_STATE');
      try {
        ports.forEach((p) => p.resume());
        activeAt = deps.now();
        state = { ...state, status: 'recording' };
        emit();
      } catch (error) {
        fail(failure(error));
      }
    },
  };
}
