// V7 (spec 11.5): provider 2, the browser's own voices (speechSynthesis).
// Preview only: a page cannot record what speechSynthesis says, so Save is
// disabled for these voices and the panel says why.
import { PAUSE_MARK, type TtsVoice, type VoiceProvider } from './types';

const synth = () =>
  typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
const voicesNow = () =>
  new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const engine = synth();
    if (!engine) return resolve([]);
    const list = engine.getVoices();
    if (list.length) return resolve(list);
    const done = () => resolve(engine.getVoices());
    engine.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
const native = async (voice: TtsVoice) =>
  (await voicesNow()).find((item) => item.voiceURI === voice.id) ?? null;
const languageName = (code: string) => {
  try {
    return (
      new Intl.DisplayNames([navigator.language || 'en'], {
        type: 'language',
      }).of(code) ?? code
    );
  } catch {
    return code;
  }
};
const speak = async (text: string, voice: TtsVoice, rate: number) => {
  const engine = synth();
  if (!engine) throw new Error('This browser has no speech voices.');
  engine.cancel();
  const chosen = await native(voice);
  for (const part of text.split(PAUSE_MARK)) {
    if (part.trim()) {
      const utterance = new SpeechSynthesisUtterance(part);
      if (chosen) utterance.voice = chosen;
      utterance.lang = voice.language;
      utterance.rate = rate;
      engine.speak(utterance);
    }
  }
};

export const browserVoices: VoiceProvider = {
  id: 'browser',
  label: 'Browser voices',
  canSave: false,
  async languages() {
    const codes = [
      ...new Set((await voicesNow()).map((voice) => voice.lang)),
    ].sort();
    return codes.map((code) => ({ code, name: languageName(code) }));
  },
  async voices(language) {
    return (await voicesNow())
      .filter((voice) => voice.lang === language)
      .map((voice) => ({
        id: voice.voiceURI,
        name: voice.name,
        description: voice.localService ? 'On this device' : 'Online voice',
        language: voice.lang,
      }));
  },
  sample: (voice) => speak(voice.name, voice, 1),
  preview: (text, voice, options) => speak(text, voice, options.speed),
  synthesize: () =>
    Promise.reject(new Error('Browser voices are preview only.')),
  stop: () => synth()?.cancel(),
};
