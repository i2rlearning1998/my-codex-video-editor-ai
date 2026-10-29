import { describe, expect, it } from 'vitest';
import {
  captionLayout,
  captionMaxChars,
  CAPTION_STYLES,
} from '../src/captions';
import { toCaptionCues } from '../src/speech/captions';
import {
  setWhisperVariant,
  whisperFiles,
  whisperVariant,
  WHISPER_VARIANTS,
} from '../src/speech/models';

// FIX9-005: captions fit their canvas, and the Whisper models are the
// multilingual ones (Hindi works), chosen by the owner, never the person.
describe('[FIX9-005] captions and Whisper models', () => {
  it('[FIX9-005] every Whisper variant is multilingual; small is the default and the owner can switch', () => {
    expect([...WHISPER_VARIANTS].sort()).toEqual(['base', 'small', 'tiny']);
    expect(whisperVariant()).toBe('small');
    for (const name of WHISPER_VARIANTS) {
      expect(setWhisperVariant(name)).toBe(true);
      const urls = whisperFiles().map((file) => file.url);
      expect(urls.every((url) => !/\.en\//.test(url))).toBe(true);
      expect(urls[0]).toContain(`whisper-${name}`);
    }
    expect(setWhisperVariant('nonsense')).toBe(false);
    expect(setWhisperVariant(null)).toBe(false);
    setWhisperVariant('small');
  });

  it('[FIX9-005] a caption line is as long as the canvas lets it be, so nothing wraps inside its box and gets cut', () => {
    for (const style of Object.values(CAPTION_STYLES)) {
      for (const canvas of [
        { width: 1080, height: 1920 },
        { width: 1920, height: 1080 },
        { width: 1080, height: 1080 },
        { width: 1080, height: 1350 },
      ]) {
        for (const language of ['en', 'hi']) {
          const chars = captionMaxChars(style, canvas, language);
          const layout = captionLayout(style, 1, canvas);
          // The longest line, at a wide average letter, fits the text box.
          const advance = language === 'hi' ? 0.66 : 0.58;
          expect(
            chars * layout.fontSize * advance,
            `${style.id} ${canvas.width}x${canvas.height} ${language}`,
          ).toBeLessThanOrEqual(layout.width - layout.pad * 2 + 1);
          expect(chars).toBeLessThanOrEqual(style.maxCharsPerLine);
        }
      }
    }
    // A tall video gets shorter lines than a wide one, never the old fixed 42.
    const style = CAPTION_STYLES.clean;
    expect(
      captionMaxChars(style, { width: 1080, height: 1920 }, 'hi'),
    ).toBeLessThan(captionMaxChars(style, { width: 1920, height: 1080 }, 'en'));
  });

  it('[FIX9-005] captions on a tall video are not scaled by its height (they were 1.8 times too big)', () => {
    const style = CAPTION_STYLES.clean;
    const tall = captionLayout(style, 2, { width: 1080, height: 1920 });
    const wide = captionLayout(style, 2, { width: 1920, height: 1080 });
    expect(tall.fontSize).toBe(wide.fontSize);
  });

  it('[FIX9-005] a Hindi cue cut for a narrow canvas keeps every word and stays within its lines', () => {
    const text =
      'यह एक बहुत लंबा वाक्य है जो संकरे वीडियो पर कई पंक्तियों में बँटना चाहिए';
    const words = text.split(' ').map((w, i) => ({
      text: w,
      start: i * 0.3,
      end: i * 0.3 + 0.28,
    }));
    const style = CAPTION_STYLES.clean;
    const chars = captionMaxChars(style, { width: 1080, height: 1920 }, 'hi');
    const cues = toCaptionCues(
      { text, language: 'hi', segments: [], words },
      { maxCharsPerLine: chars, maxLines: style.maxLines },
    );
    expect(cues.flatMap((cue) => cue.lines).join(' ')).toBe(text);
    for (const cue of cues) {
      expect(cue.lines.length).toBeLessThanOrEqual(style.maxLines);
      for (const line of cue.lines)
        expect(Array.from(line).length).toBeLessThanOrEqual(chars);
    }
  });
});
