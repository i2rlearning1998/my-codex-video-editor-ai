import { describe, it, expect } from 'vitest';
import { toCaptionCues, type Transcription } from '../../src/speech';
const result: Transcription = {
  text: 'Hello world again',
  language: 'en',
  segments: [],
  words: [
    { start: 0, end: 0.4, text: 'Hello' },
    { start: 0.5, end: 1, text: 'world' },
    { start: 1.1, end: 1.8, text: 'again' },
  ],
};
describe('caption cues', () => {
  it('bounds lines and preserves word highlights without mutating input', () => {
    const cues = toCaptionCues(result, { maxCharsPerLine: 5, maxDuration: 2 });
    expect(cues.map((c) => c.lines)).toEqual([['Hello', 'world'], ['again']]);
    expect(cues.flatMap((c) => c.words)).toEqual(result.words);
    expect(result.words).toHaveLength(3);
  });
  it('splits cues at the maximum duration', () => {
    const cues = toCaptionCues(result, { maxDuration: 1, minDuration: 0.1 });
    expect(cues).toHaveLength(2);
    expect(cues.every((c) => c.end - c.start <= 1)).toBe(true);
  });
  it('extends a short last cue to the minimum duration', () => {
    const cues = toCaptionCues({
      text: 'Hi',
      language: 'en',
      segments: [{ start: 0, end: 0.1, text: 'Hi' }],
    });
    expect(cues[0]?.end).toBe(0.5);
    expect(cues[0]?.words).toEqual([]);
  });
  it('keeps Hindi text and original word timing', () => {
    const words = [
      { start: 0, end: 0.4, text: 'नमस्ते' },
      { start: 0.5, end: 1, text: 'दुनिया' },
    ];
    expect(
      toCaptionCues({
        text: 'नमस्ते दुनिया',
        language: 'hi',
        segments: words,
        words,
      })[0]?.words,
    ).toEqual(words);
  });
  it('reports impossible layouts instead of silently losing text or timing', () => {
    expect(() => toCaptionCues(result, { maxCharsPerLine: 2 })).toThrow();
    expect(() =>
      toCaptionCues(result, { minDuration: 2, maxDuration: 1 }),
    ).toThrow();
    expect(() =>
      toCaptionCues({
        text: 'x',
        language: 'en',
        segments: [{ start: 0, end: 10, text: 'x' }],
      }),
    ).toThrow();
  });
});
