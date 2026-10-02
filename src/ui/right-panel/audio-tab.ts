// I4: the right panel's Audio tab, as its own thin module so the audio
// engine's Sound panel (PR #14, Wave 7) can fill it without touching the
// rest of the right panel. Today: track mute (AUD-007) and Detach audio
// (VID-006) work; clip volume and everything else name Wave 7.
import { findClipByLayer, type Command, type EditorEngine } from '../../core';
import { t } from '../../i18n';
import { performEdit } from '../editing';
import { iconSvg } from '../icons';
import { describeSelection, selectionRoots } from '../selection-context';
import type { EditorSession } from '../session';

export function audioTab(
  engine: EditorEngine,
  session: EditorSession,
  run: (label: string, commands: (Command | null)[]) => void,
  report: (error: unknown) => void,
): HTMLElement[] {
  const roots = selectionRoots(session.source, session.selectedIds);
  const layer = roots.length === 1 ? roots[0]! : null;
  const composition = session.source.composition;
  const located = layer ? findClipByLayer(composition, layer.id) : null;
  const track = located?.track ?? null;
  const elements: HTMLElement[] = [];
  // Clip volume waits for the audio engine (Wave 7).
  const volume = document.createElement('label');
  volume.className = 'right-row right-row-planned';
  volume.title = t('toolbar.later', { wave: '7', id: 'AUD-002' });
  const caption = document.createElement('span');
  caption.textContent = t('right.volume');
  const range = document.createElement('input');
  range.type = 'range';
  range.id = 'right-volume';
  range.min = '0';
  range.max = '100';
  range.value = '100';
  range.disabled = true;
  range.setAttribute('aria-label', t('right.volume'));
  volume.append(caption, range);
  elements.push(volume);
  // Track mute (audible since W4-C).
  if (track) {
    const mute = document.createElement('button');
    mute.type = 'button';
    mute.className = 'switch-row';
    mute.dataset.action = 'right-mute';
    mute.setAttribute('role', 'switch');
    mute.setAttribute('aria-checked', String(track.muted));
    mute.innerHTML = `${iconSvg(track.muted ? 'mute' : 'speaker', 16)}<span></span>`;
    mute.querySelector('span')!.textContent = t('right.muteTrack', {
      name: track.name,
    });
    mute.disabled = track.locked;
    mute.onclick = () => {
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
    elements.push(mute);
  }
  // Detach audio (video clips with their own sound).
  if (layer?.type === 'video') {
    const detach = document.createElement('button');
    detach.type = 'button';
    detach.className = 'button';
    detach.dataset.action = 'right-detach-audio';
    detach.innerHTML = `${iconSvg('audioFile', 16)}<span></span>`;
    detach.querySelector('span')!.textContent = t('command.detachAudio');
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
  const later = document.createElement('span');
  later.className = 'quiet-tag';
  later.textContent = t('toolbar.later', { wave: '7', id: 'AUD-002' });
  elements.push(later);
  return elements;
}
