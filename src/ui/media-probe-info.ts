// FINAL2 U8: what the media probe (src/media-probe, docs/MEDIA-PROBE-API.md)
// learned about a file, in plain words for Media › Details and import notes.
import type { MediaDetails } from '../media-probe';
import { formatNumber, t } from '../i18n';

/** The probe record an import stored on the asset, or null (images, old imports). */
export function storedDetails(metadata: object): MediaDetails | null {
  const value = (metadata as { mediaProbe?: unknown }).mediaProbe;
  return value && typeof value === 'object' && 'kind' in value
    ? (value as MediaDetails)
    : null;
}

const unknown = () => t('probe.unknown');
const round = (value: number, places = 2) =>
  formatNumber(Math.round(value * 10 ** places) / 10 ** places);

/** Details rows; a missing value reads Unknown, never zero. */
export function probeRows(details: MediaDetails): [string, string][] {
  const rows: [string, string][] = [];
  const video = details.kind === 'video';
  if (video)
    rows.push([t('probe.videoCodec'), details.videoCodec ?? unknown()]);
  if (details.kind !== 'image')
    rows.push([
      t('probe.audioCodec'),
      details.hasAudio ? (details.audioCodec ?? unknown()) : t('probe.none'),
    ]);
  if (video) {
    rows.push([
      t('probe.resolution'),
      details.width !== null && details.height !== null
        ? `${formatNumber(details.width)} × ${formatNumber(details.height)}`
        : unknown(),
    ]);
    rows.push([
      t('probe.fps'),
      details.fps !== null
        ? t('probe.fpsValue', { fps: round(details.fps) })
        : unknown(),
    ]);
    rows.push([
      t('probe.vfr'),
      details.isVariableFrameRate === null
        ? unknown()
        : details.isVariableFrameRate
          ? t('probe.yes')
          : t('probe.no'),
    ]);
    rows.push([
      t('probe.rotation'),
      details.rotation === null
        ? unknown()
        : details.rotation
          ? t('probe.degrees', { degrees: formatNumber(details.rotation) })
          : t('probe.none'),
    ]);
  }
  if (details.kind !== 'image')
    rows.push([
      t('probe.audio'),
      !details.hasAudio
        ? t('probe.none')
        : details.audioChannels !== null && details.sampleRate !== null
          ? t('probe.audioValue', {
              channels:
                details.audioChannels === 1
                  ? t('probe.mono')
                  : details.audioChannels === 2
                    ? t('probe.stereo')
                    : t('probe.channels', {
                        count: formatNumber(details.audioChannels),
                      }),
              rate: round(details.sampleRate / 1000, 1),
            })
          : unknown(),
    ]);
  if (details.container) rows.push([t('probe.container'), details.container]);
  return rows;
}

/** Plain notes about rotation and variable frame rate (nothing to fix by hand). */
export function probeNotes(details: MediaDetails, name: string): string[] {
  const notes: string[] = [];
  if (details.kind === 'video' && details.rotation)
    notes.push(
      t('probe.rotatedNote', {
        name,
        degrees: formatNumber(details.rotation),
      }),
    );
  if (details.kind === 'video' && details.isVariableFrameRate)
    notes.push(t('probe.vfrNote', { name }));
  return notes;
}

/** A probe failure reason ("This browser cannot decode video codec X") in plain words. */
export function codecMessage(name: string, error: string | undefined) {
  const match = /cannot decode (video|audio) codec (\S+)/.exec(error ?? '');
  return match
    ? t(
        match[1] === 'video'
          ? 'probe.videoCodecError'
          : 'probe.audioCodecError',
        {
          name,
          codec: match[2]!,
        },
      )
    : null;
}
