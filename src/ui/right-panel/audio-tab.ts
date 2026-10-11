// V7 (Clipchamp clone spec 11.3): the right panel's Audio tab, over the
// PR #14 audio engine (ported in V7f). Volume (0 to 200 %) and Mute at the
// top; below, collapsible groups closed by default, each with Reset: Pan,
// Equalizer, Compressor, Loudness (Analyze, then Apply), and the Voice /
// Music role with Auto ducking. Every change is one undo step in
// `clip.metadata.audio` (schema unchanged) and is heard in the preview and
// the export alike (one graph). Track mute and Detach audio stay below.
import { normalizeClip } from '../../audio/normalize';
import {
  audioSettingsSchema,
  defaultAudioSettings,
  normalizationSignature,
  readAudioSettings,
  registerAudioCommands,
  type AudioSettings,
} from '../../audio/settings';
import {
  clipTimeEffects,
  findClipByLayer,
  type Command,
  type EditorEngine,
} from '../../core';
import { formatNumber, t } from '../../i18n';
import {
  listAudibleClips,
  type AudioDecoder,
  type PreviewAsset,
} from '../../media';
import { createNumberField } from '../components/number-field';
import { performEdit } from '../editing';
import { iconSvg } from '../icons';
import { describeSelection, selectionRoots } from '../selection-context';
import type { EditorSession } from '../session';

/** 100 % is 0 dB, 200 % +6 dB, 0 % silent (the schema's floor). */
export const percentToDb = (percent: number) =>
  percent <= 0 ? -96 : Math.max(-96, 20 * Math.log10(percent / 100));
export const dbToPercent = (db: number) =>
  db <= -96 ? 0 : Math.round(100 * 10 ** (db / 20));

/** The selected clip that carries sound (audio, or video with its sound). */
export function soundClip(session: EditorSession) {
  const roots = selectionRoots(session.source, session.selectedIds);
  const layer = roots.length === 1 ? roots[0]! : null;
  if (!layer || (layer.type !== 'audio' && layer.type !== 'video')) return null;
  const found = findClipByLayer(session.source.composition, layer.id);
  return found ? { layer, ...found } : null;
}

/** One undo step that stores a clip's audio settings. */
export function audioCommand(
  compositionId: string,
  clipId: string,
  settings: AudioSettings | null,
): Command {
  return {
    type: 'plugin:audio:SET',
    input: { compositionId, clipId, settings },
  } as unknown as Command;
}

/** Analysis results kept for the session, by clip and signature. */
const analyses = new Map<
  string,
  { signature: string; next: AudioSettings; lufs: number; gain: number }
>();

export function audioTab(
  engine: EditorEngine,
  session: EditorSession,
  run: (label: string, commands: (Command | null)[]) => void,
  report: (error: unknown) => void,
  decoder?: AudioDecoder,
  rerender?: () => void,
): HTMLElement[] {
  registerAudioCommands(engine);
  const target = soundClip(session);
  const composition = session.source.composition;
  const elements: HTMLElement[] = [];
  if (!target) {
    const note = document.createElement('p');
    note.className = 'right-note';
    note.textContent = t('audio.noClip');
    return [note];
  }
  const { clip, track, layer } = target;
  const settings = readAudioSettings(clip);
  const save = (label: string, next: AudioSettings | null) => {
    try {
      run(label, [audioCommand(composition.id, clip.id, next)]);
    } catch (error) {
      report(error);
    }
  };
  const field = (
    id: string,
    label: string,
    value: number,
    options: {
      min: number;
      max: number;
      step: number;
      decimals: number;
      unit?: string;
      detent?: number;
    },
    commit: (value: number) => void,
  ) =>
    createNumberField({
      id,
      label,
      value,
      ...options,
      ...(options.unit ? { unit: options.unit } : {}),
      slider: true,
      className: 'right-row',
      disabled: track.locked,
      onCommit: (next) =>
        commit(
          options.detent !== undefined &&
            Math.abs(next - options.detent) < (options.max - options.min) / 40
            ? options.detent
            : next,
        ),
    });
  if (track.locked) {
    const note = document.createElement('p');
    note.className = 'right-note';
    note.textContent = t('audio.locked');
    elements.push(note);
  }
  // Volume and Mute.
  elements.push(
    field(
      'right-volume',
      t('right.volume'),
      dbToPercent(settings.gainDb),
      { min: 0, max: 200, step: 1, decimals: 0, unit: '%' },
      (percent) =>
        save('Volume', { ...settings, gainDb: percentToDb(percent) }),
    ),
  );
  const mute = document.createElement('button');
  mute.type = 'button';
  mute.className = 'switch-row';
  mute.dataset.action = 'right-clip-mute';
  mute.setAttribute('role', 'switch');
  mute.setAttribute('aria-checked', String(settings.muted));
  mute.disabled = track.locked;
  mute.innerHTML = `${iconSvg(settings.muted ? 'mute' : 'speaker', 20)}<span></span>`;
  mute.querySelector('span')!.textContent = t('audio.mute');
  mute.onclick = () =>
    save(settings.muted ? 'Unmute clip' : 'Mute clip', {
      ...settings,
      muted: !settings.muted,
    });
  elements.push(mute);

  /** A collapsible group, closed by default, with a Reset link. */
  const group = (
    id: string,
    title: string,
    reset: () => AudioSettings,
    body: HTMLElement[],
  ) => {
    const details = document.createElement('details');
    details.className = 'right-audio-group';
    details.dataset.group = id;
    const summary = document.createElement('summary');
    summary.textContent = title;
    const resetLink = document.createElement('button');
    resetLink.type = 'button';
    resetLink.className = 'right-audio-reset';
    resetLink.dataset.action = `audio-reset-${id}`;
    resetLink.textContent = t('audio.reset');
    resetLink.disabled = track.locked;
    resetLink.onclick = (event) => {
      event.preventDefault();
      save(`Reset ${title}`, reset());
    };
    summary.append(resetLink);
    details.append(summary, ...body);
    details.open = openGroups.has(id);
    details.addEventListener('toggle', () => {
      if (details.open) openGroups.add(id);
      else openGroups.delete(id);
    });
    return details;
  };
  const defaults = defaultAudioSettings();
  // Pan: -100 (left) to +100 (right), a detent at the centre.
  elements.push(
    group('pan', t('audio.pan'), () => ({ ...settings, pan: 0 }), [
      field(
        'right-audio-pan',
        t('audio.panLabel'),
        Math.round(settings.pan * 100),
        { min: -100, max: 100, step: 1, decimals: 0, detent: 0 },
        (value) => save('Pan', { ...settings, pan: value / 100 }),
      ),
    ]),
  );
  // Equalizer: three bands, -18 to +18 dB.
  elements.push(
    group(
      'eq',
      t('audio.eq'),
      () => ({ ...settings, eq: defaults.eq, normalization: null }),
      (['low', 'mid', 'high'] as const).map((band) =>
        field(
          `right-audio-eq-${band}`,
          t(`audio.${band}`),
          settings.eq[band],
          { min: -18, max: 18, step: 0.5, decimals: 1, unit: 'dB', detent: 0 },
          (value) =>
            save('Equalizer', {
              ...settings,
              eq: { ...settings.eq, [band]: value },
              normalization: null,
            }),
        ),
      ),
    ),
  );
  // Compressor.
  const compressorToggle = document.createElement('button');
  compressorToggle.type = 'button';
  compressorToggle.className = 'switch-row';
  compressorToggle.dataset.action = 'audio-compressor';
  compressorToggle.setAttribute('role', 'switch');
  compressorToggle.setAttribute(
    'aria-checked',
    String(settings.compressor.enabled),
  );
  compressorToggle.disabled = track.locked;
  compressorToggle.innerHTML = '<span></span>';
  compressorToggle.querySelector('span')!.textContent = t('audio.compressorOn');
  compressorToggle.onclick = () =>
    save('Compressor', {
      ...settings,
      compressor: {
        ...settings.compressor,
        enabled: !settings.compressor.enabled,
      },
      normalization: null,
    });
  const compressorField = (
    key: 'threshold' | 'ratio' | 'attack' | 'release',
    min: number,
    max: number,
    step: number,
    decimals: number,
    unit?: string,
  ) =>
    field(
      `right-audio-compressor-${key}`,
      t(`audio.${key}`),
      settings.compressor[key],
      { min, max, step, decimals, ...(unit ? { unit } : {}) },
      (value) =>
        save('Compressor', {
          ...settings,
          compressor: { ...settings.compressor, [key]: value },
          normalization: null,
        }),
    );
  elements.push(
    group(
      'compressor',
      t('audio.compressor'),
      () => ({
        ...settings,
        compressor: defaults.compressor,
        normalization: null,
      }),
      [
        compressorToggle,
        compressorField('threshold', -60, 0, 1, 0, 'dB'),
        compressorField('ratio', 1, 20, 0.5, 1),
        compressorField('attack', 0, 1, 0.001, 3, 's'),
        compressorField('release', 0.01, 1, 0.01, 2, 's'),
      ],
    ),
  );
  // Loudness: Analyze measures through the same graph; Apply stores it.
  const effects = clipTimeEffects(clip);
  const signature = normalizationSignature(
    {
      duration: clip.duration,
      sourceIn: clip.sourceIn,
      sourceOut: clip.sourceOut,
      speed: clip.speed,
      reversed: effects.reversed,
    },
    { ...settings, normalization: null },
  );
  const status = document.createElement('p');
  status.className = 'right-note';
  status.dataset.audio = 'loudness-status';
  status.setAttribute('role', 'status');
  const stored = settings.normalization;
  const analysis = analyses.get(clip.id);
  let targetLufs =
    stored?.targetLufs ?? analysis?.next.normalization?.targetLufs ?? -16;
  if (stored && stored.signature !== signature)
    status.textContent = t('audio.stale');
  else if (stored)
    status.textContent = t('audio.applied', {
      lufs: formatNumber(Math.round(stored.measuredLufs * 10) / 10),
      target: formatNumber(stored.targetLufs),
      gain: formatNumber(Math.round(stored.gainDb * 10) / 10),
    });
  else if (analysis && analysis.signature !== signature)
    status.textContent = t('audio.stale');
  else if (analysis)
    status.textContent = t('audio.measured', {
      lufs: formatNumber(Math.round(analysis.lufs * 10) / 10),
      gain: formatNumber(Math.round(analysis.gain * 10) / 10),
    });
  const analyze = document.createElement('button');
  analyze.type = 'button';
  analyze.className = 'button sm';
  analyze.dataset.action = 'audio-analyze';
  analyze.textContent = t('audio.analyze');
  analyze.disabled = track.locked || !decoder || clip.duration > 300;
  if (clip.duration > 300) status.textContent = t('audio.tooLong');
  analyze.onclick = () => {
    const audible = listAudibleClips(
      composition,
      session.source.assets as unknown as readonly PreviewAsset[],
    ).find((item) => item.clipId === clip.id);
    if (!audible || !decoder) {
      status.textContent = t('audio.unavailable');
      return;
    }
    const original = engine.state;
    analyze.disabled = true;
    status.textContent = t('audio.measuring');
    normalizeClip(audible, decoder, targetLufs).then(
      (next) => {
        if (engine.state !== original) {
          status.textContent = t('audio.stale');
          analyze.disabled = false;
          return;
        }
        analyses.set(clip.id, {
          signature,
          next,
          lufs: next.normalization!.measuredLufs,
          gain: next.normalization!.gainDb,
        });
        rerender?.();
      },
      (error: unknown) => {
        analyze.disabled = false;
        status.textContent = String(
          error instanceof Error ? error.message : error,
        );
      },
    );
  };
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'button sm primary';
  apply.dataset.action = 'audio-apply';
  apply.textContent = t('audio.apply');
  apply.disabled =
    track.locked || !analysis || analysis.signature !== signature;
  apply.onclick = () => {
    if (!analysis) return;
    const parsed = audioSettingsSchema.parse(analysis.next);
    save('Normalize loudness', parsed);
  };
  const actions = document.createElement('div');
  actions.className = 'right-audio-actions';
  actions.append(analyze, apply);
  elements.push(
    group(
      'loudness',
      t('audio.loudness'),
      () => ({ ...settings, normalization: null }),
      [
        field(
          'right-audio-target',
          t('audio.target'),
          targetLufs,
          { min: -36, max: -5, step: 1, decimals: 0, unit: 'LUFS' },
          (value) => {
            targetLufs = value;
          },
        ),
        actions,
        status,
      ],
    ),
  );
  // Voice / Music role and Auto ducking.
  const roles = document.createElement('div');
  roles.className = 'segmented right-audio-role';
  roles.setAttribute('role', 'radiogroup');
  roles.setAttribute('aria-label', t('audio.role'));
  for (const [value, key] of [
    ['none', 'audio.roleNone'],
    ['speech', 'audio.roleSpeech'],
    ['music', 'audio.roleMusic'],
  ] as const) {
    const option = document.createElement('button');
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.dataset.role = value;
    option.setAttribute('aria-checked', String(settings.role === value));
    option.textContent = t(key);
    option.disabled = track.locked;
    option.onclick = () =>
      save('Audio role', {
        ...settings,
        role: value,
        duck:
          value === 'music'
            ? settings.duck
            : { ...settings.duck, enabled: false },
      });
    roles.append(option);
  }
  const duck = document.createElement('button');
  duck.type = 'button';
  duck.className = 'switch-row';
  duck.dataset.action = 'audio-duck';
  duck.setAttribute('role', 'switch');
  duck.setAttribute('aria-checked', String(settings.duck.enabled));
  duck.disabled =
    track.locked || settings.role !== 'music' || clip.duration > 300;
  duck.title = t('audio.duckOnlyMusic');
  duck.innerHTML = '<span></span>';
  duck.querySelector('span')!.textContent = t('audio.duck');
  duck.onclick = () =>
    save('Auto ducking', {
      ...settings,
      duck: { ...settings.duck, enabled: !settings.duck.enabled },
    });
  const duckField = (
    key: 'thresholdDb' | 'reductionDb' | 'attack' | 'hold' | 'release',
    labelKey: string,
    min: number,
    max: number,
    step: number,
    decimals: number,
    unit: string,
  ) =>
    field(
      `right-audio-duck-${key}`,
      t(labelKey),
      settings.duck[key],
      { min, max, step, decimals, unit },
      (value) =>
        save('Auto ducking', {
          ...settings,
          duck: { ...settings.duck, [key]: value },
        }),
    );
  elements.push(
    group(
      'role',
      t('audio.roleGroup'),
      () => ({ ...settings, role: 'none', duck: defaults.duck }),
      [
        roles,
        duck,
        duckField('thresholdDb', 'audio.duckThreshold', -60, -6, 1, 0, 'dB'),
        duckField('reductionDb', 'audio.duckReduction', -36, 0, 1, 0, 'dB'),
        duckField('attack', 'audio.duckAttack', 0.01, 2, 0.01, 2, 's'),
        duckField('hold', 'audio.duckHold', 0, 2, 0.05, 2, 's'),
        duckField('release', 'audio.duckRelease', 0.01, 5, 0.05, 2, 's'),
      ],
    ),
  );
  // Track mute (AUD-007) and Detach audio (VID-006), as before.
  const trackMute = document.createElement('button');
  trackMute.type = 'button';
  trackMute.className = 'switch-row';
  trackMute.dataset.action = 'right-mute';
  trackMute.setAttribute('role', 'switch');
  trackMute.setAttribute('aria-checked', String(track.muted));
  trackMute.innerHTML = `${iconSvg(track.muted ? 'mute' : 'speaker', 20)}<span></span>`;
  trackMute.querySelector('span')!.textContent = t('right.muteTrack', {
    name: track.name,
  });
  trackMute.disabled = track.locked;
  trackMute.onclick = () => {
    try {
      run(track.muted ? 'Unmute track' : 'Mute track', [
        {
          type: 'SET_TRACK_STATE',
          compositionId: composition.id,
          trackId: track.id,
          enabled: track.enabled,
          locked: track.locked,
          muted: !track.muted,
        } as Command,
      ]);
    } catch (error) {
      report(error);
    }
  };
  elements.push(trackMute);
  if (layer.type === 'video') {
    const detach = document.createElement('button');
    detach.type = 'button';
    detach.className = 'button';
    detach.dataset.action = 'right-detach-audio';
    detach.innerHTML = `${iconSvg('audioFile', 20)}<span></span>`;
    detach.querySelector('span')!.textContent = t('command.detach-audio');
    detach.disabled = !describeSelection(
      session.source,
      session.selectedIds,
    ).every('detach-audio');
    detach.onclick = () => {
      try {
        performEdit(engine, session, 'detach-audio');
      } catch (error) {
        report(error);
      }
    };
    elements.push(detach);
  }
  return elements;
}
const openGroups = new Set<string>();
