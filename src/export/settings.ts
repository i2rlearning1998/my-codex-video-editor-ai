// Export settings and the plans derived from them (EXP-001, EXP-006). Pure: no DOM.

export type ExportQuality = 'low' | 'medium' | 'high';
export type ExportContainer = 'mp4' | 'webm';

export interface ExportPreset {
  readonly id: string;
  /** Translation key of the preset's name. */
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly quality: ExportQuality;
}

/** EXP-006 presets. "custom" keeps whatever size is typed. */
export const EXPORT_PRESETS: readonly ExportPreset[] = [
  {
    id: 'youtube-1080',
    label: 'export.preset.youtube1080',
    width: 1920,
    height: 1080,
    quality: 'high',
  },
  {
    id: 'youtube-4k',
    label: 'export.preset.youtube4k',
    width: 3840,
    height: 2160,
    quality: 'high',
  },
  {
    id: 'vertical',
    label: 'export.preset.vertical',
    width: 1080,
    height: 1920,
    quality: 'high',
  },
  {
    id: 'square',
    label: 'export.preset.square',
    width: 1080,
    height: 1080,
    quality: 'high',
  },
  {
    id: 'portrait',
    label: 'export.preset.portrait',
    width: 1080,
    height: 1350,
    quality: 'high',
  },
  {
    id: 'whatsapp',
    label: 'export.preset.whatsapp',
    width: 854,
    height: 480,
    quality: 'low',
  },
];
export const FRAME_RATES = [24, 25, 30, 50, 60] as const;

export interface ExportSettings {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly quality: ExportQuality;
  /** Seconds of composition time. */
  readonly start: number;
  readonly end: number;
  readonly fileName: string;
}

export const MIN_SIZE = 16;
export const MAX_SIZE = 7680;

/** H.264 needs even dimensions; everything is kept even and within bounds. */
export function evenSize(value: number): number {
  const rounded = Math.round(Number.isFinite(value) ? value : MIN_SIZE);
  const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, rounded));
  return clamped % 2 ? clamped - 1 : clamped;
}

/** A file-system-safe name without an extension ("export" when nothing is left). */
export function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\.(mp4|webm|json|png)$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'export';
}

/** Default settings for a composition: its own size and rate, the whole length. */
export function defaultSettings(
  composition: { width: number; height: number; fps: number; duration: number },
  projectName: string,
): ExportSettings {
  return {
    width: evenSize(composition.width),
    height: evenSize(composition.height),
    fps: composition.fps,
    quality: 'high',
    start: 0,
    end: composition.duration,
    fileName: safeFileName(projectName),
  };
}

/** Throws a plain-language error for settings that cannot be exported. */
export function validateSettings(
  settings: ExportSettings,
  duration: number,
): ExportSettings {
  if (!(settings.fps > 0 && settings.fps <= 240))
    throw new RangeError('Frame rate must be between 1 and 240');
  if (
    evenSize(settings.width) !== settings.width ||
    evenSize(settings.height) !== settings.height
  )
    throw new RangeError(
      `Width and height must be even numbers from ${MIN_SIZE} to ${MAX_SIZE}`,
    );
  if (!(
    settings.start >= 0 &&
    settings.end <= duration + 1e-9 &&
    settings.end > settings.start
  ))
    throw new RangeError(
      'The export range must lie inside the composition and end after it starts',
    );
  return { ...settings, fileName: safeFileName(settings.fileName) };
}

/** Output frame count and each frame's composition time (frame i shows start + i/fps). */
export function frameTimes(
  settings: Pick<ExportSettings, 'fps' | 'start' | 'end'>,
): number[] {
  const count = Math.max(
    1,
    Math.round((settings.end - settings.start) * settings.fps),
  );
  return Array.from(
    { length: count },
    (_, index) => settings.start + index / settings.fps,
  );
}

/**
 * The composition fitted into the output frame (letterboxed, centred): a view
 * matrix for drawComposition at pixel ratio 1.
 */
export function fitMatrix(
  composition: { width: number; height: number },
  width: number,
  height: number,
): [number, number, number, number, number, number] {
  const zoom = Math.min(width / composition.width, height / composition.height);
  return [
    zoom,
    0,
    0,
    zoom,
    (width - composition.width * zoom) / 2,
    (height - composition.height * zoom) / 2,
  ];
}

/** Estimated seconds left, from the average time per frame so far. */
export function remainingSeconds(
  done: number,
  total: number,
  elapsedMs: number,
): number | null {
  if (done <= 0 || elapsedMs <= 0) return null;
  return ((total - done) * elapsedMs) / done / 1000;
}

/**
 * EXP-008 pre-flight: the assets used by clips overlapping [start, end) whose
 * bytes are not in the media store. `present` answers per asset id.
 */
export function usedAssetIds(
  composition: {
    readonly tracks: readonly {
      readonly clips: readonly {
        readonly assetId: string | null;
        readonly startTime: number;
        readonly duration: number;
        readonly enabled: boolean;
      }[];
    }[];
  },
  start: number,
  end: number,
): string[] {
  const ids = new Set<string>();
  for (const track of composition.tracks)
    for (const clip of track.clips)
      if (
        clip.assetId &&
        clip.enabled &&
        clip.startTime < end &&
        clip.startTime + clip.duration > start
      )
        ids.add(clip.assetId);
  return [...ids];
}
