# Recorder engine

New pure controller modules in `src/recorder`; browser device access is isolated
behind injectable `RecorderDependencies`. No UI, project schema, playback or
existing import path was changed.

## Exports and lifecycle

- `listDevices(deps?)`: audio/video inputs as `{id,kind,label,groupId}`. It does not
  request permission. Labels may be empty before permission is granted.
- `getPermissionStates(deps?)`: `{camera,microphone}`, each granted/denied/prompt.
  The browser adapter returns prompt when that permission query is unsupported;
  this is not proof the permission has been granted. Screen selection requires
  a fresh user gesture and is not represented as a persistent permission.
- `startRecording(options, deps?) -> Promise<RecordingSession>`: acquires devices
  and returns a session before the countdown finishes. Call from a user gesture
  for screen capture. Modes: camera, screen, microphone, screen+mic, screen+camera.
- `RecordingSession.snapshot()`, `subscribe(listener)` (unsubscribe function),
  `pause()`, `resume()`, `stop()`, `discard()`, `result`.
- `selectRecordingMime(video, supported)`: MP4 first, then WebM. No supported
  candidate throws UNSUPPORTED; a positive browser support check is not a guarantee
  that a particular device/encoder can actually start.
- `repairWebM(blob, durationSec, signal?)`: encoded-packet remux with seek indexes.
- `toMediaItem(output, name?)`: prepared blob + Asset reference for existing import.
- `browserRecorderDependencies()`, dependency/option/output/state types,
  `RecorderError`, `RecorderErrorCode`.

Options: mode, optional cameraId/microphoneId, includeAudio (default true for
camera modes), countdownSeconds (0 or 3; default 3), maxDurationSec (default 3600),
maxBytes (default 200 MiB), normalized PiP rectangle, AbortSignal.
Screen capture explicitly requests no system audio. screen+mic adds microphone
sound. screen+camera adds the camera's microphone unless includeAudio is false.
The screen and camera videos are recorded separately; PiP is layout data only,
not composited pixels. The caller must retain both outputs and create two layers.

States: countdown, recording, paused, stopping, stopped, discarded, error.
Snapshot contains countdown (3/2/1/0), elapsedSec, peak/RMS meter level and optional
error code. Pause time is excluded. Capture tracks, meter and timers are released
on stop/error/discard, including late-arriving permission results after abort.
A stopped session's result is reusable; stop during countdown discards it. Abort
also applies while WebM finalization is running. No camera background blur.

Output: `{blob,mime,durationSec,width,height,fps,camera?}`. Audio dimensions/fps
are zero. Camera attachment contains its own blob/mime/dimensions/fps and layout.
Measurements use MediaStream settings and a monotonic active-recording clock;
unknown settings remain zero. The two recorders start sequentially, so exact
frame-synchronized camera/screen capture is not claimed.

## WebM finalization

Reuses already-installed **mediabunny 1.59.1, MPL-2.0**; no new dependency or model.
It is dynamically imported only when repairing WebM. All encoded audio/video
packets are copied into a non-append-only WebM with a finite Segment Duration and
Cues/SeekHead. No encoder, AudioContext or video decoder is used. Missing packet
durations use the following timestamp; a missing final duration uses the measured
active recording end. Unsupported tracks or malformed input fail explicitly
instead of silently discarding a track. MP4 is left untouched.

A synthetic two-packet Opus WebM unit fixture starts without duration metadata;
repair produces 0.040 seconds of container duration, preserves the packet bytes
and timestamp, and provides a cue index. The installed demuxer's `computeDuration`
reads SimpleBlock timestamps and can omit the last packet's implicit duration;
the test reads `getDurationFromMetadata` to verify the actual repaired Duration.
That fixture is not proof of every browser's recording/seek behavior. Browser,
Safari/mobile and long-video tests are not run under LIMIT MODE.

Sources: [Matroska elements](https://www.matroska.org/technical/elements.html),
[MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder),
and installed Mediabunny declarations/source/LICENSE.

## Media library and UI contract

`toMediaItem` computes the existing content fingerprint and returns
`{blob,mime,name,durationSec,storageKey,asset,camera?,pip?}`. Write each blob to its
storageKey using MediaStore, then add its Asset through the command bus. It does
not write storage or mutate projects itself. Asset type, local source reference,
duration and metadata follow existing imports. Retain PiP data when inserting
screen+camera layers. No new persisted schema fields are required.

UI agent must wire the recorder dialog's mode/device selectors, permission errors,
countdown display, live level meter, elapsed timer, pause/resume/stop/discard buttons,
finalizing state, output preview and Save-to-library action. Subscribe once and
unsubscribe on close; discard an active recording when closing the dialog. Device
permission requests must originate from user action. Do not enable stop/pause
controls during countdown. Hide camera controls for microphone-only mode.

Errors: UNSUPPORTED, PERMISSION_DENIED, DEVICE_NOT_FOUND, DEVICE_BUSY, ABORTED,
INVALID_STATE, INVALID_OPTIONS, RECORDING_FAILED, WEBM_REPAIR_FAILED, STORAGE_LIMIT.
Messages contain no raw device/provider diagnostic text.

## Limits and tests

All unit devices, clocks, permission queries, MediaRecorder and meters are fakes;
WebM remux uses only locally generated encoded fixture bytes. No camera/microphone,
network or browser was opened. Captured bytes and remux output are held in memory;
large recordings can require multiple copies. The 200 MiB default is a safety cap,
not a long-recording guarantee. Max duration is checked every 100 ms while active;
background-tab throttling can delay that check. A strict sample-accurate hard cut
is not implemented. Meter values are snapshots, not loudness-standard measurements.
