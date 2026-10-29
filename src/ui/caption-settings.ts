// FIX9: which speech engine writes the captions is the owner's decision (the
// Admin app), never the person's: Auto captions just run. The signed owner
// config can carry `controls.captions = { engine, whisperModel }`; without it
// the offline Whisper engine runs, with its multilingual default model (the
// one that understands Hindi). The engine list shows only in Developer mode.
import { libraryClient } from '../library-client';
import { setLocalModelReady } from '../speech';
import { setWhisperVariant, whisperVariant } from '../speech/models';
import { refreshLocalEngines } from './local-engines';
import { whisperRunner } from './services';

export interface OwnerCaptionSettings {
  /** A speech-to-text provider id the owner wants used, or null. */
  readonly engine: string | null;
  /** tiny | base | small (a multilingual Whisper model), or null. */
  readonly whisperModel: string | null;
}

export function ownerCaptionSettings(): OwnerCaptionSettings {
  const raw = libraryClient().config()?.controls?.['captions'];
  const record =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : null;
  return {
    engine: text(record['engine']),
    whisperModel: text(record['whisperModel']),
  };
}

/** Puts the owner's model choice in force (and re-checks it is downloaded). */
export function applyOwnerCaptionSettings(): void {
  const { whisperModel } = ownerCaptionSettings();
  if (
    !whisperModel ||
    whisperModel === whisperVariant() ||
    !setWhisperVariant(whisperModel)
  )
    return;
  void whisperRunner
    ?.isReady()
    .then((ready) => {
      setLocalModelReady('local-whisper', ready);
      refreshLocalEngines();
    })
    .catch(() => {});
}
