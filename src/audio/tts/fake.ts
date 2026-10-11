// V7 (spec 11.5): a deterministic voice provider for tests (the sandbox
// cannot download voice models). Each character is a short tone whose
// pitch follows the letter, a "[pause]" is one second of silence, and the
// speed divides the length, so the audio's length and content are exact.
import { speechParts, type VoiceProvider } from './types';

const RATE = 48_000;
const CHAR = 0.06;
export const fakeVoices: VoiceProvider = {
  id: 'test',
  label: 'Test voices',
  canSave: true,
  languages: async () => [
    { code: 'en-US', name: 'English (United States)' },
    { code: 'hi-IN', name: 'Hindi (India)' },
  ],
  voices: async (language) =>
    language === 'hi-IN'
      ? [
          {
            id: 'test-asha',
            name: 'Asha',
            description: 'Calm, clear',
            language,
          },
        ]
      : [
          {
            id: 'test-ava',
            name: 'Ava',
            description: 'Warm, friendly',
            language,
          },
          {
            id: 'test-leo',
            name: 'Leo',
            description: 'Deep, steady',
            language,
          },
        ],
  sample: async () => undefined,
  preview: async () => undefined,
  async synthesize(text, voice, options) {
    const parts = speechParts(text);
    const seconds =
      parts.reduce((sum, part) => sum + part.length * CHAR, 0) +
      (parts.length - 1);
    const length = Math.max(1, Math.round((seconds / options.speed) * RATE));
    const buffer = new AudioBuffer({
      length,
      sampleRate: RATE,
      numberOfChannels: 1,
    });
    const data = buffer.getChannelData(0);
    const base = voice.id === 'test-leo' ? 0.6 : 1;
    let at = 0;
    for (const [index, part] of parts.entries()) {
      for (const char of part) {
        const hz = (200 + (char.charCodeAt(0) % 40) * 12) * base;
        const n = Math.round((CHAR / options.speed) * RATE);
        for (let i = 0; i < n && at + i < length; i++)
          data[at + i] = 0.3 * Math.sin((2 * Math.PI * hz * i) / RATE);
        at += n;
      }
      if (index < parts.length - 1) at += Math.round(RATE / options.speed);
    }
    return buffer;
  },
  stop: () => undefined,
};
