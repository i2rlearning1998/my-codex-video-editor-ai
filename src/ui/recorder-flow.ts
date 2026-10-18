// FINAL2 U4: camera and screen recording in "Record & create", on the
// recorder engine (src/recorder, docs/RECORDER-API.md). Modes: Camera,
// Screen (with "Record my microphone too": Screen + mic) and Screen and
// camera (picture-in-picture: two files, the camera placed in a corner).
// Setup (devices, permission help, "Also add to the timeline"), 3-2-1,
// recording (time, level, Pause / Resume, Stop, Discard), finishing, then
// review (preview, Save to Media, Redo, Discard).
import { formatDuration, t } from '../i18n';
import {
  RecorderError,
  getPermissionStates,
  listDevices,
  startRecording,
  browserRecorderDependencies,
  type PipLayout,
  type RecordingMode,
  type RecordingOutput,
  type RecordingSession,
  type RecordingState,
} from '../recorder';

export type VideoCard = 'camera' | 'screen' | 'screen-camera';
export interface RecordedFile {
  file: File;
  /** The camera of Screen and camera: placed as picture-in-picture. */
  pip?: PipLayout;
}
export interface RecorderFlowHooks {
  /** Imports the files into Media and, when asked, adds them at the playhead. */
  saveVideo(files: RecordedFile[], toTimeline: boolean): Promise<void>;
  report(error: unknown): void;
  /** Saved or discarded: the panel goes back to its cards. */
  done(): void;
}

type Phase = 'setup' | 'live' | 'finishing' | 'review' | 'problem';
const KNOWN_ERRORS = [
  'UNSUPPORTED',
  'PERMISSION_DENIED',
  'DEVICE_NOT_FOUND',
  'DEVICE_BUSY',
  'STORAGE_LIMIT',
];

/**
 * The browser's recorder, limited to formats this browser can also play
 * back: Chromium without H.264 can record MP4 it cannot import, so a take
 * is recorded as WebM there (Chrome and Edge keep MP4).
 */
function playableDependencies() {
  const deps = browserRecorderDependencies();
  const probe = document.createElement('video');
  const playable = (mime: string) => {
    if (!mime.includes('mp4')) return true;
    const codecs = mime.includes('codecs')
      ? mime
      : mime.startsWith('audio')
        ? 'audio/mp4; codecs="mp4a.40.2"'
        : 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
    return (
      probe.canPlayType(codecs.replace(/codecs=([^"]+)$/, 'codecs="$1"')) !== ''
    );
  };
  return {
    ...deps,
    isTypeSupported: (mime: string) =>
      deps.isTypeSupported(mime) && playable(mime),
  };
}

export function mountRecorderFlow(hooks: RecorderFlowHooks) {
  const root = document.createElement('div');
  root.className = 'rec-flow';
  let card: VideoCard = 'camera';
  let withMic = false;
  let toTimeline = true;
  let cameraId = '';
  let microphoneId = '';
  let devices: { id: string; kind: string; label: string }[] = [];
  let permissions: { camera: PermissionState; microphone: PermissionState } = {
    camera: 'prompt',
    microphone: 'prompt',
  };
  let phase: Phase = 'setup';
  let problem = '';
  let session: RecordingSession | null = null;
  let unsubscribe = () => {};
  let output: RecordingOutput | null = null;
  let urls: string[] = [];
  const taken = new Map<VideoCard, number>();

  const mode = (): RecordingMode =>
    card === 'camera'
      ? 'camera'
      : card === 'screen-camera'
        ? 'screen+camera'
        : withMic
          ? 'screen+mic'
          : 'screen';
  const needsCamera = () => mode() === 'camera' || mode() === 'screen+camera';
  const needsMic = () => mode() !== 'screen';

  const button = (action: string, label: string, primary = false) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = primary ? 'button primary' : 'button';
    item.dataset.action = action;
    item.textContent = label;
    return item;
  };
  const check = (id: string, label: string, value: boolean) => {
    const wrap = document.createElement('label');
    wrap.className = 'rec-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = id;
    box.checked = value;
    const words = document.createElement('span');
    words.textContent = label;
    wrap.append(box, words);
    return { wrap, box };
  };
  const clearUrls = () => {
    for (const url of urls) URL.revokeObjectURL(url);
    urls = [];
  };
  const refreshDevices = async () => {
    try {
      const [list, states] = await Promise.all([
        listDevices(),
        getPermissionStates(),
      ]);
      devices = list;
      permissions = states;
    } catch {
      devices = [];
    }
    if (phase === 'setup' || phase === 'problem') render();
  };

  const deviceSelect = (kind: 'videoinput' | 'audioinput') => {
    const item = document.createElement('select');
    item.id = kind === 'videoinput' ? 'rec-camera' : 'rec-mic';
    item.setAttribute(
      'aria-label',
      t(kind === 'videoinput' ? 'rec.camera' : 'record.microphone'),
    );
    const fallback = document.createElement('option');
    fallback.value = '';
    fallback.textContent = t(
      kind === 'videoinput' ? 'rec.defaultCamera' : 'record.defaultMic',
    );
    item.append(fallback);
    let n = 0;
    for (const device of devices.filter(
      (entry) => entry.kind === kind && entry.id,
    )) {
      n++;
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent =
        device.label ||
        t(kind === 'videoinput' ? 'rec.cameraN' : 'rec.micN', {
          n: String(n),
        });
      item.append(option);
    }
    item.value = kind === 'videoinput' ? cameraId : microphoneId;
    item.onchange = () => {
      if (kind === 'videoinput') cameraId = item.value;
      else microphoneId = item.value;
    };
    return item;
  };
  const permissionLine = (which: 'camera' | 'microphone') => {
    const line = document.createElement('p');
    line.className = 'rec-permission';
    const state = permissions[which];
    line.dataset.state = state;
    line.textContent = t(`rec.perm.${state}`, {
      device: t(which === 'camera' ? 'rec.camera' : 'record.microphone'),
    });
    return line;
  };

  const begin = async () => {
    phase = 'live';
    problem = '';
    output = null;
    render();
    try {
      session = await startRecording(
        {
          mode: mode(),
          ...(cameraId ? { cameraId } : {}),
          ...(microphoneId ? { microphoneId } : {}),
          countdownSeconds: 3,
        },
        playableDependencies(),
      );
    } catch (error) {
      session = null;
      phase = 'problem';
      problem = t(
        `rec.error.${
          error instanceof RecorderError && KNOWN_ERRORS.includes(error.code)
            ? error.code
            : 'FAILED'
        }`,
      );
      void refreshDevices();
      render();
      return;
    }
    unsubscribe = session.subscribe(update);
    session.result.then(
      (result) => {
        output = result;
        taken.set(card, (taken.get(card) ?? 0) + 1);
        phase = 'review';
        unsubscribe();
        session = null;
        void refreshDevices();
        render();
      },
      (error: unknown) => {
        unsubscribe();
        session = null;
        if (error instanceof RecorderError && error.code === 'ABORTED') return;
        phase = 'problem';
        problem = t(
          `rec.error.${
            error instanceof RecorderError && KNOWN_ERRORS.includes(error.code)
              ? error.code
              : 'FAILED'
          }`,
        );
        render();
      },
    );
  };
  /** Live updates go to the nodes already drawn (no re-render per tick). */
  let lastStatus = '';
  const update = (state: RecordingState) => {
    if (state.status === 'stopping' && phase === 'live') {
      phase = 'finishing';
      render();
      return;
    }
    if (phase !== 'live') return;
    if (state.status !== lastStatus) {
      lastStatus = state.status;
      render(state);
      return;
    }
    const count = root.querySelector<HTMLElement>('.record-countdown');
    if (count) count.textContent = String(state.countdown);
    const time = root.querySelector<HTMLElement>('.record-time');
    if (time) time.textContent = formatDuration(Math.floor(state.elapsedSec));
    const level = Math.round(Math.min(1, state.level.peak * 1.5) * 100);
    const meter = root.querySelector<HTMLElement>('.record-meter');
    meter?.setAttribute('aria-valuenow', String(level));
    meter?.style.setProperty('--level', `${level}%`);
  };

  const discard = () => {
    session?.discard();
    unsubscribe();
    session = null;
    output = null;
    clearUrls();
    phase = 'setup';
    lastStatus = '';
  };

  const save = async (saveButton: HTMLButtonElement) => {
    if (!output) return;
    saveButton.disabled = true;
    const base = t(
      card === 'camera'
        ? 'rec.nameCamera'
        : card === 'screen'
          ? 'rec.nameScreen'
          : 'rec.nameScreenCamera',
      { n: String(taken.get(card) ?? 1) },
    );
    const extension = (mime: string) => (mime.includes('mp4') ? 'mp4' : 'webm');
    const files: RecordedFile[] = [
      {
        file: new File([output.blob], `${base}.${extension(output.mime)}`, {
          type: output.mime,
        }),
      },
    ];
    if (output.camera)
      files.push({
        file: new File(
          [output.camera.blob],
          `${base} ${t('rec.cameraSuffix')}.${extension(output.camera.mime)}`,
          { type: output.camera.mime },
        ),
        pip: output.camera.layout,
      });
    try {
      await hooks.saveVideo(files, toTimeline);
      output = null;
      clearUrls();
      phase = 'setup';
      lastStatus = '';
      hooks.done();
    } catch (error) {
      saveButton.disabled = false;
      hooks.report(error);
    }
  };

  const meterNode = () => {
    const bar = document.createElement('div');
    bar.className = 'record-meter';
    bar.setAttribute('role', 'meter');
    bar.setAttribute('aria-label', t('record.level'));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', '0');
    bar.append(document.createElement('span'));
    return bar;
  };

  const render = (
    state: RecordingState | null = session?.snapshot() ?? null,
  ) => {
    const nodes: HTMLElement[] = [];
    if (phase === 'setup' || phase === 'problem') {
      if (card === 'screen') {
        const mic = check('rec-with-mic', t('rec.withMic'), withMic);
        mic.box.onchange = () => {
          withMic = mic.box.checked;
          render();
        };
        nodes.push(mic.wrap);
      }
      if (needsCamera())
        nodes.push(deviceSelect('videoinput'), permissionLine('camera'));
      if (needsMic())
        nodes.push(deviceSelect('audioinput'), permissionLine('microphone'));
      if (mode().startsWith('screen')) {
        const note = document.createElement('p');
        note.className = 'rec-permission';
        note.textContent = t('rec.screenNote');
        nodes.push(note);
      }
      if (card === 'screen-camera') {
        const note = document.createElement('p');
        note.className = 'rec-permission';
        note.textContent = t('rec.pipNote');
        nodes.push(note);
      }
      const timeline = check(
        'rec-to-timeline',
        t('rec.toTimeline'),
        toTimeline,
      );
      timeline.box.onchange = () => {
        toTimeline = timeline.box.checked;
      };
      nodes.push(timeline.wrap);
      if (phase === 'problem') {
        const note = document.createElement('p');
        note.className = 'record-problem';
        note.setAttribute('role', 'alert');
        note.textContent = problem;
        nodes.push(note);
      }
      const start = button(
        phase === 'problem' ? 'rec-retry' : 'rec-start',
        t(phase === 'problem' ? 'record.retry' : 'record.record'),
        true,
      );
      start.classList.add('record-big');
      start.onclick = () => void begin();
      nodes.push(start);
    }
    if (phase === 'live') {
      const counting = !state || state.status === 'countdown';
      if (counting) {
        const count = document.createElement('div');
        count.className = 'record-countdown';
        count.setAttribute('aria-live', 'assertive');
        count.textContent = String(state?.countdown ?? 3);
        nodes.push(count);
      } else {
        const time = document.createElement('div');
        time.className = 'record-time';
        time.setAttribute('role', 'timer');
        time.textContent = formatDuration(Math.floor(state.elapsedSec));
        nodes.push(time);
        if (state.status === 'paused') {
          const tag = document.createElement('p');
          tag.className = 'rec-permission';
          tag.textContent = t('rec.paused');
          nodes.push(tag);
        }
      }
      if (needsMic()) nodes.push(meterNode());
      const row = document.createElement('div');
      row.className = 'rec-actions';
      const paused = state?.status === 'paused';
      const pause = button(
        'rec-pause',
        t(paused ? 'record.resume' : 'record.pause'),
      );
      pause.disabled = counting;
      pause.onclick = () => {
        if (!session) return;
        try {
          if (session.snapshot().status === 'paused') session.resume();
          else session.pause();
        } catch (error) {
          hooks.report(error);
        }
      };
      const stop = button('rec-stop', t('record.stop'), true);
      stop.disabled = counting;
      stop.onclick = () => void session?.stop().catch(() => undefined);
      const drop = button('rec-discard', t('record.discard'));
      drop.onclick = () => {
        discard();
        render();
      };
      row.append(pause, stop, drop);
      nodes.push(row);
    }
    if (phase === 'finishing') {
      const note = document.createElement('p');
      note.className = 'rec-permission';
      note.setAttribute('role', 'status');
      note.textContent = t('rec.finishing');
      nodes.push(note);
    }
    if (phase === 'review' && output) {
      clearUrls();
      const video = (blob: Blob, className: string) => {
        const url = URL.createObjectURL(blob);
        urls.push(url);
        const item = document.createElement('video');
        item.className = className;
        item.src = url;
        item.muted = true;
        item.controls = true;
        item.playsInline = true;
        return item;
      };
      const frame = document.createElement('div');
      frame.className = 'rec-preview-frame';
      frame.append(video(output.blob, 'rec-preview'));
      if (output.camera) frame.append(video(output.camera.blob, 'rec-pip'));
      const length = document.createElement('p');
      length.className = 'rec-permission';
      length.textContent = t('rec.length', {
        time: formatDuration(Math.max(1, Math.round(output.durationSec))),
      });
      const timeline = check(
        'rec-to-timeline',
        t('rec.toTimeline'),
        toTimeline,
      );
      timeline.box.onchange = () => {
        toTimeline = timeline.box.checked;
      };
      const row = document.createElement('div');
      row.className = 'rec-actions';
      const saveButton = button('rec-save', t('rec.save'), true);
      saveButton.onclick = () => void save(saveButton);
      const redo = button('rec-redo', t('record.redo'));
      redo.onclick = () => {
        discard();
        render();
      };
      const drop = button('rec-discard', t('record.discard'));
      drop.onclick = () => {
        discard();
        hooks.done();
      };
      row.append(saveButton, redo, drop);
      nodes.push(frame, length, timeline.wrap, row);
    }
    root.replaceChildren(...nodes);
  };

  return {
    element: root,
    open(next: VideoCard) {
      discard();
      card = next;
      withMic = false;
      render();
      void refreshDevices();
    },
    /** A take is being recorded (leaving asks Keep or Discard). */
    active: () => phase === 'live' && session !== null,
    stop: () => void session?.stop().catch(() => undefined),
    discard() {
      discard();
      render();
    },
    dispose() {
      discard();
    },
  };
}
