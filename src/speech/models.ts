import whisperConfig from './whisper-models.json';
/**
 * A downloadable model file. Pinned files carry their exact size and SHA-256
 * (`npm run models:pin`); until then `sha256` is null and the loader checks
 * the size only (FINAL2 U11, owner decision).
 */
export interface ModelFile {
  id: string;
  url: string;
  sizeBytes: number | null;
  sha256: string | null;
  license: string;
}
export interface LocalModelConfig {
  id: string;
  files: readonly ModelFile[];
  languages: readonly string[];
  blocker?: string;
  /** Shown before the first download when the files' sizes are not pinned. */
  approxBytes?: number;
  /** The Hugging Face model id the runner loads. */
  model?: string;
  /** True when every file has a pinned SHA-256. */
  pinned?: boolean;
}
type WhisperVariant = {
  model: string;
  revision?: string;
  approxBytes: number;
  files: { path: string; sizeBytes: number | null; sha256: string | null }[];
};
const whisper = (
  whisperConfig.variants as unknown as Record<string, WhisperVariant>
)[whisperConfig.active]!;
export const DEFAULT_MODEL_HOST = 'https://huggingface.co';
const SOURCE_KEY = 'aive.model-source';
/** FIX4 A6: the saved model host (a mirror or your own server), or the default. */
export function modelHost(): string {
  try {
    const saved = localStorage.getItem(SOURCE_KEY)?.trim();
    if (saved && /^https:\/\/[^\s]+$/.test(saved))
      return saved.replace(/\/+$/, '');
  } catch {
    /* Storage blocked: the default host. */
  }
  return DEFAULT_MODEL_HOST;
}
/** Saves the model host; an empty or invalid value returns to the default. */
export function setModelHost(value: string): boolean {
  const clean = value.trim().replace(/\/+$/, '');
  try {
    if (!clean || clean === DEFAULT_MODEL_HOST) {
      localStorage.removeItem(SOURCE_KEY);
      return true;
    }
    if (!/^https:\/\/[^\s]+$/.test(clean)) return false;
    localStorage.setItem(SOURCE_KEY, clean);
    return true;
  } catch {
    return false;
  }
}
/** The active Whisper variant's files, from the saved model host. */
export const whisperFiles = (host = modelHost()): readonly ModelFile[] =>
  whisper.files.map((f) => ({
    id: `whisper-${whisperConfig.active}/${f.path}`,
    url: `${host}/${whisper.model}/resolve/${whisper.revision ?? whisperConfig.revision}/${f.path}`,
    sizeBytes: f.sizeBytes,
    sha256: f.sha256,
    license: whisperConfig.license,
  }));
/** The active Whisper variant's files, served from Hugging Face. */
export const WHISPER_FILES: readonly ModelFile[] =
  whisperFiles(DEFAULT_MODEL_HOST);
export const LOCAL_MODELS: readonly LocalModelConfig[] = [
  {
    id: 'local-tts',
    files: [],
    languages: ['en'],
    blocker:
      'No permissively licensed English voice without an eSpeak (GPL) phonemizer was verified; SpeechT5 needs a speaker embedding whose licence is confirmed. See docs/SPEECH-API.md, FINAL1 Step 5.',
  },
  {
    // FINAL2 U11: downloadable in the user's browser from Hugging Face.
    id: 'local-whisper',
    files: WHISPER_FILES,
    languages: ['en', 'hi'],
    model: whisper.model,
    approxBytes: whisper.approxBytes,
    pinned: WHISPER_FILES.every((f) => !!f.sha256),
  },
];
/** Research URLs are not runtime download URLs and never imply verified artefacts. */
export const MODEL_CANDIDATES = {
  tts: {
    url: 'https://huggingface.co/Xenova/speecht5_tts',
    publishedApproxBytes: 177800000,
    sha256: null,
    license: 'MIT (model); example speaker embedding unverified',
  },
  stt: {
    url: 'https://huggingface.co/Xenova/whisper-tiny',
    publishedApproxBytes: 40800000,
    sha256: null,
    license: 'MIT original model; Apache-2.0 conversion card',
  },
} as const;
