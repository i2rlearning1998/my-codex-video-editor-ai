import type { PreviewAsset } from '../media/previews';
import type { EditorEngine } from '../core';
import { listAudibleClips, type AudioDecoder } from '../media/audio';
import { normalizeClip } from '../audio/normalize';
import {
  readAudioSettings,
  registerAudioCommands,
  setClipAudio,
  type AudioSettings,
} from '../audio/settings';
import { soundText as t } from '../audio/strings';
import { subscribe } from '../i18n';
import type { EditorSession } from './session';

export function mountSoundPanel(
  root: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  decoder: AudioDecoder,
) {
  registerAudioCommands(engine);
  const container = document.createElement('section');
  container.id = 'sound-panel';
  container.hidden = true;
  root.querySelector('.library-footer')!.before(container);
  let signature = '';
  const selected = () => {
    const composition = session.source.composition;
    const ids = session.source.selectedIds ?? [];
    if (ids.length !== 1) return null;
    for (const track of composition.tracks) {
      const clip = track.clips.find((c) => c.layerId === ids[0]);
      const asset =
        clip && session.source.assets.find((a) => a.id === clip.assetId);
      if (clip && (asset?.type === 'audio' || asset?.type === 'video'))
        return { composition, track, clip };
    }
    return null;
  };
  const render = () => {
    const target = selected();
    const next = JSON.stringify(
      target ? [target.clip, target.track.locked] : null,
    );
    if (next === signature) return;
    signature = next;
    container.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = t('title');
    container.append(heading);
    if (!target) {
      const p = document.createElement('p');
      p.textContent = t('empty');
      container.append(p);
      return;
    }
    const settings = readAudioSettings(target.clip);
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    if (target.track.locked) status.textContent = t('locked');
    const fields = document.createElement('fieldset');
    fields.disabled = target.track.locked;
    container.append(fields, status);
    const save = (
      value: AudioSettings | null,
      preserveNormalization = false,
    ) => {
      if (value && !preserveNormalization)
        value = { ...value, normalization: null };
      try {
        setClipAudio(
          engine,
          target.composition.id,
          target.clip.id,
          value,
          t('edit'),
        );
      } catch (error) {
        status.textContent = t('error', { error: String(error) });
      }
    };
    const number = (
      key: 'gainDb' | 'pan' | 'fadeIn' | 'fadeOut',
      min: number,
      max: number,
      step: number,
    ) => {
      const label = document.createElement('label');
      label.textContent = t(key);
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(settings[key]);
      input.setAttribute('aria-label', t(key));
      input.onchange = () => save({ ...settings, [key]: input.valueAsNumber });
      label.append(input);
      fields.append(label, document.createElement('br'));
    };
    number('gainDb', -96, 24, 0.5);
    number('pan', -1, 1, 0.1);
    number('fadeIn', 0, 86400, 0.1);
    number('fadeOut', 0, 86400, 0.1);
    const label = document.createElement('label');
    label.textContent = t('muted');
    const mute = document.createElement('input');
    mute.type = 'checkbox';
    mute.checked = settings.muted;
    mute.setAttribute('aria-label', t('muted'));
    mute.onchange = () => save({ ...settings, muted: mute.checked });
    label.append(mute);
    fields.append(label);
    const button = (key: string, run: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t(key);
      b.onclick = run;
      fields.append(b);
    };
    button('key', () => {
      const time = Math.max(
        0,
        Math.min(
          target.clip.duration,
          session.currentTime - target.clip.startTime,
        ),
      );
      save({
        ...settings,
        volumeKeys: [
          ...settings.volumeKeys.filter((k) => Math.abs(k.time - time) > 1e-6),
          { time, db: settings.gainDb },
        ].sort((a, b) => a.time - b.time),
      });
    });
    button('clearKeys', () => save({ ...settings, volumeKeys: [] }));
    const numeric = (
      key: string,
      value: number,
      min: number,
      max: number,
      step: number,
      change: (value: number) => void,
    ) => {
      const label = document.createElement('label');
      label.textContent = t(key);
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      input.setAttribute('aria-label', t(key));
      input.onchange = () => change(input.valueAsNumber);
      label.append(input);
      fields.append(label, document.createElement('br'));
      return input;
    };
    for (const band of ['low', 'mid', 'high'] as const)
      numeric(band, settings.eq[band], -18, 18, 0.5, (v) =>
        save({ ...settings, eq: { ...settings.eq, [band]: v } }),
      );
    const compressorLabel = document.createElement('label');
    compressorLabel.textContent = t('compressor');
    const compressor = document.createElement('input');
    compressor.type = 'checkbox';
    compressor.checked = settings.compressor.enabled;
    compressor.setAttribute('aria-label', t('compressor'));
    compressor.onchange = () =>
      save({
        ...settings,
        compressor: { ...settings.compressor, enabled: compressor.checked },
      });
    compressorLabel.append(compressor);
    fields.append(compressorLabel);
    for (const [key, min, max, step] of [
      ['threshold', -60, 0, 1],
      ['ratio', 1, 20, 0.5],
      ['attack', 0, 1, 0.001],
      ['release', 0.01, 1, 0.01],
    ] as const)
      numeric(key, settings.compressor[key], min, max, step, (v) =>
        save({ ...settings, compressor: { ...settings.compressor, [key]: v } }),
      );
    let targetLufs = settings.normalization?.targetLufs ?? -16;
    numeric('target', targetLufs, -36, -5, 1, (v) => {
      targetLufs = v;
    });
    button('normalize', () => {
      void (async () => {
        const original = engine.state;
        const clip = listAudibleClips(
          target.composition,
          session.source.assets as unknown as readonly PreviewAsset[],
        ).find((c) => c.clipId === target.clip.id);
        if (!clip) {
          status.textContent = t('empty');
          return;
        }
        fields.disabled = true;
        status.textContent = t('measuring');
        try {
          const next = await normalizeClip(clip, decoder, targetLufs);
          if (engine.state !== original) throw new Error(t('stale'));
          save(next, true);
        } catch (error) {
          status.textContent = t('error', { error: String(error) });
        } finally {
          fields.disabled = target.track.locked;
        }
      })();
    });
    if (settings.normalization) {
      const n = settings.normalization;
      status.textContent =
        t('normalized', {
          lufs: Math.round(n.measuredLufs * 10) / 10,
          gain: Math.round(n.gainDb * 10) / 10,
        }) + (n.limited ? ' ' + t('limited') : '');
    }
    button('reset', () => save(null));
    const count = document.createElement('p');
    count.textContent = t('keys', { count: settings.volumeKeys.length });
    fields.append(count);
  };
  const off = session.onChange(render);
  const language = subscribe(() => {
    signature = '';
    render();
  });
  render();
  return {
    setVisible(visible: boolean) {
      container.hidden = !visible;
    },
    dispose() {
      off();
      language();
      container.remove();
    },
  };
}
