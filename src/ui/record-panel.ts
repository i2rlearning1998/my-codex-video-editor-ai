// V7 (Clipchamp clone spec 11.4): the left "Record & create" category.
// Record: Screen and camera, Camera and Screen are shown, disabled and
// Planned; Audio records a voiceover. Create: Text to speech opens the
// right Text to speech panel. The voiceover flow replaces the cards (Back
// returns): idle (microphone, level meter, Record), the browser's
// permission (a refusal or a missing device is explained, with Retry),
// 3-2-1, recording (time, level, Pause / Resume, Stop), then review
// (waveform, Play, Redo, Add to timeline).
import { confirmDialog } from './components/modal';
import { formatDuration, t } from '../i18n';
import { iconSvg } from './icons';

export interface RecordHooks {
  /** Imports the take and adds it at the playhead on a new audio lane. */
  addRecording(file: File): Promise<void>;
  openTextToSpeech(): void;
  report(error: unknown): void;
}

type Phase = 'cards' | 'idle' | 'denied' | 'countdown' | 'recording' | 'review';

export function mountRecordPanel(host: HTMLElement, hooks: RecordHooks) {
  host.classList.add('record-panel');
  let phase: Phase = 'cards';
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let take: Blob | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let meterFrame = 0;
  let timer = 0;
  let started = 0;
  let pausedFor = 0;
  let pausedAt = 0;
  let deviceId = '';
  let problem = '';
  let player: HTMLAudioElement | null = null;
  let takeUrl = '';

  const button = (
    action: string,
    label: string,
    icon?: string,
    className = 'button',
  ) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = className;
    item.dataset.action = action;
    item.innerHTML = `${icon ? iconSvg(icon, 20) : ''}<span></span>`;
    item.querySelector('span')!.textContent = label;
    return item;
  };
  const meter = () => {
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
  const stopMeter = () => {
    cancelAnimationFrame(meterFrame);
    meterFrame = 0;
  };
  const runMeter = () => {
    stopMeter();
    if (!analyser) return;
    const data = new Float32Array(analyser.fftSize);
    let held = 0;
    const tick = () => {
      if (!analyser) return;
      if (audioContext?.state === 'suspended')
        void audioContext.resume().catch(() => undefined);
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (const value of data) peak = Math.max(peak, Math.abs(value));
      // A meter's peak hold: it falls back over about a second and a half.
      held = Math.max(peak, held * 0.97);
      const level = Math.round(Math.min(1, held * 1.5) * 100);
      for (const bar of host.querySelectorAll<HTMLElement>('.record-meter')) {
        bar.setAttribute('aria-valuenow', String(level));
        bar.style.setProperty('--level', `${level}%`);
      }
      meterFrame = requestAnimationFrame(tick);
    };
    tick();
  };
  const release = () => {
    stopMeter();
    clearInterval(timer);
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    analyser = null;
    void audioContext?.close();
    audioContext = null;
  };
  const resetTake = () => {
    player?.pause();
    player = null;
    if (takeUrl) URL.revokeObjectURL(takeUrl);
    takeUrl = '';
    take = null;
  };
  /** Asks for the microphone; a refusal or no device is explained. */
  const openMic = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
    } catch (error) {
      const name = (error as { name?: string }).name;
      problem =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? t('record.denied')
          : t('record.noDevice');
      phase = 'denied';
      render();
      return false;
    }
    audioContext ??= new AudioContext();
    void audioContext.resume().catch(() => undefined);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    return true;
  };
  const begin = async () => {
    // (Made in the click itself, so the browser lets it run; the meter
    // reads the microphone through it.)
    audioContext ??= new AudioContext();
    if (!stream && !(await openMic())) return;
    phase = 'countdown';
    render();
    for (const n of [3, 2, 1]) {
      const count = host.querySelector<HTMLElement>('.record-countdown');
      if (count) count.textContent = String(n);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (phase !== 'countdown') return;
    }
    chunks = [];
    recorder = new MediaRecorder(stream!);
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      take = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
      release();
      phase = 'review';
      render();
    };
    recorder.start(250);
    started = performance.now();
    pausedFor = 0;
    phase = 'recording';
    render();
  };
  const elapsed = () =>
    ((recorder?.state === 'paused' ? pausedAt : performance.now()) -
      started -
      pausedFor) /
    1000;
  const stopRecording = () => {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const render = () => {
    const nodes: HTMLElement[] = [];
    if (phase === 'cards') {
      const title = document.createElement('h3');
      title.className = 'record-heading';
      title.textContent = t('record.recordSection');
      nodes.push(title);
      for (const [id, key, icon, works] of [
        ['screen-camera', 'record.screenCamera', 'screen', false],
        ['camera', 'record.camera', 'camera', false],
        ['screen', 'record.screen', 'screen', false],
        ['audio', 'record.audio', 'mic', true],
      ] as const) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'record-card';
        card.dataset.record = id;
        card.innerHTML = `<span class="record-card-title"></span>${iconSvg(icon, 24)}`;
        card.querySelector('.record-card-title')!.textContent = t(key);
        if (!works) {
          card.setAttribute('aria-disabled', 'true');
          card.title = `${t(key)}: ${t('right.planned')}`;
          const tag = document.createElement('span');
          tag.className = 'quiet-tag';
          tag.textContent = t('right.planned');
          card.querySelector('.record-card-title')!.append(' ', tag);
        } else
          card.onclick = () => {
            phase = 'idle';
            render();
          };
        nodes.push(card);
      }
      const create = document.createElement('h3');
      create.className = 'record-heading';
      create.textContent = t('record.createSection');
      const tts = document.createElement('button');
      tts.type = 'button';
      tts.className = 'record-card';
      tts.dataset.record = 'tts';
      tts.innerHTML = `<span class="record-card-title"></span>${iconSvg('text', 24)}`;
      tts.querySelector('.record-card-title')!.textContent = t('tts.title');
      tts.onclick = () => hooks.openTextToSpeech();
      nodes.push(create, tts);
      host.replaceChildren(...nodes);
      return;
    }
    const back = button('record-back', t('record.back'), 'back', 'button sm');
    back.onclick = () => void leave();
    const heading = document.createElement('h3');
    heading.className = 'record-heading';
    heading.textContent = t('record.audio');
    nodes.push(back, heading);
    if (phase === 'idle' || phase === 'denied') {
      const select = document.createElement('select');
      select.id = 'record-device';
      select.setAttribute('aria-label', t('record.microphone'));
      const fallback = document.createElement('option');
      fallback.value = '';
      fallback.textContent = t('record.defaultMic');
      select.append(fallback);
      void navigator.mediaDevices
        ?.enumerateDevices()
        .then((devices) => {
          for (const device of devices.filter(
            (item) => item.kind === 'audioinput' && item.deviceId,
          )) {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || t('record.microphone');
            select.append(option);
          }
          select.value = deviceId;
        })
        .catch(() => undefined);
      select.onchange = () => {
        deviceId = select.value;
        release();
      };
      nodes.push(select, meter());
      if (phase === 'denied') {
        const note = document.createElement('p');
        note.className = 'record-problem';
        note.setAttribute('role', 'alert');
        note.textContent = problem;
        const retry = button('record-retry', t('record.retry'));
        retry.onclick = () => {
          phase = 'idle';
          problem = '';
          void begin();
        };
        nodes.push(note, retry);
      } else {
        const record = button(
          'record-start',
          t('record.record'),
          'mic',
          'button primary record-big',
        );
        record.onclick = () => void begin();
        nodes.push(record);
      }
    }
    if (phase === 'countdown') {
      const count = document.createElement('div');
      count.className = 'record-countdown';
      count.setAttribute('aria-live', 'assertive');
      count.textContent = '3';
      nodes.push(count, meter());
    }
    if (phase === 'recording') {
      const time = document.createElement('div');
      time.className = 'record-time';
      time.setAttribute('role', 'timer');
      time.textContent = formatDuration(0);
      clearInterval(timer);
      timer = window.setInterval(() => {
        time.textContent = formatDuration(Math.floor(elapsed()));
      }, 250);
      const pause = button(
        'record-pause',
        t(recorder?.state === 'paused' ? 'record.resume' : 'record.pause'),
        recorder?.state === 'paused' ? 'play' : 'pause',
      );
      pause.onclick = () => {
        if (!recorder) return;
        if (recorder.state === 'paused') {
          pausedFor += performance.now() - pausedAt;
          recorder.resume();
        } else {
          pausedAt = performance.now();
          recorder.pause();
        }
        render();
      };
      const stop = button(
        'record-stop',
        t('record.stop'),
        'stop',
        'button primary',
      );
      stop.onclick = stopRecording;
      nodes.push(time, meter(), pause, stop);
    }
    if (phase === 'review' && take) {
      takeUrl ||= URL.createObjectURL(take);
      const wave = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg',
      );
      wave.classList.add('record-wave');
      wave.setAttribute('viewBox', '0 0 100 30');
      wave.setAttribute('preserveAspectRatio', 'none');
      wave.setAttribute('aria-hidden', 'true');
      void take
        .arrayBuffer()
        .then((bytes) =>
          new OfflineAudioContext(1, 1, 48_000).decodeAudioData(bytes),
        )
        .then((decoded) => {
          const data = decoded.getChannelData(0);
          const step = Math.max(1, Math.floor(data.length / 100));
          let path = '';
          for (let i = 0; i < 100; i++) {
            let peak = 0;
            for (
              let j = i * step;
              j < Math.min(data.length, (i + 1) * step);
              j++
            )
              peak = Math.max(peak, Math.abs(data[j]!));
            const h = Math.max(0.5, peak * 28);
            path += `M${i + 0.5} ${15 - h / 2}v${h}`;
          }
          const line = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path',
          );
          line.setAttribute('d', path);
          wave.append(line);
          wave.dataset.ready = 'true';
        })
        .catch(() => undefined);
      const play = button('record-play', t('record.play'), 'play');
      play.onclick = () => {
        player ??= new Audio(takeUrl);
        if (player.paused) void player.play().catch(() => undefined);
        else player.pause();
      };
      const redo = button('record-redo', t('record.redo'), 'undo');
      redo.onclick = () => {
        resetTake();
        phase = 'idle';
        render();
      };
      const add = button(
        'record-add',
        t('record.add'),
        'plus',
        'button primary',
      );
      add.onclick = () => {
        if (!take) return;
        add.disabled = true;
        const extension = take.type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([take], `recording.${extension}`, {
          type: take.type || 'audio/webm',
        });
        hooks.addRecording(file).then(
          () => {
            resetTake();
            phase = 'cards';
            render();
          },
          (error: unknown) => {
            add.disabled = false;
            hooks.report(error);
          },
        );
      };
      nodes.push(wave as unknown as HTMLElement, play, redo, add);
    }
    host.replaceChildren(...nodes);
    if (analyser) runMeter();
  };
  /** Back, or leaving the category: a take in progress asks Keep or Discard. */
  const leave = async () => {
    if (phase === 'recording' || phase === 'countdown') {
      const keep = await confirmDialog(t('record.leaveMessage'), {
        titleText: t('record.leaveTitle'),
        confirmLabel: t('record.keep'),
        cancelLabel: t('record.discard'),
      });
      if (keep && phase === 'recording') {
        stopRecording();
        return;
      }
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      chunks = [];
      phase = 'cards';
    } else phase = 'cards';
    if (phase === 'cards') {
      recorder = null;
      release();
      resetTake();
    }
    render();
  };
  render();
  return {
    /** The category is left: a recording asks Keep or Discard. */
    leave: () => {
      if (phase === 'recording' || phase === 'countdown') void leave();
    },
    dispose: () => {
      if (recorder) recorder.onstop = null;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      release();
      resetTake();
    },
  };
}
