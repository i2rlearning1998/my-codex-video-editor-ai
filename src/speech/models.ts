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
/** The active Whisper variant's files, served from Hugging Face. */
export const WHISPER_FILES: readonly ModelFile[] = whisper.files.map((f) => ({
  id: `whisper-${whisperConfig.active}/${f.path}`,
  url: `https://huggingface.co/${whisper.model}/resolve/${whisper.revision ?? whisperConfig.revision}/${f.path}`,
  sizeBytes: f.sizeBytes,
  sha256: f.sha256,
  license: whisperConfig.license,
}));
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
