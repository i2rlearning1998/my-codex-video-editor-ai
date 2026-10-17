// B1: the New AI video form's values and how they become the BRIEF section.
// The one rule: whatever the user FILLS is a hard requirement (LOCKED);
// whatever they leave EMPTY is listed once under FREE (the creator decides).
// Files are never read here: only their names and kinds are kept, and the
// user attaches them in the Claude chat.

export const BRIEF_ASPECTS = [
  '16:9',
  '9:16',
  '1:1',
  '4:5',
  '2:3',
  '21:9',
  '4:3',
] as const;
export const BRIEF_PLATFORMS = ['youtube', 'reels', 'shorts', 'other'] as const;
export type BriefFreedom = 'strict' | 'guided' | 'free';

export interface BriefFormValues {
  /** A style's library id; null is "No style - you decide". */
  readonly styleId: string | null;
  readonly topic: string;
  readonly language: string;
  /** Seconds; null is "auto". */
  readonly lengthSeconds: number | null;
  readonly aspect: '' | (typeof BRIEF_ASPECTS)[number];
  readonly fps: number | null;
  readonly platform: '' | (typeof BRIEF_PLATFORMS)[number];
  readonly platformOther: string;
  readonly script: {
    readonly on: boolean;
    readonly text: string;
    readonly mode: 'exact' | 'improve';
  };
  readonly audio: {
    readonly on: boolean;
    readonly file: string;
    readonly transcript: 'have' | 'transcribe';
    readonly transcriptText: string;
  };
  readonly topicOnly: boolean;
  readonly video: {
    readonly on: boolean;
    readonly file: string;
    readonly addMotion: boolean;
  };
  readonly notes: {
    readonly on: boolean;
    readonly files: readonly string[];
    readonly text: string;
  };
  readonly references: {
    readonly images: readonly string[];
    readonly videos: readonly string[];
    readonly logo: string;
    readonly colours: readonly string[];
    readonly fonts: string;
  };
  /** '' is the default (Guided) left to the creator. */
  readonly freedom: '' | BriefFreedom;
  readonly locks: {
    readonly script: boolean;
    readonly style: boolean;
    readonly colours: boolean;
    readonly length: boolean;
  };
  readonly assets: {
    readonly aiImages: number;
    readonly aiVideos: number;
    readonly onlyMine: boolean;
  };
  readonly voice: '' | 'mine' | 'ai' | 'none';
  readonly music: '' | 'none' | 'library' | 'mine';
  readonly musicFile: string;
  readonly extra: string;
}

export function emptyBriefForm(): BriefFormValues {
  return {
    styleId: null,
    topic: '',
    language: '',
    lengthSeconds: null,
    aspect: '',
    fps: null,
    platform: '',
    platformOther: '',
    script: { on: false, text: '', mode: 'exact' },
    audio: {
      on: false,
      file: '',
      transcript: 'transcribe',
      transcriptText: '',
    },
    topicOnly: false,
    video: { on: false, file: '', addMotion: true },
    notes: { on: false, files: [], text: '' },
    references: { images: [], videos: [], logo: '', colours: [], fonts: '' },
    freedom: '',
    locks: { script: false, style: false, colours: false, length: false },
    assets: { aiImages: 0, aiVideos: 0, onlyMine: false },
    voice: '',
    music: '',
    musicFile: '',
    extra: '',
  };
}

/** A stored form read defensively (a My brief may come from an older build). */
export function normalizeBriefForm(value: unknown): BriefFormValues {
  const base = emptyBriefForm();
  if (!value || typeof value !== 'object') return base;
  const v = value as Record<string, unknown>;
  const text = (x: unknown, max = 20_000) =>
    typeof x === 'string' ? x.slice(0, max) : '';
  const list = (x: unknown) =>
    Array.isArray(x)
      ? x
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.slice(0, 200))
          .slice(0, 50)
      : [];
  const object = (x: unknown) =>
    x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
  const count = (x: unknown, max: number) =>
    typeof x === 'number' && Number.isFinite(x)
      ? Math.max(0, Math.min(max, Math.round(x)))
      : 0;
  const positive = (x: unknown) =>
    typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null;
  const pick = <T extends string>(
    x: unknown,
    options: readonly T[],
    fallback: T,
  ) => (options.includes(x as T) ? (x as T) : fallback);
  const script = object(v.script),
    audio = object(v.audio),
    video = object(v.video),
    notes = object(v.notes),
    references = object(v.references),
    locks = object(v.locks),
    assets = object(v.assets);
  return {
    styleId: typeof v.styleId === 'string' ? v.styleId.slice(0, 200) : null,
    topic: text(v.topic, 500),
    language: text(v.language, 80),
    lengthSeconds: positive(v.lengthSeconds),
    aspect: pick(v.aspect, ['', ...BRIEF_ASPECTS], ''),
    fps: positive(v.fps),
    platform: pick(v.platform, ['', ...BRIEF_PLATFORMS], ''),
    platformOther: text(v.platformOther, 80),
    script: {
      on: script.on === true,
      text: text(script.text),
      mode: pick(script.mode, ['exact', 'improve'], 'exact'),
    },
    audio: {
      on: audio.on === true,
      file: text(audio.file, 200),
      transcript: pick(audio.transcript, ['have', 'transcribe'], 'transcribe'),
      transcriptText: text(audio.transcriptText),
    },
    topicOnly: v.topicOnly === true,
    video: {
      on: video.on === true,
      file: text(video.file, 200),
      addMotion: video.addMotion !== false,
    },
    notes: {
      on: notes.on === true,
      files: list(notes.files),
      text: text(notes.text),
    },
    references: {
      images: list(references.images),
      videos: list(references.videos),
      logo: text(references.logo, 200),
      colours: list(references.colours).filter((c) =>
        /^#[0-9a-fA-F]{6}$/.test(c),
      ),
      fonts: text(references.fonts, 200),
    },
    freedom: pick(v.freedom, ['', 'strict', 'guided', 'free'], ''),
    locks: {
      script: locks.script === true,
      style: locks.style === true,
      colours: locks.colours === true,
      length: locks.length === true,
    },
    assets: {
      aiImages: count(assets.aiImages, 50),
      aiVideos: count(assets.aiVideos, 20),
      onlyMine: assets.onlyMine === true,
    },
    voice: pick(v.voice, ['', 'mine', 'ai', 'none'], ''),
    music: pick(v.music, ['', 'none', 'library', 'mine'], ''),
    musicFile: text(v.musicFile, 200),
    extra: text(v.extra),
  };
}

/** One file the user attaches in the Claude chat. */
export interface BriefFile {
  readonly name: string;
  readonly kind: string;
}
/** Every file the form names, in form order, each once. */
export function briefFiles(form: BriefFormValues): BriefFile[] {
  const files: BriefFile[] = [];
  const add = (name: string, kind: string) => {
    const trimmed = name.trim();
    if (trimmed && !files.some((file) => file.name === trimmed))
      files.push({ name: trimmed, kind });
  };
  if (form.audio.on) add(form.audio.file, 'voice-over audio');
  if (form.video.on) add(form.video.file, 'recorded video');
  if (form.notes.on) for (const file of form.notes.files) add(file, 'notes');
  for (const file of form.references.images) add(file, 'reference image');
  for (const file of form.references.videos) add(file, 'reference video');
  add(form.references.logo, 'logo');
  if (form.music === 'mine') add(form.musicFile, 'music');
  return files;
}
/** "Attach these files in the Claude chat: ...", or '' with no files. */
export function briefFilesText(form: BriefFormValues): string {
  const files = briefFiles(form);
  return files.length
    ? `Attach these files in the Claude chat: ${files
        .map((file) => `${file.name} (${file.kind})`)
        .join(', ')}.`
    : '';
}

export interface BriefStyleInfo {
  readonly id: string;
  readonly name: string;
}
const PLATFORM_NAMES: Record<(typeof BRIEF_PLATFORMS)[number], string> = {
  youtube: 'YouTube',
  reels: 'Reels',
  shorts: 'Shorts',
  other: 'other',
};
const FREEDOM_TEXT: Record<BriefFreedom, string> = {
  strict: 'Strict: follow the style exactly, no deviation.',
  guided: 'Guided: follow the style and add your own creativity.',
  free: 'Free: surprise me; the style is only a starting point.',
};
const seconds = (value: number) =>
  Number.isInteger(value) ? `${value} s` : `${value.toFixed(1)} s`;

/**
 * The LOCKED and FREE lines of the brief. Labels are English on purpose:
 * the brief is read by the AI creator, whatever the editor's language.
 */
export function briefSections(
  form: BriefFormValues,
  style: BriefStyleInfo | null,
): { locked: string[]; free: string[] } {
  const locked: string[] = [];
  const free: string[] = [];
  const field = (filled: boolean, line: () => string, label: string) => {
    if (filled) locked.push(line());
    else free.push(label);
  };
  field(!!style, () => `Style: ${style!.name} (${style!.id})`, 'Style');
  field(
    !!form.topic.trim(),
    () => `Topic / title: ${form.topic.trim()}`,
    'Topic / title',
  );
  field(
    !!form.language.trim(),
    () => `Language: ${form.language.trim()}`,
    'Language',
  );
  field(
    form.lengthSeconds !== null,
    () => `Length: ${seconds(form.lengthSeconds!)}`,
    'Length',
  );
  field(!!form.aspect, () => `Aspect ratio: ${form.aspect}`, 'Aspect ratio');
  field(form.fps !== null, () => `FPS: ${form.fps}`, 'FPS');
  field(
    !!form.platform,
    () =>
      `Platform: ${
        form.platform === 'other' && form.platformOther.trim()
          ? form.platformOther.trim()
          : PLATFORM_NAMES[form.platform as (typeof BRIEF_PLATFORMS)[number]]
      }`,
    'Platform',
  );
  // Content the user can give.
  const script = form.script.on && form.script.text.trim();
  field(
    !!script,
    () =>
      form.script.mode === 'exact'
        ? `Script (use exactly, word for word):\n${form.script.text.trim()}`
        : `Script (improve it, keep its meaning and facts):\n${form.script.text.trim()}`,
    'Script',
  );
  const audio = form.audio.on && form.audio.file.trim();
  field(
    !!audio,
    () =>
      `Voice-over audio: ${form.audio.file.trim()} (attached); ${
        form.audio.transcript === 'have' && form.audio.transcriptText.trim()
          ? `transcript:\n${form.audio.transcriptText.trim()}`
          : 'please transcribe it'
      }`,
    'Voice-over audio',
  );
  if (form.topicOnly)
    locked.push('Content: topic only; write the script yourself.');
  const video = form.video.on && form.video.file.trim();
  field(
    !!video,
    () =>
      `My recorded video: ${form.video.file.trim()} (attached)${
        form.video.addMotion ? '; add motion graphics to it' : ''
      }`,
    'Recorded video',
  );
  const notes =
    form.notes.on && (form.notes.files.length || form.notes.text.trim());
  field(
    !!notes,
    () =>
      [
        form.notes.files.length
          ? `Notes / documents: ${form.notes.files.join(', ')} (attached)`
          : 'Notes',
        form.notes.text.trim() ? `:\n${form.notes.text.trim()}` : '',
      ].join(''),
    'Notes / documents',
  );
  // References.
  const refs = form.references;
  field(
    refs.images.length > 0,
    () =>
      `Reference images (make it feel like these): ${refs.images.join(', ')} (attached)`,
    'Reference images',
  );
  field(
    refs.videos.length > 0,
    () =>
      `Reference videos (make it feel like these): ${refs.videos.join(', ')} (attached)`,
    'Reference videos',
  );
  field(
    !!refs.logo.trim(),
    () => `Logo: ${refs.logo.trim()} (attached)`,
    'Logo',
  );
  field(
    refs.colours.length > 0,
    () => `Brand colours: ${refs.colours.join(', ')}`,
    'Brand colours',
  );
  field(
    !!refs.fonts.trim(),
    () => `Brand fonts: ${refs.fonts.trim()}`,
    'Brand fonts',
  );
  // Freedom and locks.
  field(
    !!form.freedom,
    () => `Freedom: ${FREEDOM_TEXT[form.freedom as BriefFreedom]}`,
    'Freedom level (default Guided: follow the style, add your creativity)',
  );
  const locks = (
    [
      ['script', 'the script'],
      ['style', 'the style'],
      ['colours', 'the colours'],
      ['length', 'the length'],
    ] as const
  )
    .filter(([key]) => form.locks[key])
    .map(([, name]) => name);
  if (locks.length) locked.push(`Do not change: ${locks.join(', ')}.`);
  // Assets (the library and stock first is always the rule).
  const assets = form.assets;
  if (assets.onlyMine)
    locked.push(
      'Assets: use only my files, nothing from the library, stock or AI.',
    );
  else if (assets.aiImages || assets.aiVideos)
    locked.push(
      `AI-generated assets allowed as a last resort: up to ${assets.aiImages} image(s) and ${assets.aiVideos} video(s).`,
    );
  // Voice and music.
  field(
    !!form.voice,
    () =>
      `Voice: ${
        form.voice === 'mine'
          ? 'my voice-over'
          : form.voice === 'ai'
            ? 'an AI voice (when the editor has one; until then leave a voice-over slot)'
            : 'none'
      }`,
    'Voice',
  );
  field(
    !!form.music,
    () =>
      `Music: ${
        form.music === 'mine'
          ? `my file ${form.musicFile.trim() || '(name not given)'} (attached)`
          : form.music === 'library'
            ? 'from the editor library'
            : 'none'
      }`,
    'Music',
  );
  field(
    !!form.extra.trim(),
    () => `Extra notes:\n${form.extra.trim()}`,
    'Extra notes',
  );
  return { locked, free };
}

/** Whether the user filled anything at all (an empty form = today's brief). */
export function briefFormFilled(form: BriefFormValues): boolean {
  const { locked } = briefSections(
    form,
    form.styleId ? { id: form.styleId, name: '' } : null,
  );
  return locked.length > 0;
}

export const ASSET_RULE =
  'Assets: use the editor library first, then stock; AI-generated images or videos only as a last resort and only within the numbers allowed (0 means none).';

/** The `=== BRIEF ===` section. */
export function briefSectionText(
  form: BriefFormValues,
  style: BriefStyleInfo | null,
): string {
  const { locked, free } = briefSections(form, style);
  const files = briefFilesText(form);
  return [
    '=== BRIEF ===',
    'Rule: everything under LOCKED is a hard requirement. Everything under FREE is yours to decide.',
    '',
    'LOCKED',
    ...(locked.length ? locked.map((line) => `- ${line}`) : ['- (nothing)']),
    '',
    'FREE (you decide)',
    ...(free.length ? [`- ${free.join(', ')}`] : ['- (nothing)']),
    '',
    ASSET_RULE,
    ...(files ? ['', files] : []),
    '=== END BRIEF ===',
  ].join('\n');
}
