/** Only reviewed, exact-size SHA-256-pinned files may become downloadable. */
export interface ModelFile {
  id: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  license: string;
}
export interface LocalModelConfig {
  id: string;
  files: readonly ModelFile[];
  languages: readonly string[];
  blocker?: string;
}
export const LOCAL_MODELS: readonly LocalModelConfig[] = [
  {
    id: 'local-tts',
    files: [],
    languages: ['en'],
    blocker:
      'No permissively licensed English voice without an eSpeak (GPL) phonemizer was verified; SpeechT5 needs a speaker embedding whose licence is confirmed. See docs/SPEECH-API.md, FINAL1 Step 5.',
  },
  {
    id: 'local-whisper',
    files: [],
    languages: ['en', 'hi'],
    blocker:
      'huggingface.co is refused by the build environment, so official Whisper tiny file hashes cannot be pinned; the owner can host the files listed in docs/SPEECH-API.md, FINAL1 Step 5.',
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
