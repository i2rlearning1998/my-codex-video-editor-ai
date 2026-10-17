export type RecordingMode =
  'camera' | 'screen' | 'microphone' | 'screen+mic' | 'screen+camera';
export type RecorderErrorCode =
  | 'UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_BUSY'
  | 'ABORTED'
  | 'INVALID_STATE'
  | 'INVALID_OPTIONS'
  | 'RECORDING_FAILED'
  | 'WEBM_REPAIR_FAILED'
  | 'STORAGE_LIMIT';
export class RecorderError extends Error {
  constructor(readonly code: RecorderErrorCode) {
    super(
      {
        UNSUPPORTED: 'Recording is unavailable in this browser.',
        PERMISSION_DENIED: 'Recording permission was denied.',
        DEVICE_NOT_FOUND: 'The requested recording device was not found.',
        DEVICE_BUSY: 'The recording device could not be opened.',
        ABORTED: 'The recording was discarded.',
        INVALID_STATE: 'This recording action is unavailable now.',
        INVALID_OPTIONS: 'The recording settings are invalid.',
        RECORDING_FAILED: 'The recording could not be completed.',
        WEBM_REPAIR_FAILED:
          'The WebM recording could not be finalized for seeking.',
        STORAGE_LIMIT: 'The recording reached its memory limit.',
      }[code],
    );
    this.name = 'RecorderError';
  }
}
export interface PipLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface RecordingOptions {
  mode: RecordingMode;
  cameraId?: string;
  microphoneId?: string;
  includeAudio?: boolean;
  countdownSeconds?: 0 | 3;
  maxDurationSec?: number;
  maxBytes?: number;
  pip?: PipLayout;
  signal?: AbortSignal;
}
export interface RecordingOutput {
  blob: Blob;
  mime: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  camera?: {
    blob: Blob;
    mime: string;
    width: number;
    height: number;
    fps: number;
    layout: PipLayout;
  };
}
export interface RecordingState {
  status:
    | 'countdown'
    | 'recording'
    | 'paused'
    | 'stopping'
    | 'stopped'
    | 'discarded'
    | 'error';
  countdown: number;
  elapsedSec: number;
  level: { peak: number; rms: number };
  error?: RecorderErrorCode;
}
export interface RecorderPort {
  readonly mimeType: string;
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  onData: ((blob: Blob) => void) | undefined;
  onStop: (() => void) | undefined;
  onError: (() => void) | undefined;
}
export interface MeterPort {
  read(): { peak: number; rms: number };
  close(): void;
}
export interface RecorderDependencies {
  devices: Pick<
    MediaDevices,
    'enumerateDevices' | 'getUserMedia' | 'getDisplayMedia'
  >;
  queryPermission(name: 'camera' | 'microphone'): Promise<PermissionState>;
  isTypeSupported(mime: string): boolean;
  createRecorder(stream: MediaStream, mime: string): RecorderPort;
  createStream(tracks: MediaStreamTrack[]): MediaStream;
  createMeter(stream: MediaStream): MeterPort;
  now(): number;
  schedule(callback: () => void, ms: number): () => void;
  repairWebM(
    blob: Blob,
    durationSec: number,
    signal?: AbortSignal,
  ): Promise<Blob>;
}
export interface RecordingSession {
  snapshot(): RecordingState;
  subscribe(listener: (state: RecordingState) => void): () => void;
  pause(): void;
  resume(): void;
  stop(): Promise<RecordingOutput>;
  discard(): void;
  result: Promise<RecordingOutput>;
}
