// V7 (Clipchamp clone spec 11.5): the text to speech provider interface.
// A provider lists languages and voices, plays a short sample and turns
// text into audio. Providers that cannot hand the audio over (the
// browser's own voices) are preview only.
export interface TtsVoice {
  readonly id: string;
  readonly name: string;
  /** A short description, such as "Warm, friendly". */
  readonly description: string;
  readonly language: string;
}
export interface TtsLanguage {
  readonly code: string;
  readonly name: string;
}
export interface TtsOptions {
  /** 0.5 to 2. */
  readonly speed: number;
}
export interface VoiceProvider {
  readonly id: string;
  readonly label: string;
  /** False: Preview works, Save does not (the audio stays in the browser). */
  readonly canSave: boolean;
  languages(): Promise<readonly TtsLanguage[]>;
  voices(language: string): Promise<readonly TtsVoice[]>;
  /** Plays a short sample of the voice. */
  sample(voice: TtsVoice): Promise<void>;
  /** Plays the text without keeping it. */
  preview(text: string, voice: TtsVoice, options: TtsOptions): Promise<void>;
  /** The speech as audio (only when `canSave`). */
  synthesize(
    text: string,
    voice: TtsVoice,
    options: TtsOptions,
  ): Promise<AudioBuffer>;
  /** Stops a sample or preview that is playing. */
  stop(): void;
}

/** "[pause]" in the text is a one-second pause. */
export const PAUSE_MARK = '[pause]';
export const MAX_TTS_TEXT = 5000;
/** The text split at pause marks. */
export const speechParts = (text: string) =>
  text.split(PAUSE_MARK).map((part) => part.trim());
