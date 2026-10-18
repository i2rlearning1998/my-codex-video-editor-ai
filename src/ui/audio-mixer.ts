// FINAL2 U5: the Mixer at the top of the left Audio category. Master volume
// (0 to 200 %, `project.settings.masterVolume`, one undo step through the
// audio-mixer capability), a master meter and one row per lane that can
// sound (video and audio): its meter, mute (SET_TRACK_STATE, the lane menu's
// command), solo (the session's transient solo, as in the lane menu) and its
// volume (`track.volume`). Meters read `AudioEngine.meters`, sampled by the
// playback sync on every drawn frame; nothing here owns audio state.
import { safeVolume, setMixerVolume } from '../audio/mixer';
import type { AudioMeters, MeterSnapshot } from '../audio/meters';
import type { Command, EditorEngine } from '../core';
import { t } from '../i18n';
import { createNumberField } from './components/number-field';
import { iconSvg } from './icons';
import type { EditorSession } from './session';

export interface MixerOptions {
  engine: EditorEngine;
  session: EditorSession;
  meters: AudioMeters;
  report(error: unknown): void;
}

/** The project's master volume (linear 0 to 2, absent is unity). */
export const projectMasterVolume = (engine: EditorEngine) =>
  safeVolume(
    (engine.state.settings as { masterVolume?: unknown }).masterVolume ?? 1,
  );

/** A level (linear peak) as a 0 to 1 bar width on a dB scale (-60 to +6). */
export function meterFraction(peak: number): number {
  if (!(peak > 0)) return 0;
  const db = 20 * Math.log10(peak);
  return Math.max(0, Math.min(1, (db + 60) / 66));
}

export function mountAudioMixer(host: HTMLElement, options: MixerOptions) {
  const { engine, session } = options;
  host.classList.add('audio-mixer');
  host.setAttribute('aria-label', t('mixer.title'));
  const meter = (id: string, label: string) => {
    const element = document.createElement('div');
    element.className = 'audio-meter';
    element.dataset.meter = id;
    element.setAttribute('role', 'meter');
    element.setAttribute('aria-label', label);
    element.setAttribute('aria-valuemin', '0');
    element.setAttribute('aria-valuemax', '100');
    element.setAttribute('aria-valuenow', '0');
    element.innerHTML =
      '<span class="audio-meter-rms"></span><span class="audio-meter-peak"></span>';
    return element;
  };
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      options.report(error);
    }
  };
  let key = '';
  const render = () => {
    const composition = session.source.composition;
    const tracks = [...composition.tracks]
      .sort((a, b) => a.order - b.order)
      .filter((track) => track.type === 'audio' || track.type === 'video');
    const master = projectMasterVolume(engine);
    const next = JSON.stringify([
      composition.id,
      master,
      session.soloTrackIds,
      tracks.map((track) => [
        track.id,
        track.type,
        track.muted,
        track.locked,
        track.volume ?? 1,
      ]),
    ]);
    if (next === key) return;
    key = next;
    const heading = document.createElement('h3');
    heading.className = 'audio-mixer-title';
    heading.textContent = t('mixer.title');
    const masterRow = document.createElement('div');
    masterRow.className = 'audio-mixer-master';
    masterRow.append(
      createNumberField({
        id: 'mixer-master',
        label: t('mixer.master'),
        value: Math.round(master * 100),
        min: 0,
        max: 200,
        step: 1,
        decimals: 0,
        unit: '%',
        slider: true,
        presets: [0, 50, 100, 150, 200],
        className: 'right-row',
        onCommit: (percent) =>
          safely(() =>
            setMixerVolume(
              engine,
              { scope: 'master', volume: percent / 100 },
              'Master volume',
            ),
          ),
        onPreview: () => undefined,
      }),
      meter('master', t('mixer.masterMeter')),
    );
    const list = document.createElement('div');
    list.className = 'audio-mixer-tracks';
    list.setAttribute('role', 'list');
    for (const track of tracks) {
      const name = t('lane.name', {
        kind: t(`lane.kind.${track.type}`),
        n:
          tracks.filter((other) => other.type === track.type).indexOf(track) +
          1,
      });
      const row = document.createElement('div');
      row.className = 'audio-mixer-track';
      row.dataset.track = track.id;
      row.setAttribute('role', 'listitem');
      const label = document.createElement('span');
      label.className = 'audio-mixer-name';
      label.textContent = name;
      label.title = track.name;
      const toggle = (
        action: string,
        pressed: boolean,
        icon: string,
        text: string,
        run: () => void,
      ) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'icon-button audio-mixer-toggle';
        button.dataset.action = action;
        button.setAttribute('aria-pressed', String(pressed));
        button.setAttribute('aria-label', text);
        button.title = text;
        button.innerHTML = icon;
        button.onclick = () => safely(run);
        return button;
      };
      const soloed = session.soloTrackIds.includes(track.id);
      const mute = toggle(
        'mixer-mute',
        track.muted,
        iconSvg(track.muted ? 'mute' : 'speaker', 20),
        t(track.muted ? 'track.unmute' : 'track.mute', { name }),
        () =>
          engine.commands.transaction(
            track.muted ? 'Unmute track' : 'Mute track',
            [
              {
                type: 'SET_TRACK_STATE',
                compositionId: composition.id,
                trackId: track.id,
                enabled: track.enabled,
                locked: track.locked,
                muted: !track.muted,
              } as Command,
            ],
          ),
      );
      mute.disabled = track.locked;
      const solo = toggle(
        'mixer-solo',
        soloed,
        `<span class="audio-mixer-solo">${t('mixer.soloShort')}</span>`,
        t(soloed ? 'track.unsolo' : 'track.solo', { name }),
        () => session.toggleSolo(track.id),
      );
      const volume = createNumberField({
        id: `mixer-track-${track.id}`,
        label: t('mixer.trackVolume', { name }),
        value: Math.round(safeVolume(track.volume ?? 1) * 100),
        min: 0,
        max: 200,
        step: 1,
        decimals: 0,
        unit: '%',
        slider: true,
        compact: true,
        disabled: track.locked,
        className: 'audio-mixer-volume',
        onCommit: (percent) =>
          safely(() =>
            setMixerVolume(
              engine,
              {
                scope: 'track',
                compositionId: composition.id,
                trackId: track.id,
                volume: percent / 100,
              },
              'Track volume',
            ),
          ),
        onPreview: () => undefined,
      });
      row.append(label, mute, solo, volume, meter(track.id, name));
      list.append(row);
    }
    const empty = document.createElement('p');
    empty.className = 'audio-mixer-empty';
    empty.textContent = t('mixer.empty');
    empty.hidden = tracks.length > 0;
    const note = document.createElement('p');
    note.className = 'audio-mixer-note';
    note.textContent = t('mixer.note');
    host.replaceChildren(heading, masterRow, list, empty, note);
  };
  const paint = (snapshot: MeterSnapshot) => {
    for (const element of host.querySelectorAll<HTMLElement>('.audio-meter')) {
      const id = element.dataset.meter!;
      const level =
        id === 'master' ? snapshot.master : (snapshot.tracks[id] ?? null);
      const peak = level?.peak ?? 0;
      const fraction = meterFraction(peak);
      element.style.setProperty('--meter-peak', String(fraction));
      element.style.setProperty(
        '--meter-rms',
        String(meterFraction(level?.rms ?? 0)),
      );
      element.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
      element.classList.toggle('clipping', peak > 1);
      element.dataset.active = String(peak > 0);
    }
  };
  render();
  const offEngine = engine.on('state:changed', render);
  const offSession = session.onChange(render);
  const offMeters = options.meters.subscribe(paint);
  return {
    dispose() {
      offEngine();
      offSession();
      offMeters();
    },
  };
}
