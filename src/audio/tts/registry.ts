// V7 (spec 11.5): the voice providers the panel offers. The offline neural
// engine (Piper) is not shipped: its phonemizer, espeak-ng, is GPL, which
// this project does not take (D-214). Tests register a deterministic fake
// provider through the dev/test-only hook below.
import { browserVoices } from './browser';
import { fakeVoices } from './fake';
import type { VoiceProvider } from './types';

export function voiceProviders(): readonly VoiceProvider[] {
  const test = (window as { __AIVE_E2E_TTS__?: boolean }).__AIVE_E2E_TTS__;
  return test ? [fakeVoices, browserVoices] : [browserVoices];
}
