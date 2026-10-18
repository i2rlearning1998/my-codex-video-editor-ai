// FINAL2 U5: more of the clip Audio tab, over the audio engine of FINAL1
// (docs/AUDIO-API.md). Fades with preset buttons (`fadePreset`), volume
// keyframes (`volumeKeys`, clip-local seconds, linear in dB) and Reduce noise
// (Off / Low / High, Beta: `denoise`, local RNNoise WASM). Every change is
// one undo step through the existing clip audio command.
import { fadePreset } from '../../audio/mixer';
import { RNNOISE_RUNTIME } from '../../audio/denoise';
import { volumeDbAt, type AudioSettings } from '../../audio/settings';
import { formatNumber, t } from '../../i18n';
import { createNumberField } from '../components/number-field';
import type { EditorSession } from '../session';

/** The playback engine's processing state (set once by the shell). */
export interface AudioProcessing {
  processingError(): string | null;
  retry(): void;
}
let processing: AudioProcessing | null = null;
export function configureAudioTab(next: AudioProcessing | null) {
  processing = next;
}

const toPercent = (db: number) =>
  db <= -96 ? 0 : Math.round(100 * 10 ** (db / 20));
const toDb = (percent: number) =>
  percent <= 0 ? -96 : Math.max(-96, 20 * Math.log10(percent / 100));
/** Denoise processes the whole source; the engine allows five minutes. */
export const DENOISE_LIMIT_SECONDS = 300;

type Group = (
  id: string,
  title: string,
  reset: () => AudioSettings,
  body: HTMLElement[],
) => HTMLElement;

export function final2Groups(
  session: EditorSession,
  clip: {
    readonly id: string;
    readonly startTime: number;
    readonly duration: number;
    readonly assetId?: string | null;
  },
  settings: AudioSettings,
  locked: boolean,
  save: (label: string, next: AudioSettings | null) => void,
  group: Group,
): HTMLElement[] {
  const button = (
    text: string,
    action: string,
    pressed: boolean | null,
    run: () => void,
  ) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'button sm';
    element.dataset.action = action;
    if (pressed !== null) element.setAttribute('aria-pressed', String(pressed));
    element.textContent = text;
    element.disabled = locked;
    element.onclick = run;
    return element;
  };
  // Fades: preset buttons for the sound's fade in and out.
  const fadeRow = (kind: 'in' | 'out') => {
    const row = document.createElement('div');
    row.className = 'audio-fade-row';
    row.dataset.fade = kind;
    const label = document.createElement('span');
    label.className = 'audio-fade-label';
    label.textContent = t(kind === 'in' ? 'u5.fadeIn' : 'u5.fadeOut');
    row.append(label);
    const current = kind === 'in' ? settings.fadeIn : settings.fadeOut;
    for (const seconds of [0, 0.5, 1, 2]) {
      const preset = button(
        seconds === 0
          ? t('u5.fadeNone')
          : t('u5.seconds', { seconds: formatNumber(seconds) }),
        `audio-fade-${kind}`,
        Math.abs(current - seconds) < 1e-9,
        () =>
          save(
            kind === 'in' ? 'Fade in' : 'Fade out',
            fadePreset(settings, kind, seconds),
          ),
      );
      preset.dataset.seconds = String(seconds);
      row.append(preset);
    }
    return row;
  };
  // Volume keyframes at the playhead (clip-local seconds).
  const local = Math.max(
    0,
    Math.min(clip.duration, session.currentTime - clip.startTime),
  );
  const keys = settings.volumeKeys;
  const setKeys = (label: string, next: AudioSettings['volumeKeys']) =>
    save(label, {
      ...settings,
      volumeKeys: [...next].sort((a, b) => a.time - b.time),
      normalization: null,
    });
  const keyList = document.createElement('div');
  keyList.className = 'audio-keys';
  keyList.setAttribute('role', 'list');
  keys.forEach((key, index) => {
    const row = document.createElement('div');
    row.className = 'audio-key';
    row.setAttribute('role', 'listitem');
    row.dataset.time = String(key.time);
    const field = createNumberField({
      id: `right-audio-key-${index}`,
      label: t('u5.keyAt', {
        seconds: formatNumber(Math.round(key.time * 100) / 100),
      }),
      value: toPercent(key.db),
      min: 0,
      max: 200,
      step: 1,
      decimals: 0,
      unit: '%',
      slider: true,
      disabled: locked,
      className: 'right-row',
      onCommit: (percent) =>
        setKeys(
          'Volume keyframe',
          keys.map((item, at) =>
            at === index ? { ...item, db: toDb(percent) } : item,
          ),
        ),
    });
    const remove = button(t('u5.keyRemove'), 'audio-key-remove', null, () =>
      setKeys(
        'Remove volume keyframe',
        keys.filter((_, at) => at !== index),
      ),
    );
    remove.className = 'button sm ghost';
    row.append(field, remove);
    keyList.append(row);
  });
  const atPlayhead = keys.findIndex((key) => Math.abs(key.time - local) < 1e-3);
  const addKey = button(
    t('u5.keyAdd', { seconds: formatNumber(Math.round(local * 100) / 100) }),
    'audio-key-add',
    null,
    () =>
      setKeys(
        'Add volume keyframe',
        atPlayhead >= 0
          ? keys
          : [...keys, { time: local, db: volumeDbAt(settings, local) }],
      ),
  );
  addKey.disabled = locked || atPlayhead >= 0;
  const keyNote = document.createElement('p');
  keyNote.className = 'right-note';
  keyNote.textContent = t(keys.length ? 'u5.keysOn' : 'u5.keysHint');
  // Reduce noise (Beta).
  const asset = session.source.assets.find((item) => item.id === clip.assetId);
  const sourceSeconds = asset?.duration ?? clip.duration;
  const tooLong = sourceSeconds > DENOISE_LIMIT_SECONDS;
  const mode = settings.denoise ?? 'off';
  const modes = document.createElement('div');
  modes.className = 'segmented right-audio-denoise';
  modes.setAttribute('role', 'radiogroup');
  modes.setAttribute('aria-label', t('u5.denoise'));
  for (const [value, key] of [
    ['off', 'u5.denoiseOff'],
    ['low', 'u5.denoiseLow'],
    ['high', 'u5.denoiseHigh'],
  ] as const) {
    const option = document.createElement('button');
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.dataset.denoise = value;
    option.setAttribute('aria-checked', String(mode === value));
    option.textContent = t(key);
    option.disabled = locked || (value !== 'off' && tooLong);
    option.onclick = () => {
      const next: AudioSettings = { ...settings, normalization: null };
      if (value === 'off') delete next.denoise;
      else next.denoise = value;
      save('Reduce noise', next);
    };
    modes.append(option);
  }
  const denoiseNote = document.createElement('p');
  denoiseNote.className = 'right-note';
  denoiseNote.dataset.audio = 'denoise-note';
  denoiseNote.textContent = tooLong
    ? t('u5.denoiseTooLong')
    : t('u5.denoiseNote', {
        size: formatNumber(
          Math.round((RNNOISE_RUNTIME.sizeBytes / 1_000_000) * 10) / 10,
        ),
      });
  const denoiseBody: HTMLElement[] = [modes, denoiseNote];
  const error = mode !== 'off' ? processing?.processingError() : null;
  if (error) {
    const failed = document.createElement('p');
    failed.className = 'right-note audio-denoise-error';
    failed.setAttribute('role', 'alert');
    failed.textContent = t('u5.denoiseFailed');
    const actions = document.createElement('div');
    actions.className = 'right-audio-actions';
    actions.append(
      button(t('u5.denoiseTurnOff'), 'audio-denoise-off', null, () => {
        const next: AudioSettings = { ...settings };
        delete next.denoise;
        save('Reduce noise', next);
      }),
      button(t('u5.retry'), 'audio-denoise-retry', null, () =>
        processing?.retry(),
      ),
    );
    denoiseBody.push(failed, actions);
  }
  return [
    group(
      'fades',
      t('u5.fades'),
      () => ({ ...settings, fadeIn: 0, fadeOut: 0 }),
      [fadeRow('in'), fadeRow('out')],
    ),
    group(
      'keys',
      t('u5.keys'),
      () => ({ ...settings, volumeKeys: [], normalization: null }),
      [keyNote, keyList, addKey],
    ),
    group(
      'denoise',
      t('u5.denoise'),
      () => {
        const next: AudioSettings = { ...settings, normalization: null };
        delete next.denoise;
        return next;
      },
      denoiseBody,
    ),
  ];
}
