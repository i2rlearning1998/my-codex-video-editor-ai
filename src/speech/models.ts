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
      'SpeechT5 example speaker embedding licence and pinned artifact hashes have not been verified; no browser runner is installed.',
  },
  {
    id: 'local-whisper',
    files: [],
    languages: ['en', 'hi'],
    blocker:
      'Whisper tiny artifact metadata retrieval failed; exact file hashes and a matching lazy browser runner are not yet installed.',
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
